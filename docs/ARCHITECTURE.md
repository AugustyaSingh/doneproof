# Architecture (initial)

## Current prototype

- **Task contract:** JSON lists required files and recorded command results.
- **Verifier:** evaluates explicit checks without trusting `agent_claim`.
- **Evidence report:** reports each check, evidence, and aggregate status.

## Planned architecture

1. Adapters capture agent tool calls and task context.
2. A planner proposes verification requirements from the user goal.
3. A policy layer reviews requirements and blocks unsafe execution.
4. Deterministic validators inspect tests, diffs, files, API health and state.
5. A report presents evidence, gaps and uncertainty.
6. Optional Gemma integration helps interpret natural-language goals, but does not replace deterministic checks.

## Security & Trust Boundary

### Command Execution
Never run arbitrary shell commands from an untrusted task specification. A future command runner must use timeouts, a sandbox, allowlists and explicit permission boundaries.

### API & Workspace Isolation
The DoneProof REST API (`/verify`) is designed for trusted local developer environments (`127.0.0.1`):
1. **Workspace Boundary Enforcement:** The API verifies that any requested `base_dir` resolves strictly within the approved workspace root (`Path.cwd()` by default, or configured via `DONEPROOF_WORKSPACE_ROOT`).
2. **Path Traversal Protection:** Relative directory traversal (`..`) and absolute paths outside the approved workspace root are rejected with `400 Bad Request`.
3. **Symlink Canonicalization:** Paths are canonicalized via `Path.resolve()`, preventing symlinks pointing outside the workspace from bypassing boundary checks.
4. **Hardened CORS Policy:** Cross-Origin Resource Sharing (CORS) is restricted to local origins (`http://127.0.0.1:8000`, `http://localhost:8000` by default, or configurable via `DONEPROOF_ALLOWED_ORIGINS`). `allow_credentials` is set to `False` because DoneProof is a local-first utility without browser cookie/session credentials, preventing cross-origin data exposure.
5. **Network Deployments:** If exposed across a network, the API must be placed behind an authenticating gateway and run in an unprivileged container.
