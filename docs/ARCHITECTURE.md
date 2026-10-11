# Architecture (initial)

## Current prototype

- **Task contract:** JSON can list generic checks. Built-in evaluators observe
  path existence/type, file SHA-256, and JSON syntax. Legacy `required_files`
  and `command_results` fields are translated into the same check flow, but
  reported command outcomes are unverified claims.
- **Evaluator extension:** a trusted integration can pass additional check
  evaluators to `verify_task`. Unknown check kinds stay unsupported and cannot
  produce a passing result.
- **Verifier:** evaluates observable evidence without trusting `agent_claim`.
- **Evidence report:** reports each check, evidence, and aggregate status.
- **Local API and dashboard:** a bounded local API accepts contracts and
  evaluates them through the same verifier. The React interface displays
  individual outcomes, evidence, unsupported checks, evaluator errors, and
  report scope. Example contracts are loaded from the examples directory.
- **Approved local check:** the API exposes one server-owned Python unittest
  command when the selected workspace contains `tests/`. It is started
  explicitly, uses `shell=False`, has a 60-second timeout and capped output,
  and is reported separately from contract criteria. It is not sandboxed and
  does not authenticate the revision tested.

## Planned architecture

1. Adapters capture evidence together with its producer, subject, and source
   identity; a task file's claim alone is not authenticated evidence.
2. A planner proposes task-specific requirements from the user goal.
3. A policy decision layer evaluates structured task and evidence data; a
   separate enforcement layer controls whether any action may run.
4. Deterministic evaluators inspect files, test attestations, repository state,
   API health, and other registered evidence types.
5. A report presents each decision, its evidence source, gaps, and uncertainty.
6. Optional Gemma integration helps interpret natural-language goals, but does
   not authenticate evidence or replace deterministic checks.
7. The browser UI remains an input and presentation layer; it cannot register
   evaluator code or authorize task-specified commands.

## Safety boundary

The API also restricts browser origins to local development origins by
default. `DONEPROOF_ALLOWED_ORIGINS` can configure a comma-separated list.
Workspace selection remains beneath `DONEPROOF_WORKSPACE_ROOT` (the server's
current directory by default). This unauthenticated local API is not intended
to be exposed directly to a network; a network deployment requires an
authenticating gateway and an unprivileged isolated process.

Never run arbitrary shell commands from an untrusted task specification. The
built-in test check reads a supplied exit code; it never starts a process and
does not authenticate where that result came from, so it cannot pass. Local
filesystem checks observe current state only. A future evidence adapter must
preserve provenance. A future general command runner must use timeouts, a
sandbox, allowlists and explicit permission boundaries. The current single
fixed preset is not a general command runner. Custom
evaluators are executable trusted code and must only be provided by the
integrating application, never by a task file or model response.

## Reference models

- [in-toto Attestation Framework](https://github.com/in-toto/attestation/blob/main/spec/README.md)
  separates predicate data, the subject it describes, and envelope
  authentication.
- [SLSA artifact verification](https://slsa.dev/spec/v1.2/verifying-artifacts)
  checks signer identity and signatures against explicit expectations.
- [OPA agent tool-calling guidance](https://www.openpolicyagent.org/docs/agent-tool-calling)
  separates policy decisions from the harness that enforces whether tools run.

These are design references for provenance and policy boundaries; the current
DoneProof prototype does not implement these attestation formats or trust
verification.
