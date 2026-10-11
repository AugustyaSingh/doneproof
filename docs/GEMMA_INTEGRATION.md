# Gemma 4 integration

## What this feature does

`doneproof.gemma_planner` converts a natural-language task into a proposed list
of verification checks using Gemma 4 through the Gemini API. It validates the
returned JSON and constrains check types.

**It does not decide that a task passed.** The output is a plan, not a result.
No generated command is executed. Deterministic verifiers must independently
check observed evidence, and human review is required where appropriate.

## Setup (PowerShell)

```powershell
python -m pip install -r requirements-gemma.txt
$env:GEMINI_API_KEY = "YOUR_KEY_HERE"
python -m doneproof.gemma_planner "Fix the login bug and ensure the regression test passes"
```

Create an API key in Google AI Studio. Never commit the key, paste it into an issue,
or expose it in frontend code. Set a machine/user environment variable if needed
instead of writing it into source control.

Optional model override:

```powershell
$env:DONEPROOF_GEMMA_MODEL = "gemma-4-26b-a4b-it"
```

The default is `gemma-4-26b-a4b-it`. The model ID may be changed if the API
availability or event instructions require a different supported Gemma model.

## Example plan shape

```json
{
  "task_summary": "Fix the login bug",
  "checks": [
    {
      "kind": "test_result",
      "description": "Run the regression test",
      "expected_evidence": "The regression test exits with code 0",
      "requires_human_approval": true
    }
  ]
}
```

## Tests

The tests use a mock API client; they do not need an API key or network access.

```powershell
python -m unittest discover -s tests -v
```
