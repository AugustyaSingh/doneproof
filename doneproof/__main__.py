import json
import sys
from pathlib import Path

from doneproof.verifier import verify_task


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] in ("--serve", "serve", "api"):
        import uvicorn
        from doneproof.api import app

        print("Starting DoneProof Web Dashboard at http://127.0.0.1:8000 ...")
        uvicorn.run(app, host="127.0.0.1", port=8000)
        return 0

    if len(sys.argv) != 2:
        print("Usage: python -m doneproof <task.json> or python -m doneproof --serve", file=sys.stderr)
        return 2
    task_path = Path(sys.argv[1])
    try:
        task = json.loads(task_path.read_text(encoding="utf-8"))
        report = verify_task(task, base_dir=task_path.parent)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Could not verify task: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
