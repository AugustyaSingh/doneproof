# DoneProof

**Evidence-based verification for task completion.**

DoneProof checks explicit task requirements against observable evidence rather than trusting an agent's final message.

> **Status:** Local verification prototype with deterministic contract checks and an optional live Gemma 4 planner. Generated plans remain proposals; the verifier does not execute task commands or authenticate evidence provenance.

## Quick start

Requires Python 3.10+, Node.js, and pnpm.

```bash
python -m unittest discover -s tests -v
python -m doneproof examples/sample_task.json
```

The sample task includes an intentionally absent regression-test file and a
reported non-zero test result. The missing file is observed as failed; the
reported test result remains unverified because the verifier did not run or
authenticate that test process. The CLI prints this scoped report and exits
non-zero while any criterion is unresolved.
For CLI contracts inside a Git repository, relative evidence paths resolve
from the nearest repository root; outside Git, they resolve from the contract
file's directory.

### Local verification dashboard

```powershell
python -m pip install -r requirements.txt -r requirements-gemma.txt
pnpm install --frozen-lockfile
pnpm build
# If GEMINI_API_KEY is stored as a Windows user environment variable:
$env:GEMINI_API_KEY = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')
python -m doneproof --serve
```

Open <http://127.0.0.1:8000>. The local API scopes file checks to its approved
workspace root (the current directory by default). Set `DONEPROOF_WORKSPACE_ROOT`
to choose another root. The browser interface talks to that API; contracts are
loaded from JSON files or entered directly. Example contracts are read from
`examples/*.json` rather than embedded in the UI.
If port 8000 is occupied, set `$env:DONEPROOF_PORT = '8001'` before starting
the API and open <http://127.0.0.1:8001> instead.
On **Generate with Gemma**, the local API collects a bounded snapshot (branch,
revision, changed paths, tracked paths, and at most 5,000 README characters)
and sends it with your task and optional context to Google. The key stays on
the server. Review and apply the actual model response, edit its supported
checks in the contract, then explicitly run the local file checks. A separate
**Run Python unittest suite** action is available when the selected workspace
contains `tests/`. It uses a fixed server-owned command, no shell, a 60-second
timeout, and capped output. Its observed result is displayed separately and
does not change individual contract statuses.
The receipt includes the repository revision and evidence for every check.

### Hackathon demo

1. Open <http://127.0.0.1:8000> and choose **sample-fix** from the sample list.
2. Run it to see actual local observations: `README.md` and
   `doneproof/verifier.py` pass; the intentionally absent regression-test file
   fails; the sample's reported test exit code remains **unverified**.
3. In the task planner, describe a real change in this repository and press
   **Generate with Gemma**. Inspect the returned model and repository revision.
4. Apply the supported checks, review/edit the JSON contract, and press
   **Run verification**. The receipt reports current workspace results and the
   repository revision; it does not claim a general test run proves behavior.

For a timed presenter walkthrough and likely judge questions, see
[the hackathon demo guide](docs/HACKATHON_DEMO.md).

To run the UI in Vite during development, start `python -m doneproof --serve`
in one terminal and `pnpm dev` in another. The development frontend is at
<http://127.0.0.1:5173>.

For frontend development, install the locked JavaScript dependencies and start
Vite while the API runs in a second terminal:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

The Vite development server proxies `/verify` and `/api` to the local API.
`pnpm build` compiles the React/TypeScript frontend into `doneproof/static`,
which is served by the Python API.

### API and deployment trust boundary

The API is intended for a trusted local developer workflow. Verification and
approved test-run requests are restricted to the configured workspace root
(`DONEPROOF_WORKSPACE_ROOT`, or the server's current directory). Browser
origins are limited to local development origins by default; configure
`DONEPROOF_ALLOWED_ORIGINS` with a comma-separated list when Vite runs on a
different local origin. Do not expose this unauthenticated development API to
a network. A network deployment needs an authenticating gateway and an
unprivileged isolated process.

#### Controlled Vercel presentation

The repository includes a Vercel FastAPI entrypoint and builds the React UI
before deployment. The hosted demo is intentionally scoped to the repository
snapshot included in that deployment; it cannot inspect a visitor's computer
or arbitrary GitHub repositories. The verification and approved test-run APIs
are gated by an eight-hour, HTTP-only, secure demo session. If the password is
not configured, those APIs fail closed. Gemma planning uses the server-side
`GEMINI_API_KEY` and is available only after the same login.

In Vercel, import this repository with root directory `./` and use the
**FastAPI** framework preset (the React interface is built into FastAPI's
static directory; do not deploy it as a frontend-only Vite project). The
repository config runs `pnpm build` before packaging the FastAPI function. Add these under
**Settings → Environment Variables** for Production (and Preview if used):

| Name | Value |
| --- | --- |
| `GEMINI_API_KEY` | Your private Google AI API key (enter it in Vercel only) |
| `DONEPROOF_DEMO_PASSWORD` | A strong presenter password to share only with invited judges |

Generate a password locally with `python -c "import secrets; print(secrets.token_urlsafe(24))"`.
Never use a `VITE_` prefix for either secret. Redeploy after adding variables.
Vercel's configured build command is `pnpm build`; the app includes the Python
dependencies from `requirements.txt`. Then open the deployment URL, enter the
presenter password, choose the bundled `sample-fix` example, and run it. To
show Gemma, request a plan for a task against the bundled DoneProof repository.
The runner can start the fixed Python unittest command explicitly; on Vercel
this executes in the short-lived server function against the deployed source
bundle, not against your laptop. Test-process evidence remains separate from
individual criterion results.

This is a controlled presentation deployment, not a multi-user hosted service:
everyone who knows the shared password uses the same bundled source and the
server owner's Gemma quota. It does not provide per-user accounts, rate limits,
or isolated arbitrary repository execution. Disable or rotate the password and
Gemma key after the event if the URL has been shared widely.

## How it works

1. A task contract lists checks for that task. Built-in checks inspect required
   paths, file SHA-256 digests, and JSON syntax. Recorded test results remain
   unverified claims; trusted integrations can register evaluators for other
   evidence types.
2. The verifier evaluates each supported condition independently of the agent's claim.
3. The report shows per-check evidence and an aggregate status:
   - `VERIFIED`: every check passed through local observation or a trusted host evaluator.
   - `PARTIAL`: outcomes are mixed, any check is unverified/unsupported/errors, or no checks were supplied.
   - `FAILED`: every check was evaluated and failed.
4. `VERIFIED` applies only to the listed checks; it is not a guarantee of overall correctness.

For new contracts, use the unified `checks` field:

```json
{
  "task_id": "release-check",
  "checks": [
    {"id": "artifact", "kind": "required_file", "path": "dist/app.zip"},
    {"id": "manifest", "kind": "json_valid", "path": "dist/manifest.json"},
    {
      "id": "unit-tests",
      "kind": "test_result",
      "exit_code": 0,
      "summary": "Recorded CI result"
    }
  ]
}
```

The original `required_files` and `command_results` fields remain supported.
`path_exists` supports files, directories, or either; `file_sha256` compares
actual file bytes to an expected digest; and `json_valid` parses a local JSON
file. A reported `test_result` exit code is unverified because the verifier did
not observe or authenticate the test process. Unknown check kinds are reported
as unsupported; an integrating application may pass trusted evaluators to
`verify_task` for additional kinds. Model-generated plans cannot install
evaluators or execute checks. SHA-256 matching establishes content identity
against the supplied digest, not who produced the file or when.

## Project plan

- [x] Deterministic path, digest, and JSON checks; reported command results are unverified
- [x] JSON evidence reports and CLI
- [x] Unit tests and GitHub Actions CI
- [ ] Git diff and repository-state checks
- [x] Explicitly started, fixed Python unittest preset with timeout and capped output (not sandboxed or linked to contract criteria)
- [ ] Isolated test execution with per-criterion evidence and authenticated provenance
- [x] Local FastAPI endpoint and React/Vite web dashboard
- [x] Extensible task-defined check contracts and evaluator injection
- [x] Optional Gemma-powered verification-plan generation
- [x] Reference-plan calibration benchmark for the controlled login fixture
- [ ] Evaluation of Gemma-generated plans on a representative task dataset

## Safety and limitations

The prototype does not execute commands from task files or authenticate the source of recorded results. Recorded command results are shown as unverified claims. Separately, the API can explicitly run one fixed Python unittest command; it is not sandboxed, is not tied to individual task criteria, and does not authenticate the tested revision. Filesystem observations describe current local state. A passing result is not proof beyond the checks listed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please open an issue before substantial changes and use branches and pull requests.

## License

MIT. See [LICENSE](LICENSE).

## Gemma 4 verification-plan generation

DoneProof includes an optional Gemma 4 planner that converts a task description
and optional project context into a versioned list of proposed checks. It
validates check IDs, kinds, targets, inputs, and expected outcomes. Filesystem
targets must stay inside the selected workspace. It does **not** execute model
output or treat a proposed check as evidence that a task passed. Built-in
checks cover path presence/type, JSON syntax, and SHA-256; other suggestions
require human review.

See [Gemma integration setup](docs/GEMMA_INTEGRATION.md).

```powershell
python -m pip install -r requirements-gemma.txt
$env:GEMINI_API_KEY = "YOUR_KEY_HERE"
python -m doneproof.gemma_planner "Verify that the release artifact is valid JSON"
```

The dashboard exposes `POST /api/plan` for this explicit user-triggered action.
The server keeps the API key private. Task and context text is sent to Google
only when a plan is requested; never include secrets in those fields. Requests
use a 60-second timeout and at most three attempts for transient status codes.
Provider error messages are sanitized. Supported model IDs are
`gemma-4-26b-a4b-it` and `gemma-4-31b-it`; unsupported models are rejected and
are never silently replaced. Available model version, latency, finish reason,
and token usage metadata are returned with a generated plan.

Google's current docs list the two hosted Gemma 4 IDs. The general Gemini
structured-output model support list does not name Gemma, so this implementation
uses strict JSON parsing and semantic validation rather than assuming constrained
output support. See [Gemma on Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api),
[structured outputs](https://ai.google.dev/gemini-api/docs/structured-output),
and the [Gen AI Python SDK](https://googleapis.github.io/python-genai/genai.html).

Offline tests use mocks for provider integration and failures; mocked results
are not labeled as live evaluations:
`python -m unittest discover -s tests -v`.

## Reference-plan calibration benchmark

Run the deterministic reference benchmark with:

```bash
python -m doneproof.benchmark
```

It checks four handcrafted plans against the seeded faults in the controlled
`login-auth-v1` fixture and reports the expected and observed killed mutants,
escaped mutants, and mutation score. It verifies the calibration mechanism's
behavior on this fixture; it does not evaluate Gemma-generated plans, measure
real-world bug detection, or establish general verifier correctness. Evaluating
Gemma plan quality requires a separate reproducible study on a representative
task dataset.

## Live Gemma evaluation

The live path is separate from the offline controls and requires a real
`GEMINI_API_KEY`. It calls the selected Gemma 4 model for each repeat; it does
not use mocks, cached responses, or reference-plan fallbacks. Generated scenario
selections are evaluated against the trusted correct implementation, expected
behavior labels, and seeded faulty implementations in
`benchmarks/login-auth-v1.json` and `doneproof/login_fixture.py`.

```powershell
python -m pip install -r requirements-gemma.txt
$env:GEMINI_API_KEY = "YOUR_KEY_HERE"
python -m doneproof.benchmark --live --repeats 3 --output artifacts/gemma-live-2026-10-11.json
```

`--output` creates a new file and refuses to overwrite an existing artifact.
Pick a unique path for each run. The artifact records corpus/schema version,
repository revision, model, timestamp, configuration, per-attempt plan or
failure and evaluation, latency, and provider-reported usage when available.
The API key is never recorded. Omit `--output` to print JSON. The benchmark is
one controlled login task, not evidence of general-purpose detection quality.
See [benchmark methodology](docs/BENCHMARK.md) for metric denominators and
limitations.
