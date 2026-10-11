# DoneProof

**Evidence-based verification for AI agent task completion.**

DoneProof checks explicit task requirements against observable evidence rather than trusting an agent's final message.

> **Status:** Early working prototype. The current verifier checks required files and recorded command results. The optional Gemma integration proposes verification plans; the core verifier still does not execute commands itself.

## Quick start

Requires Python 3.10+.

```bash
# Run unit test suite
python3 -m unittest discover -s tests -v

# Run verification via CLI
python3 -m doneproof examples/sample_task.json

# Launch the interactive Web Dashboard & REST API
pip3 install -r requirements.txt
python3 -m doneproof --serve
# (or python / pip if aliased)
```

Then open `http://127.0.0.1:8000` in your web browser to access the DoneProof dashboard.

The sample task intentionally includes a failed command result. The CLI prints an evidence report and exits non-zero unless all specified checks pass.

## Web Dashboard & API

DoneProof includes a built-in FastAPI backend and minimalist web dashboard:
- **Interactive Web Dashboard** at `http://127.0.0.1:8000/`:
  - Drag-and-drop or file upload for `task.json`.
  - Raw JSON contract editor with built-in presets (Passing, Partial, Failing).
  - Dynamic status indicators (`VERIFIED`, `PARTIAL`, `FAILED`).
  - Side-by-side **Claim vs. Reality** evaluation.
  - Itemized verification evidence table with file and command outcome status.
- **REST API Endpoints**:
  - `POST /verify`: Accepts `{"task": {...}, "base_dir": "."}` (or raw task contract) and returns deterministic verification results.
  - `GET /api/health`: Health status check.
  - `GET /api/samples`: Pre-configured sample task contracts.
  - Interactive API documentation available at `http://127.0.0.1:8000/docs`.

### Deployment & Trust Model

- **Local Developer Trust Boundary**: The DoneProof API is designed for trusted local developer workflows (`127.0.0.1`).
- **Approved Workspace Boundary**: The `/verify` endpoint validates that any requested `base_dir` resolves strictly within the approved workspace root (`Path.cwd()` by default, or configured via the `DONEPROOF_WORKSPACE_ROOT` environment variable).
- **Probing Prevention**: Directory traversal (`..`) or absolute paths outside the approved workspace root (e.g. `/etc`, `/tmp`, external symlinks) are rejected with `400 Bad Request` to prevent host filesystem probing.
- **Untrusted Deployments**: If deployed over a network, the API must be gated behind an authenticating reverse proxy and executed inside an unprivileged container.

## How it works

1. A task contract lists required files and recorded command results.
2. The verifier checks each condition independently of the agent's claim.
3. The report shows per-check evidence and an aggregate status:
   - `VERIFIED`: every specified check passed.
   - `PARTIAL`: some checks passed, some failed, or no checks were supplied.
   - `FAILED`: checks were supplied and none passed.
4. `VERIFIED` applies only to the listed checks; it is not a guarantee of overall correctness.

## Project plan

- [x] Deterministic file and recorded command-result checks
- [x] JSON evidence reports and CLI
- [x] Unit tests and GitHub Actions CI
- [ ] Git diff and repository-state checks
- [ ] Safe, sandboxed test execution
- [x] FastAPI endpoint and web dashboard
- [x] Optional Gemma-powered verification-plan generation
- [ ] Evaluation benchmark for agent tasks

## Safety and limitations

The prototype does not execute commands from task files. Recorded command results are supplied evidence; future adapters must capture them from trusted execution. A passing result is not proof beyond the checks listed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please open an issue before substantial changes and use branches and pull requests.

## License

MIT. See [LICENSE](LICENSE).

## Gemma 4 verification-plan generation

DoneProof includes an optional Gemma 4 planner that converts a task description
into a structured list of proposed checks. It validates the model response and
does **not** execute generated commands or treat the model's output as evidence
that a task passed.

See [Gemma integration setup](docs/GEMMA_INTEGRATION.md).

```powershell
python -m pip install -r requirements-gemma.txt
$env:GEMINI_API_KEY = "YOUR_KEY_HERE"
python -m doneproof.gemma_planner "Fix the login bug and ensure regression tests pass"
```

Tests are mocked and do not require an API key:
`python -m unittest discover -s tests -v`.
