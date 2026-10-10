"""Deterministic checks for a small, explicit task contract."""
from pathlib import Path
from typing import Any


def verify_task(task: dict[str, Any], base_dir: str | Path = ".") -> dict[str, Any]:
    if not isinstance(task, dict) or not isinstance(task.get("task_id"), str) or not task["task_id"].strip():
        raise ValueError("task must be an object with a non-empty task_id")

    root = Path(base_dir).resolve()
    checks: list[dict[str, Any]] = []
    required_files = task.get("required_files", [])
    command_results = task.get("command_results", [])
    if not isinstance(required_files, list):
        raise ValueError("required_files must be a list")
    if not isinstance(command_results, list):
        raise ValueError("command_results must be a list")

    for item in required_files:
        if not isinstance(item, str) or not item.strip():
            raise ValueError("required_files entries must be non-empty strings")
        candidate = (root / item).resolve()
        if candidate != root and root not in candidate.parents:
            checks.append({"check": f"file_exists:{item}", "passed": False,
                           "evidence": "Rejected path outside task directory"})
            continue
        exists = candidate.is_file()
        checks.append({"check": f"file_exists:{item}", "passed": exists,
                       "evidence": "File exists" if exists else "File not found"})

    for result in command_results:
        if not isinstance(result, dict) or not isinstance(result.get("exit_code"), int):
            raise ValueError("command_results entries require an integer exit_code")
        label = str(result.get("label", "unnamed command"))
        passed = result["exit_code"] == 0
        checks.append({"check": f"command_succeeded:{label}", "passed": passed,
                       "evidence": {"exit_code": result["exit_code"],
                                    "summary": str(result.get("summary", ""))[:500]}})

    if not checks:
        status = "PARTIAL"
    elif all(c["passed"] for c in checks):
        status = "VERIFIED"
    elif any(c["passed"] for c in checks):
        status = "PARTIAL"
    else:
        status = "FAILED"

    return {
        "task_id": task["task_id"],
        "agent_claim": str(task.get("agent_claim", "")),
        "status": status,
        "checks_passed": sum(1 for c in checks if c["passed"]),
        "checks_failed": sum(1 for c in checks if not c["passed"]),
        "checks": checks,
        "limitations": [
            "Only the listed checks were evaluated.",
            "VERIFIED does not prove correctness beyond the specified checks.",
            "Command results are supplied evidence; this prototype does not execute commands."
        ]
    }
