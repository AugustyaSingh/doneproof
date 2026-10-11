import json
import sys
from pathlib import Path

from doneproof.verifier import verify_task


def _workspace_for_task(task_path: Path) -> Path:
    """Resolve contract paths from the containing Git workspace when present."""
    parent = task_path.resolve().parent
    for candidate in (parent, *parent.parents):
        if (candidate / ".git").exists():
            return candidate
    return parent


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] in ("--serve", "serve", "api"):
        try:
            from doneproof.api import run
        except ImportError as exc:
            print(f"Web API dependencies are missing: {exc}", file=sys.stderr)
            print("Install them with: python -m pip install -r requirements.txt", file=sys.stderr)
            return 2
        run()
        return 0
    if len(sys.argv) != 2:
        print("Usage: python -m doneproof <task.json> | --serve", file=sys.stderr)
        return 2
    task_path = Path(sys.argv[1])
    try:
        task = json.loads(task_path.read_text(encoding="utf-8"))
        report = verify_task(task, base_dir=_workspace_for_task(task_path))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Could not verify task: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
