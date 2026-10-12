# DoneProof hackathon demo

## One-sentence description

DoneProof turns an AI coding task into a reviewed verification plan, checks
what it can observe in the selected repository, and returns a receipt that
shows what passed and what remains unknown.

## Two-minute talk track

### 0:00–0:25 — The problem

“A coding agent can say ‘done’ and hand over a diff. The reviewer still has to
work out which parts of the request were checked and what evidence supports
the result. CI can report test execution, and code review can judge a design;
neither automatically gives us a task-by-task evidence receipt.”

### 0:25–0:55 — What DoneProof adds

“The user supplies the task and selects an approved workspace. Gemma reads the
task with a bounded repository snapshot and proposes specific criteria. The
proposal is visible and editable. Trusted DoneProof code validates the plan,
checks supported file facts locally, and keeps every result scoped to the
contract. The report records the repository revision so we can see what state
was inspected.”

### 0:55–1:35 — Show the website

1. Open **Open verifier**. Point out the configured model and API-key status;
   do not display or paste the key.
2. Click the sample contract loaded from the API, then **Run verification**.
3. Open each result. In the current sample at the repository root, the README
   and verifier file pass, the intentionally missing regression-test path
   fails, and the supplied non-zero test result stays unverified because
   DoneProof did not run or authenticate that test process. The overall report
   is partial.
4. Enter a real coding task and click **Generate with Gemma**. Show the actual
   returned model name, proposed criteria, and repository revision. Point out
   that the model did not label anything as passed.
5. Apply the plan, review the editable contract, and run it. If the proposal
   includes a human-only criterion, DoneProof preserves it as unsupported
   instead of dropping it or pretending to evaluate it.
6. Scroll to **Run project tests** and click **Run Python unittest suite**.
   Show its observed exit code and captured output. This separate project-level
   result does not change per-criterion statuses or prove each task requirement.

### Optional judge examples

The runner's example cards are loaded from the API, which reads JSON contracts
from `examples/`. They are useful as short alternate walkthroughs after the
main `sample-fix` demonstration:

- **`artifact-review`** checks actual JSON syntax and a required documentation
  path. It also includes a human review criterion, which remains unsupported
  until a reviewer or trusted evaluator supplies evidence. The agent claim in
  the contract is context, not a result.
- **`workspace-boundary`** checks one real in-workspace path and one path that
  attempts to leave the selected workspace. The second result should be
  **failed** with path-rejection evidence; the verifier must not open that
  outside path.

Load and run these examples during the presentation to show JSON validation,
unsupported human judgment, and workspace confinement. Their results are
collected at run time; loading an example never pre-populates a receipt.

### 1:35–2:00 — Close

“The key design decision is the boundary: Gemma helps interpret open-ended
intent; deterministic code decides what local evidence says. A pass means the
listed checks passed, not that the whole task is correct. Missing evidence is
part of the result.”

## What each result means

- **Passed:** an observed fact or trusted evaluator satisfies this criterion.
- **Failed:** observed evidence contradicts a requirement, such as a missing
  required file.
- **Unverified:** the contract reports a result, but DoneProof did not observe
  or authenticate the process that produced it.
- **Unsupported:** no trusted evaluator is registered for that criterion.
- **Errored:** evaluation did not produce valid evidence; an error cannot pass.

The aggregate `VERIFIED` state applies only when every listed criterion has a
supported passing result. Mixed, missing, unsupported, or errored outcomes
remain partial instead of being folded into a green check.

## Questions judges may ask

**Why use Gemma?**

The request is natural language, and task-specific checks cannot all be
prewritten without recreating every task as custom deterministic code. Gemma
proposes criteria from the request and repository context. The proposal is
validated, inspectable, editable, and never treated as evidence by itself.

**Why not run the generated tests or commands?**

The demo has one fixed, server-owned Python unittest command that the user
starts explicitly. It uses no shell, has a timeout and output cap, and cannot
be changed by Gemma or a contract. It is not sandboxed, does not establish a
signed or externally authenticated revision, and its result is separate from
task-specific criteria. Executing arbitrary commands from a model-generated
plan would turn planning into code execution; that is not implemented.

**Does a pass certify the code change?**

No. It certifies only that each supported check listed in that particular
contract passed against the workspace state shown on the receipt. Reviewers
still need broader testing and judgment.

**Who is this for?**

Teams reviewing AI-assisted coding work: the author can make the intended
criteria explicit, and a reviewer can see which criteria have evidence rather
than relying on a completion summary alone.

## Current limits to state plainly

- Live Gemma planning and local path, digest, and JSON checks are implemented.
- A human reviews and starts the checks; the system does not run model-authored
  shell commands.
- Caller-reported test-run results in a contract remain unverified. The
  separate fixed local test preset records a real process result but does not
  authenticate the revision or prove task-specific coverage.
- Human behavior checks stay unsupported until a person reviews them or a
  trusted evaluator is added.
- Repository revision metadata is useful scope context; it does not prove who
  authored files or authenticate an external CI result.
