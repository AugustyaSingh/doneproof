
"""Repeatable reference benchmark for the calibration engine.

This checks deterministic reference plans against expected mutant-kill sets.
It does not measure Gemma plan quality or prove general correctness.
"""
from __future__ import annotations

import json
import argparse
import os
import statistics
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from doneproof.calibration import calibrate_plan
from doneproof.login_fixture import FIXTURE_ID, MUTANT_IDS, SCENARIOS


BENCHMARK_ID = "doneproof-login-reference-v1"
LIVE_BENCHMARK_ID = "doneproof-login-gemma-live-v1"
LIVE_PROMPT_VERSION = "doneproof.login-calibration-prompt.v1"
CORPUS_PATH = Path(__file__).parent.parent / "benchmarks" / "login-auth-v1.json"


def load_live_corpus() -> dict[str, Any]:
    """Load versioned labels and fail closed if they drift from the fixture."""
    from doneproof.login_fixture import IMPLEMENTATIONS

    try:
        corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("Could not load the versioned live benchmark corpus") from exc
    if not isinstance(corpus, dict) or corpus.get("corpus_version") != "doneproof-benchmark-corpus.v1":
        raise RuntimeError("Unsupported or malformed live benchmark corpus version")
    if corpus.get("benchmark_id") != LIVE_BENCHMARK_ID or corpus.get("fixture_id") != FIXTURE_ID:
        raise RuntimeError("Live benchmark corpus identity does not match the fixture")
    oracle = corpus.get("oracle", {})
    declared_mutants = oracle.get("faulty_implementations") if isinstance(oracle, dict) else None
    if set(declared_mutants or ()) != set(MUTANT_IDS) or "correct" not in IMPLEMENTATIONS:
        raise RuntimeError("Benchmark corpus fault labels do not match the controlled fixture")
    expected_scenarios = oracle.get("expected_scenarios") if isinstance(oracle, dict) else None
    if not isinstance(expected_scenarios, list):
        raise RuntimeError("Benchmark corpus is missing trusted scenario labels")
    labels = {item.get("scenario_id"): item.get("expected_success") for item in expected_scenarios if isinstance(item, dict)}
    fixture_labels = {scenario_id: scenario.expected_success for scenario_id, scenario in SCENARIOS.items()}
    if labels != fixture_labels:
        raise RuntimeError("Benchmark corpus scenario labels do not match the reviewed fixture oracle")
    task = corpus.get("task")
    if not isinstance(task, dict) or not isinstance(task.get("description"), str) or not isinstance(task.get("project_context"), str):
        raise RuntimeError("Benchmark corpus task description or context is invalid")
    return corpus


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    description: str
    scenario_ids: tuple[str, ...]
    expected_killed_mutants: tuple[str, ...]


CASES = (
    BenchmarkCase(
        case_id="positive_control_only",
        description="Checks valid login behavior only.",
        scenario_ids=("valid_credentials",),
        expected_killed_mutants=("rejects_valid_login",),
    ),
    BenchmarkCase(
        case_id="password_boundary",
        description="Checks valid credentials and a wrong password.",
        scenario_ids=("valid_credentials", "wrong_password"),
        expected_killed_mutants=(
            "rejects_valid_login",
            "accepts_wrong_password",
        ),
    ),
    BenchmarkCase(
        case_id="credential_edge_cases",
        description="Also checks that an empty password is rejected.",
        scenario_ids=(
            "valid_credentials",
            "wrong_password",
            "empty_password",
        ),
        expected_killed_mutants=(
            "rejects_valid_login",
            "accepts_wrong_password",
            "accepts_empty_password",
        ),
    ),
    BenchmarkCase(
        case_id="full_scenario_suite",
        description="Checks every scenario in the login fixture.",
        scenario_ids=tuple(SCENARIOS),
        expected_killed_mutants=tuple(MUTANT_IDS),
    ),
)


def _build_plan(case: BenchmarkCase) -> dict[str, Any]:
    """Build a deterministic plan from trusted benchmark definitions."""
    return {
        "task_summary": f"Reference benchmark case: {case.case_id}",
        "checks": [
            {
                "kind": "behavioral_scenario",
                "scenario_id": scenario_id,
            }
            for scenario_id in case.scenario_ids
        ],
    }


def run_benchmark() -> dict[str, Any]:
    """Run all reference cases and compare outcomes with expectations."""
    results: list[dict[str, Any]] = []

    for case in CASES:
        report = calibrate_plan(
            _build_plan(case),
            fixture_id=FIXTURE_ID,
        )

        actual_killed = [
            result["mutant_id"]
            for result in report["mutation_testing"]["results"]
            if result["killed"]
        ]
        actual_escaped = [
            result["mutant_id"]
            for result in report["mutation_testing"]["results"]
            if not result["killed"]
        ]
        expected_killed = [
            mutant_id
            for mutant_id in MUTANT_IDS
            if mutant_id in case.expected_killed_mutants
        ]

        matches_expected = actual_killed == expected_killed

        results.append({
            "case_id": case.case_id,
            "description": case.description,
            "scenario_ids": list(case.scenario_ids),
            "baseline_passed": report["baseline"]["passed"],
            "expected_killed_mutants": expected_killed,
            "actual_killed_mutants": actual_killed,
            "escaped_mutants": actual_escaped,
            "mutation_score_percent": (
                report["mutation_testing"]["mutation_score_percent"]
            ),
            "matches_expected": matches_expected,
        })

    matched_count = sum(
        result["matches_expected"] for result in results
    )

    return {
        "benchmark_id": BENCHMARK_ID,
        "fixture_id": FIXTURE_ID,
        "scope": (
            "Deterministic reference plans evaluated against one "
            "predefined login fixture."
        ),
        "summary": {
            "case_count": len(results),
            "expectations_met": matched_count,
            "expectations_failed": len(results) - matched_count,
            "all_expected_outcomes_matched": (
                matched_count == len(results)
            ),
        },
        "results": results,
        "limitations": [
            "Reference plans are predefined, not generated by Gemma.",
            "The cases cover only the login-auth-v1 fixture.",
            "Mutation scores reflect only the predefined seeded faults.",
            "Passing this benchmark does not prove general correctness.",
        ],
    }


def _repository_revision() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True,
            timeout=5, check=True,
        )
        value = result.stdout.strip()
        return value or None
    except (OSError, subprocess.SubprocessError):
        return None


def _genai_sdk_version() -> str | None:
    try:
        return version("google-genai")
    except PackageNotFoundError:
        return None


def _metric_percent(numerator: int, denominator: int) -> float | None:
    return round(100.0 * numerator / denominator, 2) if denominator else None


def compute_live_metrics(
    *, repeats: int, valid_plans: int, actionable_checks: int, proposed_checks: int,
    scenario_count: int, selected_scenarios: int, mutant_kills: int,
    mutant_trials: int, false_positive_checks: int, baseline_checks: int,
    latencies_ms: list[float], token_usage: dict[str, int],
    usage_field_runs: dict[str, int], usage_runs: int,
) -> dict[str, Any]:
    """Pure, denominator-explicit metrics for testable live-run aggregation."""
    return {
        "plan_schema_valid_rate_percent": _metric_percent(valid_plans, repeats),
        "actionable_scenario_rate_percent": _metric_percent(actionable_checks, proposed_checks),
        "mean_scenario_coverage_percent": _metric_percent(selected_scenarios, scenario_count * valid_plans),
        "defect_detection_rate_percent": _metric_percent(mutant_kills, mutant_trials),
        "false_positive_rate_percent": _metric_percent(false_positive_checks, baseline_checks),
        "execution_failure_rate_percent": _metric_percent(repeats - valid_plans, repeats),
        "mean_latency_ms": round(statistics.mean(latencies_ms), 2) if latencies_ms else None,
        "usage": {
            **{key: value if usage_field_runs.get(key, 0) else None for key, value in token_usage.items()},
            "field_reported_runs": usage_field_runs,
            "reported_runs": usage_runs,
            "total_is_partial": any(usage_field_runs.get(key, 0) < valid_plans for key in token_usage),
        },
    }


def _count_proposed_and_actionable_checks(raw_output: Any) -> tuple[int, int]:
    """Count model-emitted fixture selectors without treating text as evidence."""
    if not isinstance(raw_output, str):
        return 0, 0
    from doneproof.gemma_planner import _parse_json_object
    try:
        checks = _parse_json_object(raw_output).get("checks")
    except (ValueError, json.JSONDecodeError):
        return 0, 0
    if not isinstance(checks, list):
        return 0, 0
    actionable_ids: set[str] = set()
    for check in checks:
        if not isinstance(check, dict) or check.get("kind") != "behavioral_scenario":
            continue
        scenario_id = check.get("scenario_id")
        if isinstance(scenario_id, str) and scenario_id in SCENARIOS:
            actionable_ids.add(scenario_id)
    return len(checks), len(actionable_ids)


def run_live_benchmark(*, repeats: int = 3, model: str | None = None) -> dict[str, Any]:
    """Call the real configured Gemma API for every repeat and score its plan.

    No cache, handcrafted fallback, or injected provider is accepted here.
    Errors are recorded as attempts and do not disappear from the denominator.
    """
    if not isinstance(repeats, int) or isinstance(repeats, bool) or not 1 <= repeats <= 20:
        raise ValueError("repeats must be an integer from 1 to 20")
    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is not set; live evaluation requires a real API key")

    from doneproof.gemma_planner import (
        CALIBRATION_PLAN_SCHEMA_VERSION,
        PLAN_SCHEMA_VERSION,
        _resolve_client,
        _selected_model,
        suggest_calibration_plan,
    )

    selected_model = _selected_model(model)
    corpus = load_live_corpus()
    task_data = corpus["task"]
    client = _resolve_client(None)
    attempts: list[dict[str, Any]] = []
    latency_samples: list[float] = []
    valid_count = actionable_checks = proposed_checks = scenario_selected = mutant_kills = mutant_trials = 0
    false_positive_checks = baseline_checks = 0
    token_fields = {"prompt_tokens": 0, "candidate_tokens": 0, "total_tokens": 0}
    usage_field_runs = {key: 0 for key in token_fields}
    usage_runs = 0

    for run_index in range(repeats):
        started = time.perf_counter()
        try:
            plan = suggest_calibration_plan(
                task_data["description"], fixture_id=FIXTURE_ID,
                client=client, model=selected_model, project_context=task_data["project_context"],
                include_raw_output=True,
            )
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            report = calibrate_plan(plan, fixture_id=FIXTURE_ID)
            checks = plan["checks"]
            valid_count += 1
            scenario_selected += len({check["scenario_id"] for check in checks})
            mutation = report["mutation_testing"]
            mutant_kills += mutation["killed"]
            mutant_trials += mutation["total_mutants"]
            baseline_checks += report["baseline"]["scenario_count"]
            false_positive_checks += sum(not item["passed"] for item in report["baseline"]["results"])
            generation = plan.pop("generation", {})
            proposed, actionable = _count_proposed_and_actionable_checks(generation.get("raw_output"))
            proposed_checks += proposed
            actionable_checks += actionable
            usage = generation.get("usage") or {}
            if usage:
                usage_runs += 1
                for key in token_fields:
                    if isinstance(usage.get(key), int):
                        token_fields[key] += usage[key]
                        usage_field_runs[key] += 1
            attempts.append({
                "run": run_index + 1,
                "status": "scored",
                "plan": plan,
                "evaluation": report,
                "generation": generation,
            })
        except (ValueError, RuntimeError) as exc:
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            raw_output = getattr(exc, "raw_output", None)
            proposed, actionable = _count_proposed_and_actionable_checks(raw_output)
            proposed_checks += proposed
            actionable_checks += actionable
            failed_attempt = {"run": run_index + 1, "status": "failed", "error": str(exc)}
            if isinstance(raw_output, str):
                failed_attempt["generated_output"] = raw_output
                failed_attempt["generated_output_truncated"] = bool(getattr(exc, "raw_output_truncated", False))
            attempts.append(failed_attempt)
        latency_samples.append(latency_ms)

    return {
        "artifact_schema_version": "doneproof.evaluation-artifact.v1",
        "benchmark_id": LIVE_BENCHMARK_ID,
        "benchmark_version": corpus["corpus_version"],
        "fixture_id": FIXTURE_ID,
        "mode": "live_gemma",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "repository_revision": _repository_revision(),
        "model": selected_model,
        "prompt_version": LIVE_PROMPT_VERSION,
        "plan_schema_version": CALIBRATION_PLAN_SCHEMA_VERSION,
        "general_verification_plan_schema_version": PLAN_SCHEMA_VERSION,
        "configuration": {
            "repeats": repeats, "api_key_present": True,
            "sdk_package": "google-genai", "sdk_version": _genai_sdk_version(),
            "sdk_retry_attempts": 3, "retryable_http_status_codes": [408, 429, 500, 502, 503, 504],
            "request_timeout_ms": 60000, "temperature": "provider_default",
            "thinking_level": "provider_default",
        },
        "task": task_data,
        "metrics": compute_live_metrics(
            repeats=repeats, valid_plans=valid_count, actionable_checks=actionable_checks,
            proposed_checks=proposed_checks,
            scenario_count=len(SCENARIOS), selected_scenarios=scenario_selected,
            mutant_kills=mutant_kills, mutant_trials=mutant_trials,
            false_positive_checks=false_positive_checks, baseline_checks=baseline_checks,
            latencies_ms=latency_samples, token_usage=token_fields, usage_runs=usage_runs,
            usage_field_runs=usage_field_runs,
        ),
        "metric_denominators": {
            "schema_validity": "valid plans / all requested generations",
            "actionable_scenario_rate": "unique allowlisted behavioral scenario selectors / all scenario check objects in parseable generated plan JSON; unparseable outputs are excluded here and counted in schema validity",
            "scenario_coverage": "unique selected fixture scenarios / (available scenarios × valid plans)",
            "defect_detection": "killed seeded mutants / (4 seeded mutants × valid plans)",
            "false_positives": "failed expected scenarios on the known-correct implementation / selected expected scenarios",
            "execution_failures": "generation, validation, or evaluation failures / all requested generations; no model-authored code is executed",
            "latency": "mean elapsed time per requested generation, including failed calls",
            "token_usage": "sum of provider-reported usage metadata; null/partial usage is explicitly recorded",
        },
        "nondeterminism": "Gemma generations may differ between runs; hosted model behavior and rate limits can change over time.",
        "attempts": attempts,
        "limitations": [
            "This is a live Gemma evaluation on one controlled login task and one toy fixture.",
            "Seeded faults measure scenario selection against known implementation defects; they do not represent broad software bug detection.",
            "Actionable checks are limited to the fixture's enumerated behavioral scenarios.",
            "The trusted fixture's oracle and fault labels are defined in repository code and require independent review.",
            "No model-generated command or code is executed.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run offline calibration controls or a live Gemma evaluation.")
    parser.add_argument("--live", action="store_true", help="Call the real configured Gemma 4 API; requires GEMINI_API_KEY.")
    parser.add_argument("--repeats", type=int, default=3, help="Live generations (1-20; default 3).")
    parser.add_argument("--model", help="Supported Gemma 4 model ID; defaults to DONEPROOF_GEMMA_MODEL.")
    parser.add_argument("--output", type=Path, help="Write a JSON artifact to a new file (existing files are never overwritten).")
    args = parser.parse_args()
    try:
        report = run_live_benchmark(repeats=args.repeats, model=args.model) if args.live else run_benchmark()
        serialized = json.dumps(report, indent=2)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("x", encoding="utf-8") as stream:
                stream.write(serialized + "\n")
            print(f"Wrote {'live evaluation' if args.live else 'offline calibration'} artifact to {args.output}")
        else:
            print(serialized)
        if args.live:
            return 0 if report["metrics"]["plan_schema_valid_rate_percent"] == 100 else 1
        return 0 if report["summary"]["all_expected_outcomes_matched"] else 1
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Benchmark failed: {exc}", file=__import__("sys").stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
