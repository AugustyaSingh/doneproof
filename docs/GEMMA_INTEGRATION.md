# Gemma 4 integration

## Responsibilities and data flow

1. The user explicitly submits a task description and optional project context.
2. The local API sends those fields to the configured Google Gemini API using
   `GEMINI_API_KEY` and the selected Gemma 4 model.
3. DoneProof parses strict JSON and validates a versioned plan schema.
4. The user reviews the untrusted proposal. The UI can copy supported
   filesystem checks into a task contract.
5. The deterministic verifier evaluates actual workspace observations. It
   does not execute model-authored commands, scripts, or tests.

Plans use `doneproof.verification-plan.v1`. Each check has a stable `id`, an
allowed `kind`, a specific `target`, typed `inputs`, and an
`expected_outcome`. `manual_review` checks are recommendations only. The model
cannot register evaluators or produce a passing result. `test_result` is
intentionally excluded from planner kinds because a claimed exit code is not
authenticated evidence.

The built-in generation kinds are `required_file`, `path_exists`, `file_sha256`,
`json_valid`, and `manual_review`. Workspace paths must be relative and may not
traverse upward. Only documented inputs are accepted. This is plan validation,
not a sandbox for generated code: no model-generated executable content is run.

## Hosted API support and configuration

Install the optional dependency and set credentials in the environment:

```powershell
python -m pip install -r requirements-gemma.txt
$env:GEMINI_API_KEY = "YOUR_KEY_HERE"
python -m doneproof.gemma_planner "Verify that the release artifact is valid JSON"
```

The supported model IDs are `gemma-4-26b-a4b-it` and `gemma-4-31b-it`. The
default is `gemma-4-26b-a4b-it`; `DONEPROOF_GEMMA_MODEL` may select either
documented Gemma 4 target. Invalid IDs fail explicitly—DoneProof does not
silently substitute Gemini or another model. Credentials stay in the API
server process and must never be placed in browser code, task contracts, or
committed files.

The browser uses `POST /api/plan`, capped at 64 KiB. It sends only when the user
presses **Generate proposal**. The interface tells the user that task and
context text will go to Google's API. Do not include secrets in these fields.
The endpoint returns a proposal only; generated checks are not executed.

The official Python SDK client is configured for a 60-second request timeout
and up to three attempts for transient 408, 429, and selected 5xx errors.
Timeout and rate-limit errors are surfaced as sanitized messages. Provider
usage counts and model-version metadata are included only when the response
contains them. Token usage is not converted to price because price is model,
account, and time dependent.

The hosted Gemma page currently documents the two model IDs and the standard
`generate_content` call. Google's general structured-output guide documents a
JSON Schema subset and lists supported Gemini models, but does not list Gemma.
DoneProof therefore requests JSON in its prompt and enforces strict parsing and
semantic validation in code; it does not claim constrained decoding. Even a
schema-conforming response can be irrelevant or wrong.

Sources checked 2026-10-11:

- [Run Gemma with the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
- [Function calling with Gemma 4](https://ai.google.dev/gemma/docs/capabilities/text/function-calling-gemma4)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Google Gen AI Python SDK reference](https://googleapis.github.io/python-genai/genai.html)
- [Gemini API errors](https://ai.google.dev/gemini-api/docs/api-errors)

## Offline tests

The standard suite is offline. Mocks cover response parsing, semantic
validation, missing credentials, malformed/empty outputs, provider errors,
timeouts, and rate limits. Mocked generation is never written as a live
evaluation artifact.

```powershell
python -m unittest discover -s tests -v
```

## Live generation command

For a one-off proposal:

```powershell
python -m doneproof.gemma_planner "Check the generated manifest and release artifact"
```

The response includes the versioned plan plus provider/model, response version
if available, finish reason if available, latency, and usage metadata if the
provider returned it. The core verifier still independently evaluates evidence.
