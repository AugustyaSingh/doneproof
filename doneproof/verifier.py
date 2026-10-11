"""Deterministic evaluation of task contracts against observable evidence.

The verifier never executes contract-supplied commands. Facts reported inside
the contract are marked unverified; observed filesystem checks and evaluators
registered by the trusted host are the only sources that can pass a check.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any


CheckEvaluator = Callable[[dict[str, Any], Path], dict[str, Any]]
MAX_JSON_BYTES = 10 * 1024 * 1024
_SHA256_RE = re.compile(r"\A[0-9a-fA-F]{64}\Z")


def _resolve_task_path(path: Any, root: Path, kind: str) -> tuple[Path | None, str | None]:
    if not isinstance(path, str) or not path.strip():
        raise ValueError(f"{kind} checks require a non-empty path")
    candidate = (root / path).resolve()
    if candidate != root and root not in candidate.parents:
        return None, "Rejected path outside task directory"
    return candidate, None


def _path_exists(check: dict[str, Any], root: Path) -> dict[str, Any]:
    kind = "required_file" if check.get("kind") == "required_file" else "path_exists"
    candidate, rejection = _resolve_task_path(check.get("path"), root, kind)
    if rejection:
        return {"passed": False, "trust": "observed", "evidence": rejection}
    assert candidate is not None

    expected_type = "file" if kind == "required_file" else check.get("entry_type", "any")
    if not isinstance(expected_type, str) or expected_type not in {"file", "directory", "any"}:
        raise ValueError("path_exists entry_type must be file, directory, or any")
    is_file = candidate.is_file()
    is_directory = candidate.is_dir()
    exists = is_file or is_directory
    actual_type = "file" if is_file else "directory" if is_directory else None
    passed = exists and (expected_type == "any" or actual_type == expected_type)
    evidence: dict[str, Any] = {
        "path": str(check["path"]),
        "exists": exists,
        "entry_type": actual_type,
    }
    if is_file:
        try:
            evidence["size_bytes"] = candidate.stat().st_size
        except OSError:
            pass
    return {"passed": passed, "trust": "observed", "evidence": evidence}


def _file_sha256(check: dict[str, Any], root: Path) -> dict[str, Any]:
    candidate, rejection = _resolve_task_path(check.get("path"), root, "file_sha256")
    expected = check.get("sha256")
    if not isinstance(expected, str) or not _SHA256_RE.fullmatch(expected):
        raise ValueError("file_sha256 checks require a 64-character hexadecimal sha256")
    if rejection:
        return {"passed": False, "trust": "observed", "evidence": rejection}
    assert candidate is not None
    if not candidate.is_file():
        return {
            "passed": False,
            "trust": "observed",
            "evidence": {"path": str(check["path"]), "exists": False},
        }

    digest = hashlib.sha256()
    try:
        with candidate.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise ValueError("file_sha256 could not read the target file") from exc
    actual = digest.hexdigest()
    return {
        "passed": actual == expected.lower(),
        "trust": "observed",
        "evidence": {
            "path": str(check["path"]),
            "algorithm": "sha256",
            "actual": actual,
            "expected": expected.lower(),
        },
    }


def _json_valid(check: dict[str, Any], root: Path) -> dict[str, Any]:
    candidate, rejection = _resolve_task_path(check.get("path"), root, "json_valid")
    if rejection:
        return {"passed": False, "trust": "observed", "evidence": rejection}
    assert candidate is not None
    if not candidate.is_file():
        return {
            "passed": False,
            "trust": "observed",
            "evidence": {"path": str(check["path"]), "exists": False},
        }
    try:
        if candidate.stat().st_size > MAX_JSON_BYTES:
            raise ValueError(f"JSON exceeds the {MAX_JSON_BYTES}-byte validation limit")
        with candidate.open("r", encoding="utf-8") as stream:
            json.load(stream, parse_constant=_reject_nonstandard_json_constant)
    except json.JSONDecodeError as exc:
        return {
            "passed": False,
            "trust": "observed",
            "evidence": {"path": str(check["path"]), "error": type(exc).__name__},
        }
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"json_valid could not read the target file ({type(exc).__name__})") from exc
    return {
        "passed": True,
        "trust": "observed",
        "evidence": {"path": str(check["path"]), "valid_json": True},
    }


def _reject_nonstandard_json_constant(value: str) -> None:
    # Python's decoder accepts NaN and Infinity by default; RFC 8259 JSON does not.
    raise json.JSONDecodeError(f"Invalid JSON constant: {value}", value, 0)


def _reported_test_result(check: dict[str, Any], _root: Path) -> dict[str, Any]:
    """Validate shape, but do not treat contract-authored test results as proof."""
    exit_code = check.get("exit_code")
    if not isinstance(exit_code, int) or isinstance(exit_code, bool):
        raise ValueError("test_result checks require an integer exit_code")
    return {
        "passed": None,
        "trust": "unverified",
        "evidence": {
            "source": "task_contract",
            "reported_exit_code": exit_code,
            "reported_summary": str(check.get("summary", ""))[:500],
            "reason": "The verifier did not observe or authenticate this test run",
        },
    }


_BUILTIN_EVALUATORS: dict[str, CheckEvaluator] = {
    "required_file": _path_exists,
    "path_exists": _path_exists,
    "file_sha256": _file_sha256,
    "json_valid": _json_valid,
    "test_result": _reported_test_result,
}


def builtin_check_kinds() -> tuple[str, ...]:
    """Return the supported check kinds in stable presentation order."""
    return tuple(_BUILTIN_EVALUATORS)


def _normalize_legacy_checks(task: dict[str, Any]) -> list[dict[str, Any]]:
    """Translate the original contract fields into the unified check format."""
    checks: list[dict[str, Any]] = []
    required_files = task.get("required_files", [])
    if not isinstance(required_files, list):
        raise ValueError("required_files must be a list of strings")
    for path in required_files:
        if not isinstance(path, str) or not path.strip():
            raise ValueError("required_files entries must be non-empty strings")
        checks.append({"kind": "required_file", "path": path, "check_name": f"file_exists:{path}"})

    command_results = task.get("command_results", [])
    if not isinstance(command_results, list):
        raise ValueError("command_results must be a list of objects")
    for result in command_results:
        if not isinstance(result, dict):
            raise ValueError("command_results entries must be objects")
        exit_code = result.get("exit_code")
        if not isinstance(exit_code, int) or isinstance(exit_code, bool):
            raise ValueError("command_results entries require an integer exit_code")
        label = str(result.get("label", "unnamed command"))
        checks.append({
            "kind": "test_result",
            "exit_code": exit_code,
            "summary": result.get("summary", ""),
            "check_name": f"command_succeeded:{label}",
        })
    return checks


def _validate_check_list(checks: Any) -> list[dict[str, Any]]:
    if not isinstance(checks, list):
        raise ValueError("checks must be a list of check objects")
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            raise ValueError(f"checks[{index}] must be an object")
        kind = check.get("kind")
        if not isinstance(kind, str) or not kind.strip():
            raise ValueError(f"checks[{index}].kind must be a non-empty string")
        check_id = check.get("id")
        if check_id is not None:
            if not isinstance(check_id, str) or not check_id.strip():
                raise ValueError(f"checks[{index}].id must be a non-empty string")
            if check_id in seen_ids:
                raise ValueError(f"duplicate check id: {check_id}")
            seen_ids.add(check_id)
        normalized.append(check)
    return normalized


def _evaluate_checks(
    checks: list[dict[str, Any]],
    root: Path,
    evaluators: Mapping[str, CheckEvaluator],
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for check in checks:
        kind = check["kind"]
        name = str(check.get("id") or check.get("check_name") or kind)
        criteria = {
            key: value[:500]
            for key in ("description", "expected_outcome")
            if isinstance((value := check.get(key)), str) and value.strip()
        }
        evaluator = evaluators.get(kind)
        if evaluator is None:
            results.append({
                "check": name, "kind": kind, "status": "unsupported",
                "passed": None, "evidence_source": "none",
                "evidence": "No evaluator is registered for this check kind",
                **criteria,
            })
            continue
        try:
            outcome = evaluator(check, root)
        except Exception as exc:
            results.append({
                "check": name, "kind": kind, "status": "error",
                "passed": None, "evidence_source": "trusted_evaluator",
                "evidence": f"Evaluator raised {type(exc).__name__}",
                **criteria,
            })
            continue
        if not isinstance(outcome, dict):
            outcome = {}
        trust = outcome.get("trust", "trusted")
        passed = outcome.get("passed")
        if not isinstance(trust, str) or trust not in {"observed", "trusted", "unverified"} or (
            passed is not None and not isinstance(passed, bool)
        ):
            results.append({
                "check": name, "kind": kind, "status": "error",
                "passed": None, "evidence_source": "trusted_evaluator",
                "evidence": "Evaluator returned an invalid decision or trust level",
                **criteria,
            })
            continue
        try:
            json.dumps(outcome.get("evidence"), allow_nan=False)
        except (TypeError, ValueError):
            results.append({
                "check": name, "kind": kind, "status": "error",
                "passed": None, "evidence_source": "trusted_evaluator",
                "evidence": "Evaluator returned evidence that is not JSON serializable",
                **criteria,
            })
            continue
        if trust == "unverified":
            outcome_status = "unverified"
            passed = None
        elif passed is None:
            results.append({
                "check": name, "kind": kind, "status": "error",
                "passed": None, "evidence_source": "trusted_evaluator",
                "evidence": "Evaluator omitted a pass/fail decision",
                **criteria,
            })
            continue
        else:
            outcome_status = "passed" if passed else "failed"
        results.append({
            "check": name,
            "kind": kind,
            "status": outcome_status,
            "passed": passed,
            "evidence_source": (
                "task_contract" if trust == "unverified"
                else "local_observation" if trust == "observed"
                else "trusted_evaluator"
            ),
            "evidence": outcome.get("evidence"),
            **criteria,
        })
    return results


def _aggregate_status(checks: list[dict[str, Any]]) -> str:
    if not checks:
        return "PARTIAL"
    statuses = [check["status"] for check in checks]
    if all(item == "passed" for item in statuses):
        return "VERIFIED"
    if all(item == "failed" for item in statuses):
        return "FAILED"
    return "PARTIAL"


def verify_task(
    task: dict[str, Any],
    base_dir: str | Path = ".",
    *,
    check_evaluators: Mapping[str, CheckEvaluator] | None = None,
) -> dict[str, Any]:
    """Evaluate task checks without executing commands from the contract.

    Built-in file and JSON checks inspect the filesystem under ``base_dir``.
    A ``test_result`` only records a claim and is therefore ``unverified``.
    Additional evaluator kinds may be supplied by the trusted host; they
    cannot be installed by a task contract or a model-generated plan.
    """
    if not isinstance(task, dict) or not isinstance(task.get("task_id"), str) or not task["task_id"].strip():
        raise ValueError("task must be an object with a non-empty task_id")
    root = Path(base_dir).resolve()
    checks = _normalize_legacy_checks(task)
    checks.extend(_validate_check_list(task.get("checks", [])))

    evaluators = dict(_BUILTIN_EVALUATORS)
    for kind, evaluator in (check_evaluators or {}).items():
        if not isinstance(kind, str) or not kind.strip() or not callable(evaluator):
            raise ValueError("custom evaluators require a non-empty kind and callable")
        if kind in evaluators:
            raise ValueError(f"cannot override built-in check evaluator: {kind}")
        evaluators[kind] = evaluator

    results = _evaluate_checks(checks, root, evaluators)
    counts = {
        status: sum(result["status"] == status for result in results)
        for status in ("passed", "failed", "unverified", "unsupported", "error")
    }
    return {
        "task_id": task["task_id"],
        "task_description": str(task.get("task_description", ""))[:4000],
        "agent_claim": str(task.get("agent_claim", "")),
        "status": _aggregate_status(results),
        "checks_passed": counts["passed"],
        "checks_failed": counts["failed"],
        "checks_unverified": counts["unverified"],
        "checks_unsupported": counts["unsupported"],
        "checks_errored": counts["error"],
        "checks": results,
        "limitations": [
            "Only the listed checks were evaluated.",
            "VERIFIED applies only to passed checks observed by this verifier or a trusted host evaluator.",
            "Contract-supplied command and test results are unverified claims; this verifier does not execute commands.",
            "Filesystem observations establish current local state, not who produced an artifact or when.",
            "Unknown check kinds remain unsupported until a trusted evaluator is registered.",
        ],
    }
