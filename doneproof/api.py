"""Local HTTP interface for the deterministic DoneProof verifier."""
from __future__ import annotations

import os
import json
import hmac
import hashlib
import subprocess
import sys
import time
from threading import Thread
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from doneproof.verifier import verify_task

STATIC_DIR = Path(__file__).parent / "static"
MAX_CONTRACT_BYTES = 1024 * 1024
MAX_PLAN_REQUEST_BYTES = 64 * 1024
MAX_APPROVED_CHECK_SECONDS = 60
MAX_APPROVED_CHECK_OUTPUT = 12000
DEMO_COOKIE = "doneproof_demo"
DEMO_SESSION_SECONDS = 8 * 60 * 60
PROTECTED_PATHS = {"/verify", "/api/run-check", "/api/plan", "/api/approved-checks"}

# Server-owned presets only. Request data never supplies an executable or args.
APPROVED_CHECKS = {
    "python-unittest": {
        "label": "Python unittest suite",
        "argv": (sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"),
        "required_path": "tests",
        "timeout_seconds": MAX_APPROVED_CHECK_SECONDS,
    },
}


def workspace_root() -> Path:
    configured = os.environ.get("DONEPROOF_WORKSPACE_ROOT", "").strip()
    default = Path(__file__).resolve().parent.parent if os.environ.get("VERCEL") else Path.cwd()
    return Path(configured or default).resolve()


def _demo_secret() -> str:
    return os.environ.get("DONEPROOF_DEMO_PASSWORD", "")


def _demo_token() -> str | None:
    secret = _demo_secret()
    if not secret:
        return None
    expires = str(int(time.time()) + DEMO_SESSION_SECONDS)
    signature = hmac.new(secret.encode(), expires.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{signature}"


def _valid_demo_token(token: str | None) -> bool:
    secret = _demo_secret()
    if not secret or not token or "." not in token:
        return False
    expires, signature = token.split(".", 1)
    if not expires.isdigit() or int(expires) < int(time.time()):
        return False
    expected = hmac.new(secret.encode(), expires.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def get_workspace_root() -> Path:
    """Compatibility name for integrations using the earlier API helper."""
    return workspace_root()


def resolve_workspace(requested: str | Path = ".", approved_root: str | Path | None = None) -> Path:
    if not isinstance(requested, (str, Path)):
        raise ValueError("base_dir must be a string path")
    root = Path(approved_root).resolve() if approved_root is not None else workspace_root()
    candidate = Path(requested)
    candidate = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("Requested path is outside the approved workspace root")
    if candidate.exists() and not candidate.is_dir():
        raise ValueError("base_dir must point to a directory")
    return candidate


def validate_workspace_dir(requested_dir: str | Path = ".", workspace_root: str | Path | None = None) -> Path:
    """Backward-compatible name for the approved-root path validator."""
    return resolve_workspace(requested_dir, approved_root=workspace_root)


def get_allowed_origins() -> list[str]:
    """Return configured browser origins or safe local defaults."""
    configured = os.environ.get("DONEPROOF_ALLOWED_ORIGINS", "").strip()
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return [
        "http://127.0.0.1:8000", "http://localhost:8000",
        "http://127.0.0.1:8001", "http://localhost:8001",
        "http://127.0.0.1:5173", "http://localhost:5173",
    ]


def _request_size_error(content_length: str | None = None, *, body_size: int = 0, limit: int = MAX_CONTRACT_BYTES) -> JSONResponse | None:
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header"})
        if declared_size < 0:
            return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header"})
        if declared_size > limit:
            return JSONResponse(status_code=413, content={"detail": f"Request exceeds the {limit // 1024} KiB limit"})
    if body_size > limit:
        return JSONResponse(status_code=413, content={"detail": f"Request exceeds the {limit // 1024} KiB limit"})
    return None


def _parse_contract_body(payload: bytes) -> tuple[dict[str, Any] | None, JSONResponse | None]:
    try:
        body = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JSONResponse(status_code=400, content={"detail": "Invalid JSON payload"})
    if not isinstance(body, dict):
        return None, JSONResponse(status_code=400, content={"detail": "Request body must be a JSON object"})
    task = body.get("task", body)
    if not isinstance(task, dict):
        return None, JSONResponse(status_code=400, content={"detail": "task must be an object"})
    return {"task": task, "base_dir": body.get("base_dir", ".")}, None


def _parse_plan_request(payload: bytes) -> tuple[dict[str, str] | None, JSONResponse | None]:
    try:
        body = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JSONResponse(status_code=400, content={"detail": "Invalid JSON payload"})
    if not isinstance(body, dict):
        return None, JSONResponse(status_code=400, content={"detail": "Request body must be a JSON object"})
    task_description = body.get("task_description")
    project_context = body.get("project_context", "")
    base_dir = body.get("base_dir", ".")
    if not isinstance(task_description, str) or not task_description.strip():
        return None, JSONResponse(status_code=400, content={"detail": "task_description must be a non-empty string"})
    if not isinstance(project_context, str):
        return None, JSONResponse(status_code=400, content={"detail": "project_context must be a string"})
    if not isinstance(base_dir, str):
        return None, JSONResponse(status_code=400, content={"detail": "base_dir must be a string path"})
    return {"task_description": task_description, "project_context": project_context, "base_dir": base_dir}, None


def repository_snapshot(root: str | Path = ".") -> tuple[dict[str, Any], str]:
    """Return bounded, read-only repository context and non-sensitive revision metadata."""
    directory = resolve_workspace(root)

    def git(*args: str) -> str | None:
        try:
            result = subprocess.run(
                ["git", *args], cwd=directory, capture_output=True, text=True,
                timeout=3, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        return result.stdout.strip() if result.returncode == 0 else None

    is_git_workspace = (directory / ".git").exists()
    revision = git("rev-parse", "--verify", "HEAD") if is_git_workspace else None
    branch = git("branch", "--show-current") if is_git_workspace else None
    status_text = git("status", "--short", "--untracked-files=normal", "--", ".") if is_git_workspace else None
    file_text = git("ls-files", "--", ".") if is_git_workspace else None
    changed = status_text.splitlines() if status_text else []
    files = file_text.splitlines() if file_text else []

    parts = [
        f"Workspace: {directory.name}",
        f"Git branch: {branch or 'unavailable'}",
        f"Git revision: {revision or 'unavailable'}",
        f"Working tree changes: {len(changed)} listed",
        "Tracked file paths (bounded):\n" + "\n".join(files[:100]),
    ]
    if changed:
        parts.append("Changed paths (bounded):\n" + "\n".join(changed[:40]))

    readme = directory / "README.md"
    try:
        if readme.is_file() and readme.stat().st_size <= 512 * 1024:
            excerpt = readme.read_text(encoding="utf-8", errors="replace")[:5000]
            if excerpt.strip():
                parts.append("README excerpt (untrusted repository content):\n" + excerpt)
    except OSError:
        pass

    context = "\n\n".join(parts)[:9000]
    metadata = {
        "workspace": directory.name,
        "branch": branch or None,
        "revision": revision or None,
        "working_tree_changes": len(changed),
        "tracked_files_in_context": min(len(files), 100),
        "source": "local_git" if revision else "local_workspace",
    }
    return metadata, context


app = FastAPI(
    title="DoneProof API",
    description="Evidence-based verification against explicit task contracts.",
    version="0.2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def protect_controlled_demo(request: Request, call_next):
    if request.url.path in PROTECTED_PATHS and os.environ.get("VERCEL"):
        if not _demo_secret():
            return JSONResponse(status_code=503, content={"detail": "Demo access is not configured on this deployment."})
        if not _valid_demo_token(request.cookies.get(DEMO_COOKIE)):
            return JSONResponse(status_code=401, content={"detail": "Enter the demo password to continue."})
    return await call_next(request)


@app.get("/api/demo/session")
def demo_session(request: Request) -> dict[str, bool]:
    required = bool(os.environ.get("VERCEL"))
    return {"required": required, "configured": bool(_demo_secret()) if required else True,
            "authenticated": _valid_demo_token(request.cookies.get(DEMO_COOKIE)) if required else True}


@app.post("/api/demo/login")
async def demo_login(request: Request) -> Response:
    if not os.environ.get("VERCEL"):
        return JSONResponse({"detail": "Demo login is only enabled on the hosted demo."}, status_code=400)
    secret = _demo_secret()
    if not secret:
        return JSONResponse({"detail": "Demo access is not configured on this deployment."}, status_code=503)
    size_error = _request_size_error(request.headers.get("content-length"), limit=4096)
    if size_error:
        return size_error
    payload = bytearray()
    async for chunk in request.stream():
        size_error = _request_size_error(body_size=len(payload) + len(chunk), limit=4096)
        if size_error:
            return size_error
        payload.extend(chunk)
    try:
        body = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError):
        body = None
    password = body.get("password") if isinstance(body, dict) else None
    if not isinstance(password, str) or not hmac.compare_digest(password, secret):
        return JSONResponse({"detail": "That demo password is not correct."}, status_code=401)
    response = JSONResponse({"authenticated": True})
    response.set_cookie(DEMO_COOKIE, _demo_token(), max_age=DEMO_SESSION_SECONDS, httponly=True,
                        secure=True, samesite="lax", path="/")
    return response


@app.post("/api/demo/logout")
def demo_logout() -> Response:
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(DEMO_COOKIE, path="/", secure=bool(os.environ.get("VERCEL")),
                           httponly=True, samesite="lax")
    return response


@app.exception_handler(ValueError)
async def value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc), "error": str(exc)})


@app.post("/verify")
async def verify_endpoint(request: Request) -> JSONResponse:
    size_error = _request_size_error(request.headers.get("content-length"))
    if size_error is not None:
        return size_error

    payload = bytearray()
    async for chunk in request.stream():
        size_error = _request_size_error(body_size=len(payload) + len(chunk))
        if size_error is not None:
            return size_error
        payload.extend(chunk)
    parsed, parse_error = _parse_contract_body(payload)
    if parse_error is not None:
        return parse_error
    assert parsed is not None
    base = resolve_workspace(parsed["base_dir"])
    task: Any = parsed["task"]
    report = verify_task(task, base_dir=base)
    report["repository"] = repository_snapshot(base)[0]
    return JSONResponse(content=report)


@app.get("/api/approved-checks")
def approved_checks(base_dir: str = ".") -> dict[str, Any]:
    """List fixed local check presets available in the selected project."""
    root = resolve_workspace(base_dir)
    return {"checks": [
        {"id": check_id, "label": definition["label"], "timeout_seconds": definition["timeout_seconds"]}
        for check_id, definition in APPROVED_CHECKS.items()
        if (root / definition["required_path"]).is_dir()
    ]}


def _execute_approved_check(check_id: str, root: Path) -> JSONResponse:
    definition = APPROVED_CHECKS.get(check_id)
    if definition is None:
        return JSONResponse(status_code=400, content={"detail": "That check is not in the server allowlist"})
    if not (root / definition["required_path"]).is_dir():
        return JSONResponse(status_code=400, content={"detail": "This project does not contain the required tests directory"})
    started = time.monotonic()
    process = None
    captured = bytearray()
    try:
        process = subprocess.Popen(
            definition["argv"], cwd=root, shell=False, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        def capture_bounded_output() -> None:
            assert process is not None and process.stdout is not None
            for chunk in iter(lambda: process.stdout.read(4096), b""):
                captured.extend(chunk)
                if len(captured) > MAX_APPROVED_CHECK_OUTPUT:
                    del captured[:-MAX_APPROVED_CHECK_OUTPUT]
        reader = Thread(target=capture_bounded_output, daemon=True)
        reader.start()
        try:
            exit_code = process.wait(timeout=definition["timeout_seconds"])
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
            process.kill()
            process.wait()
            exit_code = None
        reader.join()
        output = captured.decode("utf-8", errors="replace")
        if timed_out:
            output = (output + f"\nTimed out after {definition['timeout_seconds']} seconds.")[-MAX_APPROVED_CHECK_OUTPUT:]
    except OSError as exc:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        return JSONResponse(status_code=500, content={"detail": f"Could not start approved check ({type(exc).__name__})"})
    return JSONResponse(content={
        "check_id": check_id, "label": definition["label"],
        "status": "errored" if timed_out else "passed" if exit_code == 0 else "failed",
        "exit_code": exit_code, "timed_out": timed_out,
        "duration_seconds": round(time.monotonic() - started, 3),
        "output": output, "command": list(definition["argv"]),
        "evidence_source": "local_process_observation",
        "limitations": ["This command result describes this workspace at run time.", "A passing project test suite does not prove every task criterion."],
    })


@app.post("/api/run-check")
async def run_approved_check(request: Request) -> JSONResponse:
    """Run a server-allowlisted command only after an explicit UI request."""
    size_error = _request_size_error(request.headers.get("content-length"), limit=4096)
    if size_error is not None:
        return size_error
    payload = bytearray()
    async for chunk in request.stream():
        size_error = _request_size_error(body_size=len(payload) + len(chunk), limit=4096)
        if size_error is not None:
            return size_error
        payload.extend(chunk)
    try:
        body = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse(status_code=400, content={"detail": "Invalid JSON payload"})
    if not isinstance(body, dict) or not isinstance(body.get("check_id"), str):
        return JSONResponse(status_code=400, content={"detail": "check_id must name an approved check"})
    check_id = body["check_id"]
    if check_id not in APPROVED_CHECKS:
        return JSONResponse(status_code=400, content={"detail": "That check is not in the server allowlist"})
    try:
        root = resolve_workspace(body.get("base_dir", "."))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": str(exc)})
    return _execute_approved_check(check_id, root)


@app.post("/api/plan")
async def plan_endpoint(request: Request) -> JSONResponse:
    """Generate a proposed plan on explicit request; never run its checks."""
    size_error = _request_size_error(
        request.headers.get("content-length"), limit=MAX_PLAN_REQUEST_BYTES,
    )
    if size_error is not None:
        return size_error
    payload = bytearray()
    async for chunk in request.stream():
        size_error = _request_size_error(body_size=len(payload) + len(chunk), limit=MAX_PLAN_REQUEST_BYTES)
        if size_error is not None:
            return size_error
        payload.extend(chunk)
    parsed, parse_error = _parse_plan_request(payload)
    if parse_error is not None:
        return parse_error
    assert parsed is not None

    try:
        from doneproof.gemma_planner import suggest_verification_plan
        repository, repository_context = repository_snapshot(parsed.pop("base_dir"))
        supplied_context = parsed.pop("project_context")
        context = (
            "AUTOMATIC LOCAL REPOSITORY SNAPSHOT (untrusted reference data):\n"
            + repository_context
            + "\n\nUSER-SUPPLIED PROJECT CONTEXT (untrusted reference data):\n"
            + supplied_context[:6000]
        )
        generated = suggest_verification_plan(**parsed, project_context=context)
        generated["repository"] = repository
        return JSONResponse(content=generated)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": str(exc)})
    except RuntimeError as exc:
        message = str(exc)
        status_code = 503 if "GEMINI_API_KEY" in message or "SDK missing" in message else 429 if "rate limited" in message else 504 if "timed out" in message else 502
        return JSONResponse(status_code=status_code, content={"detail": message})


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "doneproof",
        "gemma_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "gemma_model": os.environ.get("DONEPROOF_GEMMA_MODEL", "gemma-4-26b-a4b-it"),
    }


@app.get("/api/samples")
def samples() -> dict[str, Any]:
    """Load example contracts from the examples directory as sample data."""
    examples_dir = Path(__file__).parent.parent / "examples"
    available: dict[str, Any] = {}
    if not examples_dir.is_dir():
        return available
    for path in sorted(examples_dir.glob("*.json")):
        try:
            resolved_path = path.resolve()
            if examples_dir.resolve() not in resolved_path.parents or resolved_path.stat().st_size > MAX_CONTRACT_BYTES:
                continue
            contract = json.loads(resolved_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if isinstance(contract, dict) and isinstance(contract.get("task_id"), str):
            available[path.stem] = contract
    return available


if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_model=None)
def index() -> Response:
    path = STATIC_DIR / "index.html"
    if path.is_file():
        return FileResponse(path)
    return JSONResponse({"message": "DoneProof API is running", "docs": "/docs"})


def run() -> None:
    import uvicorn
    port = int(os.environ.get("DONEPROOF_PORT", "8000"))
    if not 1 <= port <= 65535:
        raise ValueError("DONEPROOF_PORT must be between 1 and 65535")
    uvicorn.run("doneproof.api:app", host="127.0.0.1", port=port)


if __name__ == "__main__":
    run()
