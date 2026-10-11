import type { ReactNode } from 'react'
import { ArrowRight, CheckCheck, CircleHelp, ShieldCheck } from 'lucide-react'

export type ProductPageName = 'overview' | 'how-it-works' | 'examples' | 'documentation' | 'runner'
export type ProductHealth = 'checking' | 'online' | 'offline'
export type ProductCheck = {
  check?: string
  check_name?: string
  id?: string
  kind?: string
  status?: string
  evidence?: unknown
  evidence_source?: string
  error?: string
  expected_outcome?: string
  description?: string
}
export type ProductReport = {
  task_id?: string
  status?: string
  task_description?: string
  agent_claim?: string
  checks?: ProductCheck[]
  checks_passed?: number
  checks_failed?: number
  checks_unverified?: number
  checks_unsupported?: number
  checks_errored?: number
  repository?: { workspace?: string; branch?: string | null; revision?: string | null; working_tree_changes?: number }
}
export type ProductRun = { id: string; label: string; status: string; checks: number; time: string; report: ProductReport }
export type ProductSampleMap = Record<string, Record<string, unknown>>

type ProductPageProps = {
  page: 'how-it-works' | 'examples' | 'documentation'
  health: ProductHealth
  samples: ProductSampleMap
  runs: ProductRun[]
  onNavigate: (page: ProductPageName) => void
  onLoadSample: (name: string) => void
}

const pages = [
  ['overview', 'Overview'],
  ['how-it-works', 'How it works'],
  ['examples', 'Examples'],
  ['documentation', 'Documentation'],
] as const

function EditorialNav({ active, health, onNavigate }: { active: ProductPageName; health: ProductHealth; onNavigate: ProductPageProps['onNavigate'] }) {
  return <header className="ed-nav">
    <a className="ed-brand" href="#/" onClick={event => { event.preventDefault(); onNavigate('overview') }} aria-label="DoneProof home">
      <span className="ed-brand-mark"><CheckCheck size={18} strokeWidth={2.5} /></span><span>doneproof<i>.</i></span>
    </a>
    <nav className="ed-links" aria-label="Main navigation">{pages.map(([route, title]) => <a key={route} className={active === route ? 'active' : ''} aria-current={active === route ? 'page' : undefined} href={`#/${route === 'overview' ? '' : route}`} onClick={event => { event.preventDefault(); onNavigate(route) }}>{title}</a>)}</nav>
    <div className="ed-nav-actions"><span className={`ed-api ${health}`}><i />{health === 'online' ? 'API online' : health === 'offline' ? 'API offline' : 'Connecting'}</span><button className="ed-button ed-button-dark" onClick={() => onNavigate('runner')}>Open verifier <ArrowRight size={15} /></button></div>
  </header>
}

function PageIntro({ number, eyebrow, title, children }: { number: string; eyebrow: string; title: ReactNode; children: ReactNode }) {
  return <div className="ed-page-title"><span className="ed-mono">DONEPROOF / {eyebrow}</span><h1>{title}</h1><p>{children}</p><span className="ed-page-no">PAGE {number} / 03</span></div>
}

function ContentSection({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: ReactNode }) {
  return <section className="ed-detail-section" id={id}><h2>{title}</h2>{intro && <p className="ed-detail-lede">{intro}</p>}{children}</section>
}

function StatusStories({ detailed = false }: { detailed?: boolean }) {
  const statuses = [
    { name: 'PASSED', verb: 'An observed fact satisfied the criterion.', meaning: 'The evaluator gathered evidence from the selected workspace or a trusted host evaluator, and that evidence met the check’s defined condition.', example: 'A `required_file` check finds the named file beneath the approved workspace root.', next: 'Inspect the evidence and scope. A pass applies to this criterion alone; it does not certify the entire task or the quality of the file.' },
    { name: 'FAILED', verb: 'An observed fact contradicted the criterion.', meaning: 'The check ran and found a mismatch. This is different from an evaluator error: a failed check contains an observed condition that did not meet its requirement.', example: 'A required regression-test path is absent, or a file digest does not match the expected SHA-256 value.', next: 'Review the target and evidence. Fix the underlying gap or correct an inaccurate criterion, then run a new verification.' },
    { name: 'UNVERIFIED', verb: 'The available information is a claim, not an authenticated observation.', meaning: 'The contract may contain a reported result, but DoneProof did not observe the process that produced it. The report deliberately withholds a pass.', example: 'A caller says `unit tests passed` and supplies exit code 0. The verifier did not launch or authenticate that test process.', next: 'For a Python project with a tests folder, explicitly start the separate approved suite in the runner. Its observed result is project-level evidence; it does not change this criterion or authenticate a revision.' },
    { name: 'UNSUPPORTED', verb: 'No evaluator is registered for the criterion type.', meaning: 'The criterion remains in the report so it cannot disappear from the task. The verifier has no trusted implementation to assess it.', example: 'A model proposes a visual usability review or a deployment check, but this installation has no evaluator for that kind.', next: 'Complete the review manually and record it through a trusted process, or have the host application implement and test a suitable evaluator.' },
    { name: 'ERRORED', verb: 'Evaluation failed to produce a valid decision.', meaning: 'An evaluator raised an exception or returned an invalid decision/evidence value. An internal problem is not counted as success or as an observed failure.', example: 'A trusted evaluator returns unserializable evidence, omits its pass/fail decision, or raises while inspecting its target.', next: 'Read the error detail, fix the evaluator or workspace issue, and rerun. Keep the error visible in the current receipt.' },
  ]
  return <div className={`ed-status-explanations ${detailed ? 'detailed' : ''}`}>{statuses.map(status => <article className={`ed-status-explanation ${status.name.toLowerCase()}`} key={status.name}><span className="ed-mono">{status.name}</span><h3>{status.verb}</h3>{detailed && <><p>{status.meaning}</p><p><b>Example:</b> {status.example}</p><p><b>Next:</b> {status.next}</p></>}</article>)}</div>
}

function HowItWorksPage({ health, onNavigate }: Pick<ProductPageProps, 'health' | 'onNavigate'>) {
  const features = [
    { title: 'Task contract', body: 'The contract keeps the task identifier, description, claim, and independent checks together. It can be typed, edited as JSON, loaded from a file, or selected from a sample served by the API. Criteria should describe observable conditions rather than broad statements like “the feature works.” A contract records what should be verified; its presence is not evidence that the requested change exists.' },
    { title: 'Gemma plan proposal', body: 'When the user explicitly requests a plan, the local API sends the task, optional context, and bounded repository snapshot to the configured Gemma model. The plan parser validates fields, check kinds, targets, and inputs. The user can inspect and apply supported suggestions. A proposal can be incomplete or mistaken, so it remains editable and never sets a check to passed.' },
    { title: 'Deterministic verification', body: 'The verifier resolves evidence paths beneath the selected workspace, evaluates registered check kinds independently, and derives each status from the evaluator outcome. The built-in observations cover path presence/type, file SHA-256 comparison, and JSON syntax. A contract test_result stays unverified because it is caller-supplied. Separately, the API offers one fixed Python unittest suite when the workspace has a tests folder; that run is explicit and reported apart from contract criteria.' },
    { title: 'Evidence and provenance', body: 'Each result includes its evaluator source and evidence payload when available. Local file observations describe the workspace at check time. Repository metadata can identify the branch, revision, and count of changed paths; it does not prove authorship or authenticate an external test runner. Evidence is useful because a reviewer can inspect what supported the status and what the report cannot establish.' },
    { title: 'Claim & scope view', body: 'The report separates the task description and agent claim from observed outcomes. Its scope summary counts passed, failed, unverified, unsupported, and errored criteria. This makes a plausible completion narrative visible without letting that narrative change deterministic status decisions.' },
    { title: 'Raw report and download', body: 'Evidence is presented criterion by criterion; Claim & scope explains the request and boundary; Raw report exposes the JSON returned by the API. The download control saves that JSON for review or later processing. The current app keeps run history in browser-tab memory, so download the receipt if you need to retain it after leaving or reloading the session.' },
  ]
  const audiences = [
    ['Developers supervising coding agents', 'Turn a natural-language request into a reviewable list before accepting an agent’s completion summary. The current verifier is strongest where a requirement maps to files, digests, or valid JSON; behavioral tests still need a trusted execution source.'],
    ['Reviewers of agent-authored changes', 'Use the receipt to ask which requirements were observed, where evidence came from, and what remains untested. It supplements code review and CI; it does not replace either.'],
    ['Teams setting acceptance criteria', 'Make criteria explicit before hand-off so “done” has a narrower shared meaning. The local prototype has no persistent team ledger, access control, or shared sign-off workflow yet.'],
    ['Hackathon judges and demonstrators', 'Follow the task, the live model proposal, the evaluated checks, and the JSON receipt. The sample shows how a missing file can fail while a caller-reported test remains unverified.'],
    ['Integration builders', 'The Python verifier accepts trusted evaluator functions from its host, which is an extension point for application code. There is no shipped generic CI connector or agent platform integration.'],
  ]
  return <div className="editorial-home ed-inner-page"><EditorialNav active="how-it-works" health={health} onNavigate={onNavigate}/><main className="ed-inner-main">
    <PageIntro number="01" eyebrow="SYSTEM DESIGN" title={<>From a request to<br/><em>scoped evidence.</em></>}>DoneProof separates interpretation from verification. Gemma helps turn flexible task language into candidate criteria. Trusted application code validates the plan, checks supported evidence, and reports exactly what it can and cannot establish.</PageIntro>
    <ContentSection title="The architecture, step by step" intro="This diagram follows the current local dashboard and API flow. The red boundary marks the point where a person reviews the model’s proposal before any verification request is made.">
      <div className="ed-architecture" role="img" aria-label="Task enters the local API; bounded repository context and the task go to Gemma; a validated proposed plan returns for human review; the user authorizes a verification request; deterministic evaluators produce a scoped receipt.">
        <div className="ed-arch-node"><span>01 · HUMAN</span><b>Task and workspace</b><small>Original request + optional context</small></div><div className="ed-arch-arrow" aria-hidden="true">↓</div>
        <div className="ed-arch-node"><span>02 · LOCAL API</span><b>Bounded context</b><small>Revision and selected repository context</small></div><div className="ed-arch-arrow" aria-hidden="true">↓</div>
        <div className="ed-arch-node model"><span>03 · GEMMA</span><b>Candidate criteria</b><small>Interpretation only · no evidence decision</small></div><div className="ed-arch-arrow trust" aria-hidden="true">↓ REVIEW BEFORE APPLYING</div>
        <div className="ed-arch-node review"><span>04 · USER + VALIDATOR</span><b>Inspect and normalize plan</b><small>Schema, supported kinds, safe workspace targets</small></div><div className="ed-arch-arrow" aria-hidden="true">↓ EXPLICIT RUN ACTION</div>
        <div className="ed-arch-node deterministic"><span>05 · VERIFIER</span><b>Evaluate each check</b><small>Workspace-scoped observations and registered evaluators</small></div><div className="ed-arch-arrow" aria-hidden="true">↓</div>
        <div className="ed-arch-node receipt"><span>06 · REPORT</span><b>Scoped evidence receipt</b><small>Status, evidence, source, repository context, limitations</small></div>
      </div>
      <p className="ed-diagram-note"><ShieldCheck size={16}/> The API and verifier do not execute arbitrary commands proposed by Gemma. Local evidence requests are separate from plan generation and require the user to press Run verification.</p>
    </ContentSection>
    <ContentSection title="What happens at each trust boundary"><ol className="ed-flow-list">
      <li><span>01</span><div><b>Requirements enter as user input</b><p>The task description and optional context explain intent. They may include ambiguity, omissions, or sensitive material, so users should send only information they are comfortable sharing with the configured model provider when they request planning.</p></div><small>USER INPUT</small></li>
      <li><span>02</span><div><b>Repository context is bounded and untrusted</b><p>The server gathers branch/revision metadata, at most 100 tracked paths, at most 40 changed-path entries, and up to 5,000 README characters. Repository text can be wrong or adversarial; it helps Gemma draft criteria but does not certify anything.</p></div><small>LOCAL API</small></li>
      <li><span>03</span><div><b>Gemma generates candidates</b><p>The configured model returns structured JSON. Output is parsed and validated against supported planning kinds and safe targets. Model prose is not code execution authority, test evidence, or a pass/fail result.</p></div><small>MODEL</small></li>
      <li><span>04</span><div><b>The user reviews and initiates verification</b><p>Unsupported/manual suggestions are retained where possible. Applying a plan changes the editable contract; it does not run checks. The user inspects the contract and starts verification explicitly.</p></div><small>HUMAN REVIEW</small></li>
      <li><span>05</span><div><b>Deterministic code evaluates supported checks</b><p>Workspace path resolution prevents evidence paths from escaping the approved root. Each evaluator outcome produces passed, failed, unverified, unsupported, or errored; the aggregate state is derived from those outcomes.</p></div><small>VERIFIER</small></li>
      <li><span>06</span><div><b>The report limits its conclusion</b><p>A VERIFIED report means all listed checks passed according to their evaluator semantics. It does not mean the request was complete, the software is correct in every environment, or the evidence has authenticated provenance.</p></div><small>RECEIPT</small></li>
    </ol></ContentSection>
    <ContentSection title="The local API boundary" intro="The dashboard uses separate routes for planning, evidence evaluation, health, and sample contracts. Planning and verification are different user actions with different data flows.">
      <div className="ed-evidence-table-wrap"><table className="ed-evidence-table"><thead><tr><th>Route</th><th>Called when</th><th>What it does</th><th>Boundary</th></tr></thead><tbody>
        <tr><td><code>POST /api/plan</code></td><td>The user presses Generate with Gemma.</td><td>Validates the request, collects a bounded repository snapshot, calls the selected configured Gemma model, and validates the returned proposal.</td><td>Task/context and repository excerpt go to Google for this explicit action. The API key remains in the server environment. The result is only a proposed plan.</td></tr>
        <tr><td><code>POST /verify</code></td><td>The user presses Run verification.</td><td>Resolves the requested workspace beneath the approved root, runs the verifier on the contract, and adds repository identity metadata where available.</td><td>It does not call Gemma or execute contract commands. Path evidence is limited to the approved workspace.</td></tr>
        <tr><td><code>GET /api/health</code></td><td>The dashboard initializes and shows connection state.</td><td>Returns service readiness and safe model/key-configuration metadata.</td><td>It returns only whether a key is configured, never the key itself.</td></tr>
        <tr><td><code>GET /api/samples</code></td><td>The dashboard loads its example contracts.</td><td>Reads JSON examples from the project’s examples directory and returns valid contracts.</td><td>Loading a sample only populates the editor. It does not collect evidence until verification is explicitly run.</td></tr>
      </tbody></table></div>
    </ContentSection>
    <ContentSection title="Feature deep dives" intro="The product is intentionally split: interpretation can be flexible, while the decision path stays inspectable and deterministic."><div className="ed-feature-deep-list">{features.map((feature, index) => <article key={feature.title}><span className="ed-mono">FEATURE {String(index + 1).padStart(2,'0')}</span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div></ContentSection>
    <ContentSection title="Evidence types and their limits"><div className="ed-evidence-table-wrap"><table className="ed-evidence-table"><thead><tr><th>Input or evidence</th><th>What DoneProof does</th><th>Limit</th></tr></thead><tbody>
      <tr><td>Filesystem path</td><td>Checks whether a path exists and, when requested, whether it is a file or directory.</td><td>Describes the selected workspace at check time; it does not prove authorship or behavior.</td></tr>
      <tr><td>File digest</td><td>Computes SHA-256 from current file bytes and compares with the supplied expected digest.</td><td>A match establishes byte equality with that expectation, not who made the artifact or when.</td></tr>
      <tr><td>JSON document</td><td>Parses a workspace file to determine whether its syntax is valid JSON.</td><td>Valid syntax does not prove the values are correct or the file is used by the application.</td></tr>
      <tr><td>Caller-supplied test result</td><td>Preserves a reported exit code and summary as evidence from the task contract.</td><td>Always unverified in the built-in evaluator because the test process was not observed or authenticated.</td></tr>
      <tr><td>Unknown check kind</td><td>Retains it in the report as unsupported.</td><td>A future integration needs trusted, tested evaluator code; model output cannot register one.</td></tr>
    </tbody></table></div></ContentSection>
    <ContentSection title="Five outcomes, explained" intro="A status is a statement about one criterion and its evaluator—not a confidence score for the whole task."><StatusStories detailed/></ContentSection>
    <ContentSection title="Why the model and verifier are separate"><div className="ed-prose-columns"><p>Natural-language tasks vary too much for a fixed list of hand-written checks to describe every request. Gemma contributes interpretation: it can propose candidate criteria that fit the wording and bounded repository context. That flexibility also creates risk. A model may omit a requirement, misunderstand intent, suggest something unobservable, or produce a plausible but wrong check.</p><p>Deterministic code contributes repeatable evaluation of a defined condition. It can enforce path boundaries, validate the plan’s shape, inspect bytes or JSON syntax, and classify results. Determinism does not make the criterion complete: a check can pass while the implementation still has a defect outside its scope. That is why the person reviews the criteria and the report states its boundary.</p></div><aside className="ed-editorial-callout"><span className="ed-mono">DESIGN RULE</span><p>“The model helps choose <em>what might be worth checking.</em> Only evidence from an evaluator can determine <em>what this receipt supports.</em>”</p></aside></ContentSection>
    <ContentSection title="Who can use DoneProof today"><div className="ed-usecase-list">{audiences.map(([title, body], index) => <article key={title}><span className="ed-mono">USE CASE {String(index + 1).padStart(2,'0')}</span><h3>{title}</h3><p>{body}</p></article>)}</div></ContentSection>
    <div className="ed-subpage-footer"><a href="#/" onClick={event => {event.preventDefault();onNavigate('overview')}}>← DoneProof overview</a><button onClick={() => onNavigate('runner')}>Try the verifier <ArrowRight size={14}/></button></div>
  </main></div>
}

function getCheckLabel(check: ProductCheck, index: number) { return check.check_name || check.check || check.id || `${check.kind || 'Check'} ${index + 1}` }
function ExamplesPage({ health, samples, runs, onNavigate, onLoadSample }: Omit<ProductPageProps, 'page'>) {
  const sampleEntry = Object.entries(samples).find(([, sample]) => String(sample.task_id || '').toLowerCase() === 'sample-fix') || Object.entries(samples)[0]
  const sampleTaskDescription = String(sampleEntry?.[1].task_description || '')
  const sampleRun = [...runs].find(run => run.label === String(sampleEntry?.[1].task_id || sampleEntry?.[0] || 'sample-fix') && run.report.task_description === sampleTaskDescription)
  const checks = sampleRun?.report.checks || []
  const passing = checks.find(check => check.status === 'passed')
  const failing = checks.find(check => check.status === 'failed')
  const unverified = checks.find(check => check.status === 'unverified')
  const count = (key: keyof ProductReport) => typeof sampleRun?.report[key] === 'number' ? sampleRun.report[key] as number : 0
  const runScope = sampleRun?.report.repository
  const activeScenarios = [
    { title: 'A requirement supported by observed evidence', check: passing, fallback: 'In the sample contract, existing required-file checks can pass when the files are present beneath the selected workspace.', consequence: 'A pass means that this path condition was true when the verifier inspected it. It says nothing about the file’s behavior or whether other requirements were satisfied.' },
    { title: 'A required artifact is missing', check: failing, fallback: 'The fixture names an intentionally absent regression-test path. If it remains absent in the selected workspace, the verifier should report a failed required-file observation.', consequence: 'A failed observation makes the gap reviewable. Check the target path, add the missing artifact if required, then rerun.' },
    { title: 'A test result is only reported', check: unverified, fallback: 'The sample includes a caller-reported test exit code, which remains unverified. You can separately launch the fixed Python unittest suite from the runner; its result does not change the sample criterion.', consequence: 'A reported zero exit code cannot become a pass by itself. Use an authenticated CI or trusted host evaluator when one is implemented.' },
  ]
  const reportText = (check?: ProductCheck) => check ? JSON.stringify(check.evidence ?? 'No evidence payload', null, 2) : ''
  return <div className="editorial-home ed-inner-page"><EditorialNav active="examples" health={health} onNavigate={onNavigate}/><main className="ed-inner-main">
    <PageIntro number="02" eyebrow="REAL CONTRACTS, REAL OBSERVATIONS" title={<>Examples that show<br/><em>the evidence boundary.</em></>}>These case studies are based on contracts served by the local API. A contract is not a result: the current workspace must be checked before any live status or evidence is displayed. Run the sample to populate the case studies below with its actual receipt.</PageIntro>
    <ContentSection title="A single task can have different evidence states" intro="The shipped sample contract claims a fix is complete, lists two expected files and one intentionally missing regression test, and supplies a reported test result. The report below is populated only after this browser session has run that contract.">
      {sampleRun ? <div className="ed-live-example"><div className="ed-live-example-heading"><span className="ed-mono">OBSERVED IN THIS SESSION</span><span className={`ed-live-result ${String(sampleRun.status).toLowerCase()}`}>{sampleRun.status}</span></div><p><b>Task:</b> {sampleRun.report.task_description || sampleRun.label}</p><p><b>Claim:</b> {sampleRun.report.agent_claim || 'No agent claim supplied.'}</p><div className="ed-live-counts"><span>{count('checks_passed')} passed</span><span>{count('checks_failed')} failed</span><span>{count('checks_unverified')} unverified</span><span>{count('checks_unsupported')} unsupported</span><span>{count('checks_errored')} errors</span></div><small>Workspace: {runScope?.workspace || 'not reported'} · branch: {runScope?.branch || 'unavailable'} · revision: {runScope?.revision?.slice(0,7) || 'unavailable'} · {sampleRun.time}</small></div> : <div className="ed-no-live-example"><CircleHelp size={18}/><p>No sample receipt is stored in this tab yet. Load the sample and explicitly run verification to see live outcomes here; no results are prefilled.</p></div>}
      {sampleEntry && <button className="ed-button ed-button-rust" onClick={() => { onLoadSample(sampleEntry[0]); onNavigate('runner') }}>Load {String(sampleEntry[1].task_id || sampleEntry[0])} into the verifier <ArrowRight size={15}/></button>}
    </ContentSection>
    <ContentSection title="Case studies from the sample" intro="When available, the evidence panel below uses evaluator results from the latest sample run in this browser tab. Without a run it describes the fixture and expected check behavior, not a fabricated receipt.">
      <div className="ed-case-studies">{activeScenarios.map((scenario, index) => <article key={scenario.title}><span className="ed-mono">CASE {String(index + 1).padStart(2,'0')} · {scenario.check?.status?.toUpperCase() || 'FIXTURE EXPLANATION'}</span><h3>{scenario.title}</h3><p>{scenario.fallback}</p>{scenario.check && <div className="ed-case-observation"><b>{getCheckLabel(scenario.check, index)}</b><span>Kind: {scenario.check.kind || 'not returned'} · Status: {scenario.check.status || 'not returned'} · Source: {scenario.check.evidence_source || 'not returned'}</span><pre>{reportText(scenario.check)}</pre></div>}<p><b>Interpretation and next step:</b> {scenario.check ? scenario.consequence : `${scenario.consequence} Run the contract to see the actual observation for your selected workspace.`}</p></article>)}</div>
      <article className="ed-case-aggregate"><span className="ed-mono">CASE 04 · THE AGGREGATE</span><h3>Some checks pass while another stays unresolved</h3><p>The overall report summarizes the listed criteria; it does not erase their individual states. A mixture of pass, fail, unverified, unsupported, or error outcomes is reported as PARTIAL. If the actual sample result appears above, inspect the raw report for every per-check result and limitation.</p>{sampleRun && <p className="ed-aggregate-facts"><b>Observed aggregate:</b> {sampleRun.status} · {checks.length} checks · {count('checks_passed')} passed / {count('checks_failed')} failed / {count('checks_unverified')} unverified / {count('checks_unsupported')} unsupported / {count('checks_errored')} errors.</p>}</article>
    </ContentSection>
    <ContentSection title="How to reproduce the walkthrough"><ol className="ed-doc-steps"><li><b>Choose the API-served sample</b><p>Use the button above or open Verification runner and select the sample card. Loading changes the editor only; it does not collect evidence.</p></li><li><b>Run verification explicitly</b><p>DoneProof reads the current selected workspace and evaluates every listed check. The contract test result remains a caller claim. You can separately run the fixed Python unittest suite below the contract and inspect its captured result.</p></li><li><b>Inspect each criterion</b><p>Open Evidence for the evaluator payload, Claim &amp; scope for the requested work and limitations, or Raw report for the complete JSON response.</p></li><li><b>Return to Examples</b><p>The real outcome from this tab’s sample run appears above. It is session memory, not an archived receipt; use the report download if you need a durable copy.</p></li></ol></ContentSection>
    <div className="ed-subpage-footer"><a href="#/" onClick={event => {event.preventDefault();onNavigate('overview')}}>← DoneProof overview</a><button onClick={() => onNavigate('runner')}>Open verifier <ArrowRight size={14}/></button></div>
  </main></div>
}

const contractExample = `{
  "task_id": "release-check",
  "task_description": "Validate the generated release manifest.",
  "agent_claim": "The manifest is ready.",
  "checks": [
    { "id": "manifest-file", "kind": "required_file", "path": "dist/manifest.json" },
    { "id": "manifest-json", "kind": "json_valid", "path": "dist/manifest.json" },
    { "id": "test-claim", "kind": "test_result", "exit_code": 0, "summary": "Tests passed" }
  ]
}`

function DocumentationPage({ health, onNavigate }: Pick<ProductPageProps, 'health' | 'onNavigate'>) {
  const faqs = [
    ['Does DoneProof prove a coding agent is correct?', 'No. A report covers only the explicit criteria it evaluated against the selected evidence. It does not establish that the implementation satisfies every requirement or is correct in all environments.'],
    ['Is Gemma the final judge of success?', 'No. Gemma proposes a plan. The API validates the response shape and supported criteria; the verifier or trusted host evaluator determines per-check outcomes from evidence. A person should review the plan before applying it.'],
    ['Can DoneProof execute generated commands?', 'DoneProof does not execute arbitrary commands generated by Gemma or written in a task contract. It offers one fixed Python unittest command, started explicitly by the user, with a timeout and output cap. That local command is not sandboxed or linked to individual task criteria; broader execution needs isolation and provenance.'],
    ['What does PARTIAL mean?', 'The per-check outcomes are mixed, at least one check remains unverified/unsupported/errored, or the contract contains no checks. When every check fails the aggregate is FAILED; when every check passes it is VERIFIED. Inspect each criterion to understand the reason. PARTIAL is not a percentage confidence score.'],
    ['Why can a reported passing test remain unverified?', 'An exit code and summary can be typed into a contract by any caller. Without observing the process or verifying a signed/trusted CI record, DoneProof cannot establish which code ran, where it ran, or whether the report is authentic.'],
    ['What happens if the Gemma API key is missing?', 'The local verification API and deterministic checks can still work. Plan generation returns a configuration/provider error instead of silently substituting a handcrafted plan. The health endpoint reports a boolean key-configured state, not the key itself.'],
    ['Can I use DoneProof without a live Gemma API?', 'Yes. Load or write a task contract and run its checks locally. Gemma is an optional planning aid; it is not needed for the deterministic verifier. A model-generated proposal is available only when credentials and provider connectivity are configured.'],
    ['What check types are built in?', '`required_file`, `path_exists`, `file_sha256`, `json_valid`, and `test_result`. The last one remains unverified by design. Additional kinds can be supplied by trusted host code through the Python evaluator interface; a contract or model cannot register evaluators.'],
    ['How do I add a check type?', 'Implement a trusted evaluator in the host application, validate the input and evidence it returns, add tests for success, failure, invalid output, errors, and path safety where relevant, then pass it to verify_task through check_evaluators. Do not make a model-proposed function executable.'],
    ['What should missing evidence mean?', 'Keep the affected criterion unresolved or unsupported. Do not convert absence of evidence into a pass. If an observed required artifact is absent, that criterion fails; if the system cannot evaluate a criterion or authenticate a claim, it stays unsupported or unverified.'],
    ['What does DoneProof not guarantee today?', 'It does not guarantee overall task correctness, code quality, security, test coverage, authorship, timestamp authenticity, CI provenance, or behavior outside the evaluated conditions. It has no generic CI connector, remote team ledger, signatures, or arbitrary test runner; the one fixed local unittest preset is limited to a project-level run.'],
  ]
  const glossary = [
    ['Task contract', 'A JSON object that identifies the task, may include a completion claim, and declares criteria the verifier should evaluate.'],
    ['Verification criterion', 'One bounded condition to check, with a kind and relevant target or inputs. A plan can propose criteria; only the verifier assigns results.'],
    ['Evidence', 'The evaluator output recorded for a criterion, such as a path observation or digest comparison. Evidence has a source and a scope.'],
    ['Provenance', 'Information establishing where evidence came from, what process produced it, and which code/revision/environment it concerns. Current local receipts expose some repository context but do not authenticate an external process.'],
    ['Supported check', 'A criterion kind for which a built-in or trusted host evaluator is registered. Supported means evaluable, not necessarily sufficient to prove a broad requirement.'],
    ['PARTIAL', 'Aggregate report state used when the criteria are not all passed, including mixed results, unresolved checks, or no checks. Use per-check statuses for the reason.'],
    ['Mutation score', 'A benchmark metric comparing seeded faults detected to the measured fault set. DoneProof’s current benchmark is a controlled fixture calibration, not a production defect-detection claim.'],
    ['Receipt', 'The JSON verification report with aggregate status, individual outcomes, evidence, repository context when available, and limitations.'],
  ]
  return <div className="editorial-home ed-inner-page"><EditorialNav active="documentation" health={health} onNavigate={onNavigate}/><main className="ed-inner-main">
    <PageIntro number="03" eyebrow="DOCUMENTATION AND FIELD GUIDE" title={<>Make a useful claim.<br/><em>Read its receipt.</em></>}>This guide documents the current local coding-task workflow: installation, Gemma configuration, task contracts, supported evidence checks, report interpretation, troubleshooting, limitations, and extension points.</PageIntro>
    <nav className="ed-doc-toc" aria-label="Documentation sections">{[['setup','Getting started'],['contract','Task contract'],['check-types','Check types'],['reading-report','Reading a report'],['troubleshooting','Troubleshooting'],['faq','FAQ'],['glossary','Glossary'],['roadmap','Roadmap']].map(([id,title])=><a key={id} href={`#${id}`}>{title}</a>)}</nav>
    <ContentSection id="setup" title="Getting started" intro="Commands below follow this repository’s README. Run them from the repository root; on Windows, use a PowerShell session for the environment-variable examples.">
      <ol className="ed-doc-steps"><li><b>Install prerequisites</b><p>Use Python 3.10 or newer, Node.js 20.19+ or a supported current Node version, and pnpm. The JavaScript package manager is required only to build or develop the frontend.</p></li><li><b>Install the API and UI dependencies</b><code>python -m pip install -r requirements.txt -r requirements-gemma.txt</code><code>pnpm install --frozen-lockfile</code><p>Gemma’s Python client is installed from the Gemma requirements file. Offline verification and tests do not make live provider calls.</p></li><li><b>Configure the optional Gemma credential</b><p>Set <code>GEMINI_API_KEY</code> in the server process environment. In PowerShell, for the current terminal session:</p><code>$env:GEMINI_API_KEY = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')</code><p>Never paste the key into a task, repository context, or report. The server’s health route returns only whether a key is configured.</p></li><li><b>Build and start the local application</b><code>pnpm build</code><code>python -m doneproof --serve</code><p>The default page is <code>http://127.0.0.1:8000</code>. If port 8000 is occupied, set <code>$env:DONEPROOF_PORT = '8001'</code> before starting and use <code>http://127.0.0.1:8001</code>. The API reads the workspace root from <code>DONEPROOF_WORKSPACE_ROOT</code>, defaulting to its current working directory.</p></li><li><b>Run the task workflow</b><p>Open the verifier, choose the workspace directory beneath the approved root, describe the coding task, and optionally add context. Generate a plan only when you want to send that text and bounded repository context to Google’s configured Gemma API. Review and apply the proposal, edit the JSON contract as needed, and press Run verification to collect local evidence. Then scroll below the contract and press Run Python unittest suite for a separate project-level test run.</p></li><li><b>Inspect and preserve the receipt</b><p>Use Evidence to inspect each criterion, Claim &amp; scope to compare request and claim with the report boundary, and Raw report to see the API JSON. Use Download report JSON to save a copy; in-browser run history is not durable.</p></li></ol>
    </ContentSection>
    <ContentSection id="contract" title="Writing a useful task contract" intro="A good contract turns broad intent into specific, independently checkable conditions. Avoid criteria such as “the feature is polished” unless a trusted evaluator can define and measure that statement.">
      <pre className="ed-code-example">{contractExample}</pre><div className="ed-prose-columns"><p><b>Task ID and description:</b> Use a stable, human-readable identifier and preserve the request’s important constraints. The description is context for the report, not a check.</p><p><b>Agent claim:</b> This is a statement for comparison. It does not affect the evaluator’s status. A claim that “everything passes” cannot turn an absent file into a pass.</p><p><b>Check ID and kind:</b> Unique IDs make results easier to discuss. The kind selects the trusted evaluator. Exact required fields vary by kind; path-based checks require workspace-relative or allowed paths.</p><p><b>Expected outcome:</b> Keep expectations observable and narrow. One check per condition is easier to explain and avoids one broad check obscuring a failure inside it.</p></div>
    </ContentSection>
    <ContentSection id="check-types" title="Built-in check types" intro="These are the built-in verifier kinds returned by the current implementation. The local workspace is read for filesystem checks; the test result kind intentionally does not execute tests.">
      <div className="ed-evidence-table-wrap"><table className="ed-evidence-table"><thead><tr><th>Kind</th><th>Required input</th><th>Observation/result</th><th>Important limit</th></tr></thead><tbody>
        <tr><td><code>required_file</code></td><td><code>path</code></td><td>Checks whether the required file exists within the workspace.</td><td>Presence alone does not test file content or application behavior.</td></tr>
        <tr><td><code>path_exists</code></td><td><code>path</code>; optional <code>entry_type</code>: <code>any</code>, <code>file</code>, or <code>directory</code></td><td>Checks observed path existence and requested filesystem entry type.</td><td>It cannot establish that the app uses or correctly processes the path.</td></tr>
        <tr><td><code>file_sha256</code></td><td><code>path</code> and expected 64-character hex <code>sha256</code></td><td>Reads file bytes and compares their SHA-256 digest to the expectation.</td><td>Digest equality does not authenticate origin, creation time, or semantic correctness.</td></tr>
        <tr><td><code>json_valid</code></td><td><code>path</code></td><td>Attempts to parse the file as JSON and reports syntax validity.</td><td>Valid JSON may still violate the intended schema or contain wrong values.</td></tr>
        <tr><td><code>test_result</code></td><td>Integer <code>exit_code</code>; optional descriptive <code>summary</code></td><td>Preserves the caller-supplied result and marks it unverified.</td><td>Does not run a command, authenticate CI, or establish what source revision was tested.</td></tr>
      </tbody></table></div><p className="ed-detail-lede">Unknown kinds remain visible as UNSUPPORTED. Trusted host code can extend the Python verifier by supplying evaluator functions; generated plans cannot install or replace them.</p>
    </ContentSection>
    <ContentSection id="reading-report" title="Reading the report" intro="The report is organized around evidence rather than a single completion claim.">
      <div className="ed-feature-deep-list"><article><span className="ed-mono">EVIDENCE TAB</span><h3>Inspect each result</h3><p>Select a criterion to see its kind, status, evaluator source, expected outcome, observed evidence, and an error detail if evaluation failed. A missing evidence payload is not evidence of success.</p></article><article><span className="ed-mono">CLAIM & SCOPE TAB</span><h3>Compare request, claim, and boundary</h3><p>This view shows the attached task description and agent claim separately. It explains whether the listed checks all passed and counts unresolved criteria. The result remains scoped to the contract.</p></article><article><span className="ed-mono">RAW REPORT TAB</span><h3>See the API response</h3><p>Inspect the serialized report, including statuses, per-check evidence, aggregate counts, repository revision metadata, and limitations. This is useful for debugging or downstream processing.</p></article><article><span className="ed-mono">DOWNLOAD</span><h3>Keep a JSON copy</h3><p>The report download saves the current JSON result. The receipt describes the workspace at check time; it is not signed and does not prevent that workspace from changing afterward.</p></article></div>
      <StatusStories/>
    </ContentSection>
    <ContentSection id="troubleshooting" title="Troubleshooting"><div className="ed-faq"><details><summary>The page says the API is offline</summary><p>Start the Python API with <code>python -m doneproof --serve</code> from the repository root. If the default port is already in use, choose another with <code>DONEPROOF_PORT</code>, then open that same local port. In Vite development, the API proxy must target the running backend.</p></details><details><summary>Gemma planning is unavailable, but local checks work</summary><p>Check that <code>GEMINI_API_KEY</code> is present in the environment inherited by the API process, that the selected model is supported, and that the machine can reach Google’s API. Restart the API after changing environment variables. A missing key should produce a clear plan-generation error; it should not create a fake live plan.</p></details><details><summary>A path check fails unexpectedly</summary><p>Check the workspace directory shown in the runner and confirm that the target is relative to the approved root. The API rejects workspace roots outside its configured boundary. Windows paths and current working directories must be interpreted on the machine running the API.</p></details><details><summary>A reported test is not green</summary><p>That is expected: caller-supplied exit codes remain unverified. The contract summary alone does not prove tests executed. The runner offers one fixed Python unittest command when the selected workspace contains tests/, but it is separate from the contract and does not authenticate the tested revision.</p></details><details><summary>A model proposal contains unsupported criteria</summary><p>Review the wording and supported kinds. A human-only suggestion should stay visible; unsupported criteria should not be silently dropped. Apply supported items, then edit or document the remaining work rather than labeling it passed.</p></details></div></ContentSection>
    <ContentSection id="faq" title="Frequently asked questions"><div className="ed-faq">{faqs.map(([question, answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></ContentSection>
    <ContentSection id="glossary" title="Glossary"><dl className="ed-glossary">{glossary.map(([term, definition])=><div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl></ContentSection>
    <section className="ed-roadmap" id="roadmap"><span className="ed-mono">ROADMAP · PROPOSED, NOT SHIPPED</span><h2>Extend evidence<br/><em>without weakening trust.</em></h2><p><b>Implemented today:</b> local API and dashboard, optional live Gemma planning, schema/target validation, deterministic path/digest/JSON checks, unverified caller test claims, a separate fixed local Python test command, scoped JSON reports, and a controlled reference-plan calibration benchmark.</p><p><b>Possible future work:</b> authenticated CI provenance, safe isolated test execution with explicit approvals, durable signed receipts, broader well-tested evaluator integrations, and persistent multi-user history. These require design, implementation, and validation before they can be presented as product features.</p></section>
    <div className="ed-subpage-footer"><a href="#/" onClick={event => {event.preventDefault();onNavigate('overview')}}>← DoneProof overview</a><button onClick={() => onNavigate('runner')}>Open verifier <ArrowRight size={14}/></button></div>
  </main></div>
}

export function ProductPage(props: ProductPageProps) {
  if (props.page === 'how-it-works') return <HowItWorksPage health={props.health} onNavigate={props.onNavigate}/>
  if (props.page === 'examples') return <ExamplesPage health={props.health} samples={props.samples} runs={props.runs} onNavigate={props.onNavigate} onLoadSample={props.onLoadSample}/>
  return <DocumentationPage health={props.health} onNavigate={props.onNavigate}/>
}

export function ProductOverviewDetails({ onNavigate }: { onNavigate: ProductPageProps['onNavigate'] }) {
  const features = [
    ['Task-specific criteria', 'A task is translated into separate requirements a reviewer can inspect. Gemma can suggest criteria that reflect the wording and bounded repository context, while the user can reject or edit suggestions before they enter the contract. This keeps interpretation visible instead of hiding it in an agent’s completion narrative.'],
    ['Deterministic evidence checks', 'The verifier evaluates only kinds implemented by its built-ins or registered by trusted host code. It can observe selected filesystem facts, compare file bytes to a supplied digest, and parse JSON syntax. It does not infer that a file is correct merely because it exists.'],
    ['An honest unresolved state', 'When a result is only reported, no evaluator is available, or evaluation fails, the receipt keeps that distinction. This prevents a missing test integration or human judgment requirement from quietly turning into a green result.'],
    ['A reviewable receipt', 'The dashboard shows one outcome per criterion, its evidence, repository context when available, the original claim and limitations. Raw JSON can be downloaded so a reviewer has something concrete to inspect or keep.'],
  ]
  const audiences = [
    ['Agent supervisors', 'Use criteria to check whether an automated coding hand-off has evidence attached. The current implementation handles local file-based facts particularly well; the project suite is available as a separate explicit action, but behavior still requires task-relevant tests or human review.'],
    ['Code reviewers', 'Treat the receipt as a map of what was checked, not as approval of the patch. It can make a missing artifact or a self-reported test result obvious before broader review.'],
    ['Teams and integration authors', 'Use the JSON contract and verifier extension point as a starting point for a trusted host integration. Shared history, authentication, signed provenance, and general CI integrations are not shipped today.'],
  ]
  return <>
    <section className="ed-section ed-overview-deep">
      <div className="ed-section-index"><span>06</span><span>WHAT THE PRODUCT PROVIDES</span></div>
      <div className="ed-method-heading"><h2>Useful because<br/><em>the gaps stay visible.</em></h2><p>Four pieces of a reviewable hand-off—not a universal correctness certificate.</p></div>
      <div className="ed-feature-deep-list">{features.map(([title, body], index)=><article key={title}><span className="ed-mono">CAPABILITY {String(index+1).padStart(2,'0')}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>
    <section className="ed-section ed-overview-deep">
      <div className="ed-section-index"><span>07</span><span>A REALISTIC FAILURE MODE</span></div>
      <div className="ed-problem-grid"><h2>“I fixed the regression.”<br/><em>Where is the test?</em></h2><div className="ed-problem-copy"><p>Imagine an agent says it repaired a bug and that every test passes. The patch may look plausible, but the regression test that should prevent the bug from returning is missing. A broad success message does not reveal that omission.</p><p>DoneProof can place the missing test path beside the other requirements. If that path is absent beneath the selected workspace, the required-file check fails with an observed path result. If the contract also includes “tests passed” and an exit code, the built-in test-result evaluator keeps that statement unverified: it did not run the tests or authenticate a CI record.</p><p>The combination is more useful than a blanket green badge. The reviewer sees the observed gap and the unverified contract claim. The fixed local test action can show a real suite run separately, but it does not prove that specific criterion. The sample fixture demonstrates this distinction; the actual result depends on the workspace at run time.</p><button className="ed-inline-link ed-link-button" onClick={() => onNavigate('examples')}>Explore the live sample case <ArrowRight size={14}/></button></div></div>
    </section>
    <section className="ed-section ed-overview-deep">
      <div className="ed-section-index"><span>08</span><span>READ EACH RESULT CAREFULLY</span></div>
      <div className="ed-outcomes-heading"><h2>Five states.<br/><em>Five different reasons.</em></h2><p>These detailed explanations describe what each criterion status does and does not establish.</p></div>
      <StatusStories detailed/>
      <button className="ed-inline-link ed-link-button" onClick={() => onNavigate('documentation')}>Read the full verification guide <ArrowRight size={14}/></button>
    </section>
    <section className="ed-section ed-overview-deep">
      <div className="ed-section-index"><span>09</span><span>WHO IT IS FOR</span></div>
      <div className="ed-method-heading"><h2>Make the hand-off<br/><em>easier to review.</em></h2><p>For people who supervise, review, or build around AI-assisted coding work.</p></div>
      <div className="ed-usecase-list">{audiences.map(([title, body], index)=><article key={title}><span className="ed-mono">AUDIENCE {String(index+1).padStart(2,'0')}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>
    <section className="ed-section ed-overview-deep ed-overview-cta">
      <div className="ed-section-index"><span>10</span><span>EXPLORE THE IMPLEMENTATION</span></div>
      <div className="ed-overview-links"><button onClick={() => onNavigate('how-it-works')}><span className="ed-mono">SYSTEM DESIGN</span><b>How it works</b><small>Trace the model, validator, evaluator, and report boundary.</small><ArrowRight size={17}/></button><button onClick={() => onNavigate('examples')}><span className="ed-mono">PRACTICAL CASES</span><b>Examples</b><small>Run the real sample and inspect the observed outcomes.</small><ArrowRight size={17}/></button><button onClick={() => onNavigate('documentation')}><span className="ed-mono">FIELD GUIDE</span><b>Documentation</b><small>Setup, contract schema, evidence semantics, FAQ, and glossary.</small><ArrowRight size={17}/></button></div>
    </section>
  </>
}
