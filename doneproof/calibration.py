"""Evaluate verification plans against a controlled set of seeded faults."""
from __future__ import annotations

from typing import Any

from doneproof.login_fixture import (
    FIXTURE_ID,
    IMPLEMENTATIONS,
    MUTANT_IDS,
    SCENARIOS,
)

MAX_CHECKS = 8


def validate_calibration_plan(
    plan: Any,
    *,
    fixture_id: str = FIXTURE_ID,
) -> dict[str, Any]:
    """Validate a plan before running it against the controlled fixture."""
    if not isinstance(plan, dict):
        raise ValueError("plan must be an object")

    if fixture_id != FIXTURE_ID:
        raise ValueError(f"unsupported fixture_id: {fixture_id}")

    task_summary = plan.get("task_summary")
    if not isinstance(task_summary, str) or not task_summary.strip():
        raise ValueError("plan.task_summary must be a non-empty string")

    checks = plan.get("checks")
    if not isinstance(checks, list) or not checks:
        raise ValueError("plan.checks must be a non-empty list")
    if len(checks) > MAX_CHECKS:
        raise ValueError(f"plan may contain at most {MAX_CHECKS} checks")

    normalized_checks: list[dict[str, str]] = []
    seen_scenarios: set[str] = set()

    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            raise ValueError(f"plan.checks[{index}] must be an object")

        if check.get("kind") != "behavioral_scenario":
            raise ValueError(
                f"plan.checks[{index}].kind must be 'behavioral_scenario'"
            )

        scenario_id = check.get("scenario_id")
        if not isinstance(scenario_id, str) or scenario_id not in SCENARIOS:
            raise ValueError(
                f"plan.checks[{index}].scenario_id is not supported"
            )
        if scenario_id in seen_scenarios:
            raise ValueError(f"duplicate scenario_id: {scenario_id}")

        scenario = SCENARIOS[scenario_id]
        expected_evidence = (
            "The login attempt succeeds."
            if scenario.expected_success
            else "The login attempt is rejected."
        )

        # Scenario semantics come from the trusted fixture, not model prose.
        seen_scenarios.add(scenario_id)
        normalized_checks.append({
            "kind": "behavioral_scenario",
            "scenario_id": scenario_id,
            "description": scenario.description,
            "expected_evidence": expected_evidence,
        })

    if "valid_credentials" not in seen_scenarios:
        raise ValueError(
            "plan must include the valid_credentials positive control"
        )

    return {
        "task_summary": task_summary.strip()[:500],
        "checks": normalized_checks,
    }


def calibrate_plan(
    plan: Any,
    *,
    fixture_id: str = FIXTURE_ID,
) -> dict[str, Any]:
    """Measure which known seeded faults are detected by a valid plan.

    A mutant is detected when a selected scenario produces an outcome different
    from the scenario's expected outcome. Results apply only to this fixture.
    """
    validated_plan = validate_calibration_plan(plan, fixture_id=fixture_id)
    scenario_ids = [
        check["scenario_id"] for check in validated_plan["checks"]
    ]

    baseline_results: list[dict[str, Any]] = []
    correct_implementation = IMPLEMENTATIONS["correct"]

    for scenario_id in scenario_ids:
        scenario = SCENARIOS[scenario_id]
        actual = correct_implementation(
            scenario.username,
            scenario.password,
            scenario.account_active,
        )
        passed = actual == scenario.expected_success

        baseline_results.append({
            "scenario_id": scenario_id,
            "passed": passed,
            "expected_success": scenario.expected_success,
            "actual_success": actual,
        })

    if not all(result["passed"] for result in baseline_results):
        raise RuntimeError(
            "known-correct implementation failed a selected scenario"
        )

    mutant_results: list[dict[str, Any]] = []

    for mutant_id in MUTANT_IDS:
        implementation = IMPLEMENTATIONS[mutant_id]
        killed_by: list[str] = []

        for scenario_id in scenario_ids:
            scenario = SCENARIOS[scenario_id]
            actual = implementation(
                scenario.username,
                scenario.password,
                scenario.account_active,
            )
            if actual != scenario.expected_success:
                killed_by.append(scenario_id)

        mutant_results.append({
            "mutant_id": mutant_id,
            "killed": bool(killed_by),
            "killed_by": killed_by,
        })

    total_mutants = len(mutant_results)
    killed_count = sum(result["killed"] for result in mutant_results)
    escaped_count = total_mutants - killed_count

    return {
        "task_summary": validated_plan["task_summary"],
        "fixture_id": fixture_id,
        "status": "CALIBRATED" if escaped_count == 0 else "BLIND_SPOTS_FOUND",
        "baseline": {
            "passed": True,
            "scenario_count": len(baseline_results),
            "results": baseline_results,
        },
        "scenario_coverage": {
            "selected": len(scenario_ids),
            "available": len(SCENARIOS),
            "selected_ids": scenario_ids,
        },
        "mutation_testing": {
            "total_mutants": total_mutants,
            "killed": killed_count,
            "escaped": escaped_count,
            "mutation_score_percent": round(
                100.0 * killed_count / total_mutants, 2
            ),
            "results": mutant_results,
        },
        "limitations": [
            "Results apply only to this predefined fixture and its seeded faults.",
            "A perfect mutation score does not prove general correctness.",
            "Only supported behavioral_scenario checks are evaluated.",
            "Model-generated claims are not evidence that a check passed.",
        ],
    }
