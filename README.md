# DoneProof

**Evidence-based verification for AI agent task completion.**

AI agents can report success even when a task is incomplete. DoneProof is an open-source prototype that checks task requirements against observable evidence instead of trusting an agent's final message.

> **Current status:** Early prototype. The included verifier checks explicit, machine-verifiable conditions. It does not prove arbitrary tasks are complete and does not use an LLM yet.

## Problem

Agent responses are not proof. A tool call may fail, a test may fail, or a requested file may never be created. DoneProof separates an agent's claim from independent checks.

## MVP

- Define a task as explicit verification requirements.
- Check whether required files exist.
- Check command/test results using their exit codes.
- Produce a JSON report with `VERIFIED`, `PARTIAL`, or `FAILED`.
- Keep the checks deterministic and the evidence inspectable.

## Architecture

```text
Task requirements (JSON)
          |
          v
   Verification engine
     /           \
File checks   Recorded command results
     \           /
          v
 Evidence-backed report (JSON)
          |
          v
  Dashboard / agent adapters (planned)
```

## Quick start

Requires Python 3.10+.

```bash
python -m unittest discover -s tests -v
python -m doneproof examples/sample_task.json
```

No external services or API keys are required for the prototype.

## Example output

The sample task deliberately includes a failed test result. DoneProof should not mark the task as verified just because an agent claims it succeeded.

```json
{
  "task_id": "sample-fix",
  "agent_claim": "All tests pass and the fix is complete.",
  "status": "FAILED",
  "checks_passed": 1,
  "checks_failed": 1
}
```

The exact report includes evidence and a result for each check.

## Roadmap

- [x] Initial deterministic verification engine
- [x] File-existence checks
- [x] Recorded command-result checks
- [x] JSON evidence report
- [ ] Git diff and repository-state checks
- [ ] Safe test-command runner with timeouts and sandboxing
- [ ] FastAPI endpoint and web dashboard
- [ ] Agent adapters and trace capture
- [ ] Gemma integration for translating natural-language goals into proposed checks
- [ ] Evaluation benchmark with reproducible successful and failed tasks

## Design principles

1. **Evidence over claims:** never accept an agent's self-reported success as proof.
2. **Deterministic checks first:** use tests, exit codes, file state and diffs where possible.
3. **Explicit uncertainty:** unverified requirements must remain unverified.
4. **Human oversight:** results support review; they are not guarantees of correctness.
5. **Safe by default:** this starter does not execute arbitrary commands from task JSON.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please open an issue before substantial work and use a branch and pull request.

## License

MIT. See [LICENSE](LICENSE).
