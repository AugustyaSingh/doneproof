"""FastAPI application for DoneProof verification dashboard and API."""
from pathlib import Path
from typing import Any
import json

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from doneproof.verifier import verify_task

BASE_DIR = Path(__file__).parent.resolve()
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="DoneProof API",
    description="Evidence-based verification API for AI agent task completion contracts",
    version="0.1.0",
)

# Phase 1: CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Phase 1: Global Exception Handler for ValueError
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """Return 400 Bad Request with a clear message when verifier raises ValueError."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc), "error": str(exc)},
    )


# Phase 1: Verification Endpoint
@app.post("/verify")
async def verify_endpoint(request: Request) -> JSONResponse:
    """Verify a task contract.

    Accepts:
    1. A JSON object with a 'task' object and optional 'base_dir':
       {"task": {...}, "base_dir": "."}
    2. Or a direct task object containing 'task_id', etc.
    """
    try:
        body = await request.json()
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": f"Invalid JSON payload: {exc}", "error": "Invalid JSON"},
        )

    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object")

    # If the payload explicitly wraps 'task'
    if "task" in body:
        task = body.get("task")
        base_dir = body.get("base_dir") or "."
    else:
        # Direct task payload
        task = body
        base_dir = "."

    if not isinstance(task, dict):
        raise ValueError("task must be an object with a non-empty task_id")

    # verify_task handles validation of task and base_dir, raising ValueError on failure
    result = verify_task(task, base_dir=base_dir)
    return JSONResponse(content=result)


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "doneproof"}


@app.get("/api/samples")
async def get_sample_tasks() -> dict[str, Any]:
    """Provide built-in sample task contracts for quick UI testing."""
    return {
        "pass": {
            "task_id": "pass-task-verified",
            "agent_claim": "All requested files exist and core test suites succeeded.",
            "required_files": ["README.md", "doneproof/verifier.py"],
            "command_results": [
                {
                    "label": "unit test suite",
                    "exit_code": 0,
                    "summary": "Ran 14 tests in 0.003s. All tests passed.",
                }
            ],
        },
        "partial": {
            "task_id": "sample-fix",
            "agent_claim": "All tests pass and the fix is complete.",
            "required_files": [
                "README.md",
                "doneproof/verifier.py",
                "missing_expected_test.py",
            ],
            "command_results": [
                {
                    "label": "unit tests",
                    "exit_code": 1,
                    "summary": "2 passed, 1 failed: regression test did not pass",
                }
            ],
        },
        "fail": {
            "task_id": "fail-task-unmet",
            "agent_claim": "Delivered all features and verified test pass.",
            "required_files": [
                "non_existent_module.py",
                "missing_output_artifact.json",
            ],
            "command_results": [
                {
                    "label": "integration tests",
                    "exit_code": 2,
                    "summary": "Fatal error: tests crashed with exit code 2.",
                }
            ],
        },
    }


# Phase 2 & 3: Serve Web Dashboard
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_model=None)
async def serve_index() -> Response:
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse(
        content={
            "message": "DoneProof API is active. Web dashboard files not found in static directory.",
            "docs": "/docs",
        }
    )


def run() -> None:
    """Run server via uvicorn programmatically."""
    import uvicorn

    uvicorn.run("doneproof.api:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    run()
