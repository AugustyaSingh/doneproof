# DoneProof

**Evidence-based verification for AI agent task completion.**

DoneProof checks explicit task requirements against observable evidence rather than trusting an agent's final message.

> **Status:** Early working prototype. The current verifier checks required files and recorded command results. It does not yet integrate Gemma or execute commands itself.

## Quick start

Requires Python 3.10+.

```bash
python -m unittest discover -s tests -v
python -m doneproof examples/sample_task.json
```

The sample task intentionally includes a failed command result. The CLI prints an evidence report and exits non-zero unless all specified checks pass.

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
- [ ] FastAPI endpoint and web dashboard
- [ ] Gemma-powered suggestions for verification plans
- [ ] Evaluation benchmark for agent tasks

## Safety and limitations

The prototype does not execute commands from task files. Recorded command results are supplied evidence; future adapters must capture them from trusted execution. A passing result is not proof beyond the checks listed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please open an issue before substantial changes and use branches and pull requests.

## License

MIT. See [LICENSE](LICENSE).
