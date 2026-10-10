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

## Safety boundary

Never run arbitrary shell commands from an untrusted task specification. A future command runner must use timeouts, a sandbox, allowlists and explicit permission boundaries.
