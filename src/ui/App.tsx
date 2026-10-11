import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent, KeyboardEvent, ReactNode } from 'react'
import './editorial.css'
import { ProductOverviewDetails, ProductPage } from './ProductPages'
import {
  Activity, ArrowDownToLine, ArrowRight, Braces, Check, CheckCheck, ChevronDown,
  CircleAlert, CircleCheck, CircleHelp, Clock3, ExternalLink, FileCheck2, FileJson2,
  FileUp, FolderOpen, Gauge, HardDrive, History, LayoutDashboard, LoaderCircle,
  Menu, Play, Plus, RotateCcw, ShieldCheck, Sparkles, X,
} from 'lucide-react'

type CheckResult = {
  check_name?: string
  check?: string
  id?: string
  kind?: string
  status?: string
  passed?: boolean | null
  evidence?: unknown
  evidence_source?: string
  error?: string
  description?: string
  expected_outcome?: string
}
type RepositorySnapshot = { workspace: string; branch?: string | null; revision?: string | null; working_tree_changes?: number; source?: string }
type Report = {
  task_id?: string
  status?: string
  checks?: CheckResult[]
  checks_passed?: number
  checks_failed?: number
  checks_unverified?: number
  checks_unsupported?: number
  checks_errored?: number
  task_description?: string
  repository?: RepositorySnapshot
  [key: string]: unknown
}
type SampleMap = Record<string, Record<string, unknown>>
type ApprovedCheck = { id: string; label: string; timeout_seconds: number }
type ApprovedCheckResult = { check_id: string; label: string; status: string; exit_code: number | null; timed_out: boolean; duration_seconds: number; output: string; command: string[]; evidence_source: string; limitations: string[] }
type ApprovedCheckRun = ApprovedCheckResult & { id: string; time: string }
type ContextFile = { name: string; content: string; characters: number }
type ProposedPlan = { schema_version: string; task_summary: string; checks: Array<{ id: string; kind: string; target: string; inputs: Record<string, unknown>; expected_outcome: string; description: string; requires_human_approval: boolean }>; generation?: Record<string, unknown> }
type PlanResponse = { plan: ProposedPlan; generation?: Record<string, unknown>; repository?: RepositorySnapshot }
type Tab = 'evidence' | 'claim' | 'raw'
type Run = { id: string; label: string; status: string; checks: number; time: string; report: Report }
type Page = 'overview' | 'how-it-works' | 'examples' | 'documentation' | 'runner'

function pageFromLocation(): Page {
  const route = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  if (route === 'how-it-works' || route === 'examples' || route === 'documentation' || route === 'runner') return route
  return 'overview'
}

const starterContract = JSON.stringify({
  task_id: 'artifact-review',
  agent_claim: 'The requested output and test evidence are ready for review.',
  checks: [
    { id: 'output-file', kind: 'required_file', path: 'dist/output.json' },
    { id: 'tests', kind: 'test_result', exit_code: 0, summary: 'Recorded CI result' },
  ],
}, null, 2)

function pretty(value: unknown) { return JSON.stringify(value, null, 2) }
function asCount(value: unknown) { return typeof value === 'number' ? value : 0 }
function sampleCheckCount(sample: Record<string, unknown>) {
  if (Array.isArray(sample.checks)) return sample.checks.length
  return ['required_files', 'command_results', 'expected_files', 'checks'].reduce((total, key) => total + (Array.isArray(sample[key]) ? (sample[key] as unknown[]).length : 0), 0)
}
function resultStatus(check: CheckResult) {
  const status = String(check.status || '').toLowerCase()
  if (status) return status
  if (check.passed === true) return 'passed'
  if (check.passed === false) return 'failed'
  return 'unsupported'
}
function comparisonKey(check: CheckResult, index: number) {
  return String(check.id || check.check_name || check.check || `${check.kind || 'check'}-${index + 1}`)
}
function comparisonEntries(checks: CheckResult[]) {
  const seen = new Map<string, number>()
  return checks.map((check, index) => {
    const base = comparisonKey(check, index)
    const occurrence = seen.get(base) || 0
    seen.set(base, occurrence + 1)
    return [`${base}${occurrence ? ` · ${occurrence + 1}` : ''}`, check] as const
  })
}
function labelFor(check: CheckResult, index: number) {
  return check.check_name || check.check || check.id || `${check.kind || 'Check'} ${index + 1}`
}
function handleResultTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, activeTab: Tab, changeTab: (tab: Tab) => void) {
  const tabs: Tab[] = ['evidence', 'claim', 'raw']
  const currentIndex = tabs.indexOf(activeTab)
  const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length
    : event.key === 'ArrowLeft' ? (currentIndex + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : currentIndex
  if (nextIndex === currentIndex) return
  event.preventDefault()
  const nextTab = tabs[nextIndex]
  changeTab(nextTab)
  document.getElementById(`report-tab-${nextTab}`)?.focus()
}
function IconButton({ label, children, onClick, className = '' }: { label: string; children: ReactNode; onClick: () => void; className?: string }) {
  return <button aria-label={label} title={label} className={`icon-button ${className}`} onClick={onClick}>{children}</button>
}

export default function App() {
  const [page, setPageState] = useState<Page>(pageFromLocation)
  const [rawTask, setRawTask] = useState(starterContract)
  const [workspace, setWorkspace] = useState('.')
  const [report, setReport] = useState<Report | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('evidence')
  const [samples, setSamples] = useState<SampleMap>({})
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [gemmaReady, setGemmaReady] = useState(false)
  const [gemmaModel, setGemmaModel] = useState('gemma-4-26b-a4b-it')
  const [busy, setBusy] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [planTask, setPlanTask] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([])
  const [proposedPlan, setProposedPlan] = useState<PlanResponse | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [compareRuns, setCompareRuns] = useState(false)
  const [approvedChecks, setApprovedChecks] = useState<ApprovedCheck[]>([])
  const [approvedChecksState, setApprovedChecksState] = useState<'loading' | 'available' | 'none' | 'unavailable'>('loading')
  const [approvedChecksRetry, setApprovedChecksRetry] = useState(0)
  const [approvedRuns, setApprovedRuns] = useState<ApprovedCheckRun[]>([])
  const [runningApproved, setRunningApproved] = useState(false)
  const [coverageRequirements, setCoverageRequirements] = useState('')
  const [coverageMapping, setCoverageMapping] = useState<Record<string, string>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [demoSession, setDemoSession] = useState<{ required: boolean; configured: boolean; authenticated: boolean } | null>(null)
  const [demoPassword, setDemoPassword] = useState('')
  const [demoLoginError, setDemoLoginError] = useState('')
  const [demoLoginBusy, setDemoLoginBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const contextFilesRef = useRef<HTMLInputElement>(null)
  function setPage(next: Page) {
    setPageState(next)
    const route = next === 'overview' ? '/' : `/${next}`
    if (window.location.hash !== `#${route}`) window.location.hash = route
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }
  const task = useMemo(() => { try { return JSON.parse(rawTask) as Record<string, unknown> } catch { return null } }, [rawTask])
  const coverageItems = coverageRequirements.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
  const coverageKeys = coverageItems.map((item, index) => `${item}\u0000${coverageItems.slice(0, index).filter(previous => previous === item).length}`)
  const coveredCount = coverageKeys.filter(key => Boolean(coverageMapping[key])).length
  const editableChecks: Array<Record<string, unknown>> = [
    ...(Array.isArray(task?.checks) ? task.checks.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : []),
    ...(Array.isArray(task?.required_files) ? task.required_files.filter((path): path is string => typeof path === 'string').map(path => ({ id: `file_exists:${path}`, kind: 'required_file' })) : []),
    ...(Array.isArray(task?.command_results) ? task.command_results.filter((result): result is Record<string, unknown> => Boolean(result && typeof result === 'object')).map((result, index) => ({ id: `command_succeeded:${String(result.label || `unnamed-${index + 1}`)}`, kind: 'test_result' })) : []),
  ]
  const checks = report?.checks || []
  const selectedCheck = selected === null ? null : checks[selected] || null
  const passed = report ? asCount(report.checks_passed) : 0
  const failed = report ? asCount(report.checks_failed) : 0
  const open = report ? asCount(report.checks_unverified) + asCount(report.checks_unsupported) + asCount(report.checks_errored) : 0
  const total = report ? checks.length : 0
  const score = total ? Math.round((passed / total) * 100) : 0
  const comparison = useMemo(() => {
    if (runs.length < 2) return null
    const [latest, previous] = runs
    const latestChecks = new Map(comparisonEntries(latest.report.checks || []))
    const previousChecks = new Map(comparisonEntries(previous.report.checks || []))
    const keys = [...new Set([...latestChecks.keys(), ...previousChecks.keys()])]
    const changes = keys.map(key => {
      const current = latestChecks.get(key)
      const old = previousChecks.get(key)
      if (!old) return { key, state: 'added', from: null, to: resultStatus(current!) }
      if (!current) return { key, state: 'removed', from: resultStatus(old), to: null }
      const from = resultStatus(old), to = resultStatus(current)
      return { key, state: from === to ? 'unchanged' : 'changed', from, to }
    })
    return { latest, previous, sameTask: Boolean(latest.report.task_id && latest.report.task_id === previous.report.task_id), changes }
  }, [runs])

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/health').then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
      fetch('/api/samples').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([status, available]) => {
      if (!active) return
      setHealth(status?.status === 'ok' ? 'online' : 'offline')
      setGemmaReady(Boolean(status?.gemma_configured))
      if (typeof status?.gemma_model === 'string') setGemmaModel(status.gemma_model)
      setSamples(available && typeof available === 'object' ? available as SampleMap : {})
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!demoSession || (demoSession.required && !demoSession.authenticated)) return
    let active = true
    const query = new URLSearchParams({ base_dir: workspace.trim() || '.' })
    setApprovedChecksState('loading')
    fetch(`/api/approved-checks?${query}`).then(response => {
      if (!response.ok) throw new Error(`Approved checks endpoint returned ${response.status}`)
      return response.json()
    }).then(payload => {
      if (!active) return
      const checks = Array.isArray(payload?.checks) ? payload.checks as ApprovedCheck[] : []
      setApprovedChecks(checks)
      setApprovedChecksState(checks.length ? 'available' : 'none')
    }).catch(() => {
      if (!active) return
      setApprovedChecks([])
      setApprovedChecksState('unavailable')
    })
    return () => { active = false }
  }, [workspace, approvedChecksRetry, demoSession?.authenticated, demoSession?.required])

  useEffect(() => {
    const syncPage = () => setPageState(pageFromLocation())
    window.addEventListener('hashchange', syncPage)
    return () => window.removeEventListener('hashchange', syncPage)
  }, [])

  useEffect(() => {
    fetch('/api/demo/session').then(response => response.ok ? response.json() : Promise.reject())
      .then(session => setDemoSession(session)).catch(() => setDemoSession({ required: true, configured: false, authenticated: false }))
  }, [])

  async function loginToDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDemoLoginError(''); setDemoLoginBusy(true)
    try {
      const response = await fetch('/api/demo/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: demoPassword }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || 'Could not open the demo.')
      const session = await fetch('/api/demo/session').then(result => result.json())
      setDemoSession(session); setDemoPassword('')
    } catch (cause) { setDemoLoginError(cause instanceof Error ? cause.message : 'Could not open the demo.') }
    finally { setDemoLoginBusy(false) }
  }

  async function runVerification() {
    setError('')
    if (!task || typeof task !== 'object' || Array.isArray(task)) { setError('The task contract must be valid JSON with an object at its root.'); return }
    setBusy(true)
    try {
      const response = await fetch('/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, base_dir: workspace.trim() || '.' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || payload.error || `Verification request failed (${response.status})`)
      const next = payload as Report
      setReport(next); setSelected(null); setTab('evidence')
      setRuns(previous => [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: String(next.task_id || task.task_id || 'Untitled contract'),
        status: String(next.status || 'PARTIAL'), checks: next.checks?.length || 0,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), report: next,
      }, ...previous].slice(0, 6))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect to the verification API.') }
    finally { setBusy(false) }
  }

  async function runApprovedCheck(check: ApprovedCheck) {
    setError(''); setRunningApproved(true)
    try {
      const response = await fetch('/api/run-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_id: check.id, base_dir: workspace.trim() || '.' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || `Approved check failed to start (${response.status})`)
      const result = payload as ApprovedCheckResult
      setApprovedRuns(previous => [{ ...result, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...previous].slice(0, 6))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not run the approved check.') }
    finally { setRunningApproved(false) }
  }

  async function generatePlan() {
    setError('')
    if (!planTask.trim()) { setError('Describe the task before asking Gemma to draft checks.'); return }
    setPlanning(true)
    try {
      const response = await fetch('/api/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_description: planTask, project_context: [projectContext.trim(), ...contextFiles.map(file => `ATTACHED FILE: ${file.name}\n${file.content}`)].filter(Boolean).join('\n\n').slice(0, 6000), base_dir: workspace.trim() || '.' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || `Plan request failed (${response.status})`)
      setProposedPlan(payload as PlanResponse)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate a plan.') }
    finally { setPlanning(false) }
  }

  function applyPlan() {
    if (!proposedPlan || !task) return
    const checks = proposedPlan.plan.checks.flatMap((check): Array<Record<string, unknown>> => {
      const criterion = { id: check.id, description: check.description, expected_outcome: check.expected_outcome }
      // Keep human-only criteria in the contract so the verifier can report
      // them as unsupported instead of silently losing part of the plan.
      if (check.requires_human_approval || check.kind === 'manual_review') {
        return [{ ...criterion, kind: check.kind, target: check.target }]
      }
      if (check.kind === 'required_file' || check.kind === 'json_valid') return [{ ...criterion, kind: check.kind, path: check.target }]
      if (check.kind === 'path_exists') return [{ ...criterion, kind: check.kind, path: check.target, entry_type: check.inputs.entry_type || 'any' }]
      if (check.kind === 'file_sha256' && typeof check.inputs.sha256 === 'string') return [{ ...criterion, kind: check.kind, path: check.target, sha256: check.inputs.sha256 }]
      return []
    })
    if (!checks.length) { setError('This proposal contains no checks supported by the deterministic verifier. Review the manual recommendations below.'); return }
    setRawTask(pretty({ ...task, task_description: planTask.trim(), checks }))
    setReport(null); setSelected(null); setTab('evidence')
    setError('')
  }

  function loadSample(name: string) {
    if (!samples[name]) return
    setRawTask(pretty(samples[name])); setReport(null); setSelected(null); setTab('evidence'); setError(''); setPage('runner'); setMenuOpen(false); window.scrollTo(0, 0)
  }
  function openFile(file?: File) {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) { setError('Choose a JSON task contract.'); return }
    const reader = new FileReader()
    reader.onload = () => { setRawTask(String(reader.result || '')); setReport(null); setError('') }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }
  async function addContextFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    const allowed = /\.(md|txt|py|js|jsx|ts|tsx|json|yml|yaml|toml|html|css)$/i
    const incoming: ContextFile[] = []
    let total = projectContext.trim().length + contextFiles.reduce((sum, item) => sum + item.characters + `\n\nATTACHED FILE: ${item.name}\n`.length, 0)
    for (const file of Array.from(fileList)) {
      if (contextFiles.length + incoming.length >= 5) { setError('Attach at most five text files per plan.'); break }
      if (!allowed.test(file.name)) { setError(`${file.name} is not a supported text context file.`); continue }
      if (file.size > 16000) { setError(`${file.name} is larger than the 16 KB per-file limit.`); continue }
      try {
        const content = await file.text()
        if (content.includes('\0')) { setError(`${file.name} does not look like a text file.`); continue }
        const header = `\n\nATTACHED FILE: ${file.name}\n`
        const remaining = Math.max(0, 6000 - total - header.length)
        if (!remaining) { setError('The combined notes and attached files are limited to 6,000 characters.'); break }
        const bounded = content.slice(0, remaining)
        incoming.push({ name: file.name, content: bounded, characters: bounded.length })
        total += bounded.length + header.length
        if (bounded.length < content.length) { setError(`${file.name} was trimmed to stay within the combined 6,000-character context limit.`); break }
      } catch { setError(`Could not read ${file.name}.`) }
    }
    if (incoming.length) setContextFiles(previous => [...previous, ...incoming])
    if (contextFilesRef.current) contextFilesRef.current.value = ''
  }
  function onDrop(event: DragEvent) { event.preventDefault(); setDragging(false); openFile(event.dataTransfer.files[0]) }
  function downloadReport() {
    if (!report) return
    const url = URL.createObjectURL(new Blob([pretty(report)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${report.task_id || 'verification-report'}.json`
    link.click()
    // Let the browser begin consuming the blob before releasing its object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (!demoSession) return <div className="demo-gate"><section className="demo-gate-card"><ShieldCheck size={27} /><p className="panel-kicker">DONEPROOF · CONTROLLED DEMO</p><h1>Preparing the demo…</h1></section></div>
  if (demoSession.required && (!demoSession.configured || !demoSession.authenticated)) return <div className="demo-gate"><section className="demo-gate-card"><ShieldCheck size={27} /><p className="panel-kicker">DONEPROOF · CONTROLLED DEMO</p><h1>{demoSession.configured ? 'Welcome to DoneProof.' : 'Demo access is not ready.'}</h1><p>{demoSession.configured ? 'Enter the presenter-provided password to open this private demonstration.' : 'The deployment owner needs to set DONEPROOF_DEMO_PASSWORD in Vercel, then redeploy.'}</p>{demoSession.configured && <form onSubmit={loginToDemo}><label htmlFor="demo-password">DEMO PASSWORD</label><input id="demo-password" type="password" autoComplete="current-password" value={demoPassword} onChange={event => setDemoPassword(event.target.value)} required autoFocus /><button className="ed-button ed-button-dark" disabled={demoLoginBusy}>{demoLoginBusy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{demoLoginBusy ? 'Opening…' : 'Open demo'}</button>{demoLoginError && <p role="alert" className="demo-gate-error">{demoLoginError}</p>}</form>}<small>The verification workspace is the repository bundled with this deployment.</small></section></div>

  if (page === 'how-it-works' || page === 'examples' || page === 'documentation') return <ProductPage page={page} health={health} samples={samples} runs={runs} onNavigate={setPage} onLoadSample={loadSample} />

  if (page === 'overview') return <div className="editorial-home">
    <header className="ed-nav">
      <a className="ed-brand" href="#top" onClick={event => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label="DoneProof home">
        <span className="ed-brand-mark"><CheckCheck size={18} strokeWidth={2.5} /></span><span>doneproof<i>.</i></span>
      </a>
      <nav className="ed-links" aria-label="Main navigation"><a href="#/" className="active" aria-current="page">Overview</a><a href="#/how-it-works" onClick={event => { event.preventDefault(); setPage('how-it-works') }}>How it works</a><a href="#/examples" onClick={event => { event.preventDefault(); setPage('examples') }}>Examples</a><a href="#/documentation" onClick={event => { event.preventDefault(); setPage('documentation') }}>Documentation</a></nav>
      <div className="ed-nav-actions"><span className={`ed-api ${health}`}><i />{health === 'online' ? 'API online' : health === 'offline' ? 'API offline' : 'Connecting'}</span><button className="ed-button ed-button-dark" onClick={() => { setPage('runner'); window.scrollTo(0, 0) }}>Open verifier <ArrowRight size={15} /></button></div>
    </header>

    <main id="top" className="ed-main">
      <section className="ed-hero">
        <div className="ed-hero-copy">
          <div className="ed-kicker"><span>INDEPENDENT TASK VERIFICATION</span><span className="ed-kicker-line" /><span>OPEN PROTOTYPE · 2026</span></div>
          <h1>“Done” should<br />leave <em>evidence.</em></h1>
          <p className="ed-lede">A completion receipt for AI-assisted coding work. Gemma turns the task into reviewable checks; trusted code inspects the repository and shows what the evidence does—and does not—support.</p>
          <div className="ed-hero-actions"><button className="ed-button ed-button-rust" onClick={() => setPage('runner')}>Verify a task <ArrowRight size={16} /></button><a href="#/how-it-works" className="ed-text-link" onClick={event => { event.preventDefault(); setPage('how-it-works') }}>See how it works <ArrowRight size={15} /></a></div>
          <div className="ed-hero-note"><ShieldCheck size={16} /><span>Evidence first. Claims are never proof by themselves.</span></div>
        </div>
        <div className="ed-hero-art" aria-label="A task claim is evaluated against observed evidence">
          <div className="ed-art-top"><span>VERIFICATION MODEL / 01</span><span>INPUT → EVIDENCE → DECISION</span></div>
          <div className="ed-proof-graph">
            <div className="ed-graph-lines"><svg viewBox="0 0 540 330" role="img" aria-label="A claim flows into evidence checks and a scoped result"><path d="M151 92 C220 92 215 164 279 164"/><path d="M151 238 C220 238 215 164 279 164"/><path d="M405 164 H478"/><circle cx="151" cy="92" r="4"/><circle cx="151" cy="238" r="4"/><circle cx="279" cy="164" r="4"/><circle cx="478" cy="164" r="4"/></svg></div>
            <div className="ed-node ed-node-claim"><span className="ed-node-label">01 / CLAIM</span><b>“The task is done.”</b><small>Submitted assertion</small></div>
            <div className="ed-node ed-node-check"><span className="ed-node-label">02 / OBSERVATION</span><b>Evidence checked</b><small>Local facts · trusted evaluators</small></div>
            <div className="ed-node ed-node-result"><span className="ed-node-label">03 / RESULT</span><b>Scoped decision</b><small>Verified · failed · unresolved</small></div>
          </div>
          <div className="ed-art-bottom"><span>NO COMMANDS FROM A CONTRACT ARE EXECUTED</span><span>UNCERTAINTY IS A RESULT</span></div>
        </div>
        <div className="ed-hero-index"><span>01</span><i /><span>SCROLL TO EXPLORE</span></div>
      </section>

      <section className="ed-live-strip" aria-label="Current session activity">
        <div><span className="ed-mono">THIS SESSION</span><b>{runs.length.toString().padStart(2, '0')}</b><small>verifications</small></div>
        <div><span className="ed-mono">CHECKS EVALUATED</span><b>{runs.reduce((sum, run) => sum + run.checks, 0).toString().padStart(2, '0')}</b><small>explicit conditions</small></div>
        <div className="ed-live-note"><span className={`ed-live-dot ${health}`} /><span>{health === 'online' ? 'Local verification API is connected.' : health === 'offline' ? 'Start the local API to run a verification.' : 'Checking local API connection.'}</span></div>
      </section>

      <section id="why" className="ed-section ed-problem">
        <div className="ed-section-index"><span>01</span><span>THE PROBLEM</span></div>
        <div className="ed-problem-grid"><h2>Completion is easy<br />to <em>say.</em> Harder to<br />establish.</h2><div className="ed-problem-copy"><p>When an AI agent reports that a coding task is complete, a reviewer still has to connect that claim to the request, the changed workspace, and evidence that can be checked.</p><p>CI is valuable for running tests, and code review is valuable for judging design. DoneProof fills a narrower gap: it turns the task into explicit criteria and shows which criteria were actually observed.</p><p>Task contracts often mix requirements, self-reported results, and evidence. DoneProof separates what someone says happened from what trusted code can inspect. Every receipt is limited to its listed checks.</p><a href="#scope" className="ed-inline-link">Read the verification boundary <ArrowRight size={14} /></a></div></div>
        <div className="ed-quote-rule"><span>THE PRINCIPLE</span><p>A trustworthy system must be able to say <em>“I can’t verify that yet.”</em></p></div>
      </section>

      <section id="method" className="ed-section ed-method">
        <div className="ed-section-index"><span>02</span><span>THE METHOD</span></div>
        <div className="ed-method-heading"><h2>From a task to<br /><em>something testable.</em></h2><p>One contract. A set of independent checks. A report that shows its work.</p></div>
        <div className="ed-steps">
          <article className="ed-step"><span className="ed-step-num">01</span><div><span className="ed-mono">INTERPRET · GEMMA</span><h3>Turn the task into checks.</h3><p>Gemma reads your task and a bounded repository snapshot, then proposes inspectable criteria. You review and can edit them before they run.</p></div><span className="ed-step-icon"><Braces size={20} /></span></article>
          <article className="ed-step"><span className="ed-step-num">02</span><div><span className="ed-mono">OBSERVE · LOCAL</span><h3>Check the real workspace.</h3><p>After you apply the reviewed plan, DoneProof observes files, digests, and JSON syntax in the approved workspace. It never runs model-authored commands.</p></div><span className="ed-step-icon"><FileCheck2 size={20} /></span></article>
          <article className="ed-step"><span className="ed-step-num">03</span><div><span className="ed-mono">REPORT · EVIDENCE</span><h3>Show what passed—and why.</h3><p>Each criterion includes its observed evidence and the repository revision. Failed, unverified, unsupported, and errored checks remain visible.</p></div><span className="ed-step-icon"><ShieldCheck size={20} /></span></article>
        </div>
      </section>

      <section id="demo" className="ed-section ed-walkthrough">
        <div className="ed-section-index"><span>03</span><span>THE WALKTHROUGH</span></div>
        <div className="ed-walkthrough-grid">
          <div><h2>Follow one task<br />all the way <em>through.</em></h2><p>For the demo, start with a coding task that names an expected result. The same task text stays attached to the checks and the final receipt.</p><button className="ed-button ed-button-rust" onClick={() => { setPage('runner'); window.scrollTo(0, 0) }}>Open the working demo <ArrowRight size={15} /></button></div>
          <div className="ed-walkthrough-steps">
            <article><span>01</span><div><b>Describe the change</b><p>Say what the implementation should leave behind or make true.</p></div></article>
            <article><span>02</span><div><b>Inspect Gemma’s proposal</b><p>The live model receives the task and a bounded repository snapshot. Its criteria are proposals, never results.</p></div></article>
            <article><span>03</span><div><b>Review, edit, then run</b><p>Apply only after inspection. Supported checks read the approved workspace; contracts cannot launch shell commands.</p></div></article>
            <article><span>04</span><div><b>Explain the receipt</b><p>Open a criterion to show its observed evidence, or point to what remains unresolved.</p></div></article>
          </div>
        </div>
        <div className="ed-presenter-line"><span className="ed-mono">A LINE TO REMEMBER</span><p>“Gemma helps decide <em>what to check</em>; trusted code decides <em>what the evidence says.</em>”</p></div>
      </section>

      <section className="ed-check-band">
        <div><span className="ed-mono">BUILT TO EXTEND</span><h2>One verification flow.<br /><em>Many kinds of evidence.</em></h2></div>
        <div className="ed-check-list"><span><i>01</i> Paths and directories</span><span><i>02</i> Content fingerprints</span><span><i>03</i> Structured data</span><span><i>04</i> Trusted evaluators</span><small>Reported test results are shown as unverified until an integration can authenticate their source.</small></div>
      </section>

      <section id="outcomes" className="ed-section ed-outcomes">
        <div className="ed-section-index"><span>04</span><span>READING THE RECEIPT</span></div>
        <div className="ed-outcomes-heading"><h2>Five outcomes.<br /><em>No false certainty.</em></h2><p>A criterion can only earn a pass from an observation or a trusted evaluator. Claims and gaps keep their own status.</p></div>
        <div className="ed-outcome-grid">
          <article className="ed-outcome passed"><span>PASSED</span><b>The observed fact satisfies this check.</b><p>Example: a required file is present in the selected workspace.</p></article>
          <article className="ed-outcome failed"><span>FAILED</span><b>The observed fact does not satisfy it.</b><p>Example: a required path is missing or has the wrong type.</p></article>
          <article className="ed-outcome unverified"><span>UNVERIFIED</span><b>The result was reported, not observed.</b><p>A supplied test exit code stays a claim until trusted evidence authenticates it.</p></article>
          <article className="ed-outcome unsupported"><span>UNSUPPORTED</span><b>No trusted evaluator can assess it yet.</b><p>Keep the criterion visible for a person or a future trusted integration.</p></article>
          <article className="ed-outcome errored"><span>ERRORED</span><b>Evaluation did not produce valid evidence.</b><p>An evaluator problem is surfaced as an error, never turned into a pass.</p></article>
        </div>
      </section>

      <section id="scope" className="ed-section ed-scope">
        <div className="ed-section-index"><span>05</span><span>THE BOUNDARY</span></div>
        <div className="ed-scope-grid"><div><h2>Verification<br />with the limits<br /><em>left in.</em></h2><p>DoneProof does not certify the whole task. A passing report means only that every listed check passed using local observation or a trusted evaluator.</p></div><div className="ed-boundary-card"><div className="ed-boundary-head"><span><ShieldCheck size={18} /></span><b>WHAT A PASS MEANS</b><span className="ed-mono">READ BEFORE RELYING</span></div><div className="ed-boundary-row"><span>Within scope</span><b>Only the checks in this contract</b></div><div className="ed-boundary-row"><span>Evidence source</span><b>Shown for each individual result</b></div><div className="ed-boundary-row"><span>Unknowns</span><b>Remain visible as unresolved</b></div><div className="ed-boundary-foot"><CircleHelp size={16} /><span>A matching file digest does not prove who produced that file or when.</span></div></div></div>
      </section>

      <ProductOverviewDetails onNavigate={setPage} />

      <section className="ed-cta"><div><span className="ed-mono">THE WORKSPACE IS READY</span><h2>Make the next claim<br /><em>testable.</em></h2></div><button className="ed-button ed-button-light" onClick={() => { setPage('runner'); window.scrollTo(0, 0) }}>Open verification runner <ArrowRight size={16} /></button><span className="ed-cta-orbit ed-cta-orbit-a" /><span className="ed-cta-orbit ed-cta-orbit-b" /></section>
      <footer className="ed-footer"><a className="ed-brand" href="#top"><span className="ed-brand-mark"><CheckCheck size={17} /></span><span>doneproof<i>.</i></span></a><span>EVIDENCE-BACKED CODING TASK REVIEW · LOCAL PROTOTYPE</span><nav className="ed-footer-pages" aria-label="Footer navigation"><a href="#/how-it-works" onClick={event => {event.preventDefault();setPage('how-it-works')}}>How it works</a><a href="#/examples" onClick={event => {event.preventDefault();setPage('examples')}}>Examples</a><a href="#/documentation" onClick={event => {event.preventDefault();setPage('documentation')}}>Documentation</a></nav><a href="https://github.com/AugustyaSingh/doneproof" target="_blank" rel="noreferrer">Open source project <ExternalLink size={13} /></a></footer>
    </main>
  </div>

  const pageForRender = page as string
  const nav = <>
    <button className={`nav-link ${pageForRender === 'overview' ? 'active' : ''}`} onClick={() => setPage('overview')}><LayoutDashboard size={17} /> Overview</button>
    <button className={`nav-link ${pageForRender === 'how-it-works' ? 'active' : ''}`} onClick={() => setPage('how-it-works')}><ShieldCheck size={17} /> How it works</button>
    <button className={`nav-link ${pageForRender === 'examples' ? 'active' : ''}`} onClick={() => setPage('examples')}><FileJson2 size={17} /> Examples</button>
    <button className={`nav-link ${pageForRender === 'documentation' ? 'active' : ''}`} onClick={() => setPage('documentation')}><CircleHelp size={17} /> Documentation</button>
    <button className={`nav-link ${pageForRender === 'runner' ? 'active' : ''}`} onClick={() => setPage('runner')}><Braces size={17} /> Verification runner</button>
  </>

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#home" onClick={event => { event.preventDefault(); setPage('overview'); setMenuOpen(false); window.scrollTo(0, 0) }}>
        <span className="brand-mark"><CheckCheck size={20} strokeWidth={2.5} /></span><span>doneproof<span className="brand-period">.</span></span>
      </a>
      <div className="workspace-switch"><span className="workspace-avatar">W</span><span className="workspace-meta"><b>Verification workspace</b><small>Local environment</small></span><ChevronDown size={15} /></div>
      <p className="side-label">WORKSPACE</p><nav className="primary-nav">{nav}</nav>
      <div className="side-divider" />
      <div className="side-section-title"><span>Recent runs</span>{runs.length > 0 && <span className="side-count">{runs.length}</span>}</div>
      <div className="recent-list">
        {runs.length === 0 ? <div className="empty-recent"><History size={16} /><span>Runs will show up here</span></div> : runs.map(run => <button className="recent-run" key={run.id} onClick={() => { setReport(run.report); setPage('runner'); setSelected(null); setTab('evidence'); setMenuOpen(false); window.scrollTo(0, 0) }}><span className={`run-dot ${run.status.toLowerCase()}`} /><span className="recent-copy"><b>{run.label}</b><small>{run.time} · {run.checks} checks</small></span></button>)}
      </div>
      <div className="sidebar-bottom">
        <div className="api-card"><span className={`api-led ${health}`} /><span><b>Verification API</b><small>{health === 'online' ? 'Connected' : health === 'offline' ? 'Not reachable' : 'Checking connection'}</small></span><Activity size={15} /></div>
        <a className="side-help" href="https://github.com/AugustyaSingh/doneproof" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Project repository <ArrowRight size={14} /></a>
        <div className="profile-row"><span className="profile-avatar">DP</span><span><b>Local workspace</b><small>Verification console</small></span><Menu size={16} /></div>
      </div>
    </aside>
    {menuOpen && <button aria-label="Close menu" className="scrim" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><IconButton label="Open navigation" className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu size={18} /></IconButton><span>Workspace</span><span className="crumb-slash">/</span><b>{pageForRender === 'overview' ? 'Overview' : 'Verification runner'}</b></div><div className="topbar-right"><span className="local-badge"><span /> Local-only</span><span className="topbar-date"><Clock3 size={14} /> {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div></header>
      <div className="content-wrap">
        {pageForRender === 'runner' && Object.keys(samples).length > 0 && <section className="sample-section runner-sample-section" aria-label="Load a sample task contract"><div className="sample-heading"><div><span className="panel-kicker">DEMO CONTRACTS · FROM THE API</span><h2>Start with a known example</h2></div><span className="sample-hint">Load it, then run the local checks</span></div><div className="sample-grid">{Object.entries(samples).map(([name, sample]) => <button className="sample-card" key={name} onClick={() => loadSample(name)}><span className={`sample-icon ${name}`}><FileJson2 size={18} /></span><span className="sample-copy"><b>{String(sample.task_id || name).replaceAll('-', ' ')}</b><small>{sampleCheckCount(sample)} checks · sample contract</small></span><ArrowRight size={16} className="sample-arrow" /></button>)}</div></section>}
        {pageForRender === 'overview' ? <>
          <section className="welcome-row"><div><div className="eyebrow"><Sparkles size={14} /> EVIDENCE FIRST, ALWAYS</div><h1>A clearer view of<br className="desktop-break" /> what’s <span>actually done.</span></h1><p>Verify any task against the evidence it provides. No guesswork, no blanket claims.</p></div><button className="button primary welcome-button" onClick={() => setPage('runner')}><Plus size={17} /> New verification <ArrowRight size={16} /></button></section>
          <section className="metric-grid" aria-label="Workspace summary">
            <article className="metric-card metric-teal"><div className="metric-head"><span>VERIFICATIONS THIS SESSION</span><span className="metric-icon"><Gauge size={16} /></span></div><div className="metric-number">{runs.length}<span className="metric-sub"> runs</span></div><div className="metric-foot"><span className="metric-soft-icon"><Activity size={14} /></span> Results are kept in this tab only</div></article>
            <article className="metric-card"><div className="metric-head"><span>CHECKS EVALUATED</span><span className="metric-icon green"><FileCheck2 size={16} /></span></div><div className="metric-number">{runs.reduce((sum, item) => sum + item.checks, 0)}<span className="metric-sub"> total</span></div><div className="metric-foot"><span className="metric-soft-icon green"><Check size={14} /></span> Explicit conditions, one by one</div></article>
            <article className="metric-card"><div className="metric-head"><span>CONNECTION</span><span className="metric-icon amber"><HardDrive size={16} /></span></div><div className="metric-number metric-connection"><span className={`connection-dot ${health}`} />{health === 'online' ? 'Ready' : health === 'offline' ? 'Offline' : 'Checking'}</div><div className="metric-foot"><span className="metric-soft-icon amber"><ShieldCheck size={14} /></span> Evidence evaluated by local API</div></article>
          </section>
          <section className="overview-lower">
            <article className="panel activity-panel"><div className="panel-header"><div><span className="panel-kicker">ACTIVITY</span><h2>Recent verifications</h2></div><div className="activity-actions">{runs.length > 1 && <button className="text-button" onClick={() => setCompareRuns(value => !value)}>{compareRuns ? 'Hide comparison' : 'Compare latest runs'}</button>}<button className="text-button" onClick={() => setPage('runner')}>Open runner <ArrowRight size={14} /></button></div></div>
              {compareRuns && comparison && <div className="run-comparison"><div><span className="panel-kicker">LATEST RUN</span><b>{comparison.latest.label} · {comparison.latest.status}</b><small>{comparison.latest.time}</small></div><ArrowRight size={18} /><div><span className="panel-kicker">PREVIOUS RUN</span><b>{comparison.previous.label} · {comparison.previous.status}</b><small>{comparison.previous.time}</small></div><p className="comparison-scope">{comparison.sameTask ? 'Same task ID. Criterion changes are compared by check ID or name.' : 'Different task IDs. Results are shown for reference, not as a before/after comparison.'}</p><div className="comparison-changes">{comparison.changes.filter(change => change.state !== 'unchanged').length === 0 ? <span>No criterion status or membership changes.</span> : comparison.changes.filter(change => change.state !== 'unchanged').map(change => <div key={change.key}><b>{change.key}</b><span className={`comparison-change ${change.state}`}>{change.state === 'changed' ? `${change.from} → ${change.to}` : change.state === 'added' ? `added · ${change.to}` : `removed · ${change.from}`}</span></div>)}</div></div>}
              {runs.length === 0 ? <div className="activity-empty"><span className="empty-graphic"><FileCheck2 size={24} /></span><h3>Your evidence ledger starts here</h3><p>Run a contract to see each requirement and its evidence in one place.</p><button className="button secondary" onClick={() => { setPage('runner'); window.scrollTo(0, 0) }}><Play size={15} /> Start a verification</button></div> : <div className="activity-table"><div className="activity-table-head"><span>TASK</span><span>CHECKS</span><span>RESULT</span><span>TIME</span></div>{runs.map(run => <button className="activity-row" key={run.id} onClick={() => { setReport(run.report); setPage('runner'); setSelected(null); setTab('evidence'); window.scrollTo(0, 0) }}><span className="activity-task"><span className={`run-dot ${run.status.toLowerCase()}`} /><b>{run.label}</b></span><span>{run.checks}</span><span className={`status-pill ${run.status.toLowerCase()}`}>{run.status}</span><span>{run.time}</span></button>)}</div>}
            </article>
            <aside className="panel principles-panel"><div className="principle-top"><span className="principle-symbol"><ShieldCheck size={19} /></span><span className="principle-tag">THE DONEPROOF RULE</span></div><h2>“Done” needs<br />something to show for it.</h2><p>Every result is scoped to the checks in the contract. A pass means those checks passed; it doesn’t certify the whole task.</p><div className="principle-rule" /><div className="principle-link"><CircleHelp size={16} /><span>Unsupported and errored checks stay visible.</span></div></aside>
          </section>
          <section className="sample-section"><div className="sample-heading"><div><span className="panel-kicker">GET STARTED</span><h2>Bring a task contract</h2></div><span className="sample-hint">Templates come from the connected API</span></div><div className="sample-grid">{Object.entries(samples).map(([name, sample]) => <button className="sample-card" key={name} onClick={() => loadSample(name)}><span className={`sample-icon ${name}`}><FileJson2 size={18} /></span><span className="sample-copy"><b>{String(sample.task_id || name).replaceAll('-', ' ')}</b><small>{Array.isArray(sample.checks) ? `${sample.checks.length} checks` : 'Task contract'} · API sample</small></span><ArrowRight size={16} className="sample-arrow" /></button>)}{Object.keys(samples).length === 0 && <div className="sample-empty"><CircleAlert size={16} /> Sample templates appear when the API is available.</div>}</div></section>
        </> : <>
          <section className="runner-heading"><div><div className="eyebrow"><Braces size={14} /> TASK CONTRACT EVALUATION</div><h1>Verification <span>runner</span></h1><p>Set the contract, point it at a workspace, and inspect the evidence.</p></div><div className="runner-heading-side"><span className={`api-pill ${health}`}><span /> {health === 'online' ? 'API connected' : health === 'offline' ? 'API offline' : 'Connecting'}</span><span className="scope-note"><ShieldCheck size={15} /> Local workspace scope</span></div></section>
          <details className="runner-guide panel"><summary><span><CircleHelp size={16}/> Before you run: contract and evidence guide</span><span className="runner-guide-action">Supported kinds · report reading · troubleshooting</span></summary><div className="runner-guide-content"><div><h2>Write criteria that can be observed</h2><p>A task contract records the request and one check per condition. Prefer “manifest.json exists and parses as JSON” over “release is complete.” The task description and agent claim explain context but do not determine status.</p><p>Paths are resolved under the approved workspace root. Use repository-relative targets such as <code>dist/manifest.json</code>. The API rejects a selected workspace outside its configured root.</p></div><div><h3>Built-in kinds</h3><ul><li><code>required_file</code> — observe a required file’s presence.</li><li><code>path_exists</code> — observe a path and optional <code>entry_type</code> of any, file, or directory.</li><li><code>file_sha256</code> — compare actual file bytes with an expected SHA-256 digest.</li><li><code>json_valid</code> — parse a file as JSON; syntax validity is not schema correctness.</li><li><code>test_result</code> — record a supplied exit code as unverified; no command is run.</li></ul></div><div><h3>How to read outcomes</h3><p>Passed and failed are observed decisions. Unverified means a result was reported but not authenticated. Unsupported means no evaluator exists. Errored means evaluation could not produce a valid decision. Any unresolved or mixed state contributes to PARTIAL.</p><p>Use Evidence for the evaluator payload, Claim &amp; scope for the request and limits, and Raw report for the full JSON response. A report applies only to its listed checks and the repository state shown.</p></div><div><h3>When something goes wrong</h3><p><b>API offline:</b> start <code>python -m doneproof --serve</code>. <b>Gemma unavailable:</b> verify that the API process has <code>GEMINI_API_KEY</code>; local checks do not require Gemma. <b>Missing path:</b> confirm the workspace and relative target. <b>Test stays unverified:</b> expected until a trusted execution or CI provenance adapter exists.</p><button className="text-button" onClick={() => setPage('documentation')}>Open full documentation <ArrowRight size={14}/></button></div></div></details>
          <div className="runner-grid">
            <section className="panel input-panel"><div className="input-panel-heading"><div><span className="panel-kicker">01 / INPUT</span><h2>Task contract</h2></div><div className="input-actions"><IconButton label="Load JSON file" onClick={() => fileRef.current?.click()}><FolderOpen size={16} /></IconButton><IconButton label="Reset contract" onClick={() => { setRawTask(starterContract); setReport(null); setSelected(null); setTab('evidence'); setError(''); if (fileRef.current) fileRef.current.value = '' }}><RotateCcw size={15} /></IconButton><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => openFile(e.target.files?.[0])} /></div></div>
              <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}><FileUp size={15} /><span>Drop a JSON file or <button onClick={() => fileRef.current?.click()}>browse</button></span></div>
              <label className="field-label" htmlFor="workspace-input"><span>WORKSPACE DIRECTORY</span><span className="label-hint">Relative to the API’s approved root</span></label><div className="workspace-input-wrap"><HardDrive size={16} /><input id="workspace-input" value={workspace} onChange={event => setWorkspace(event.target.value)} spellCheck={false} aria-describedby="workspace-help" /></div><small id="workspace-help" className="field-help">The server rejects paths outside its configured workspace boundary.</small>
              <section className="plan-drafter" aria-labelledby="plan-drafter-title"><div className="plan-drafter-heading"><span className="panel-kicker">GEMMA TASK PLANNER · {gemmaReady ? 'KEY DETECTED' : 'KEY MISSING'}</span><h3 id="plan-drafter-title">Turn the task into checks</h3><p>Gemma receives your task, this workspace’s bounded repository snapshot, and any context you add. Inspect the real model proposal before applying it.</p></div><label htmlFor="plan-task">CODING TASK</label><textarea id="plan-task" value={planTask} onChange={event => setPlanTask(event.target.value)} maxLength={4000} placeholder="Describe the coding task and what should be true when it is done." /><label htmlFor="plan-context">ADDITIONAL PROJECT CONTEXT <span>OPTIONAL</span></label><textarea id="plan-context" value={projectContext} onChange={event => setProjectContext(event.target.value)} maxLength={6000} placeholder="Relevant requirements or behavior (up to 6,000 characters)." /><div className="planner-attachments"><input ref={contextFilesRef} type="file" multiple accept=".md,.txt,.py,.js,.jsx,.ts,.tsx,.json,.yml,.yaml,.toml,.html,.css" hidden onChange={event => void addContextFiles(event.target.files)} /><button type="button" className="button secondary" onClick={() => contextFilesRef.current?.click()}><FileUp size={15} /> Attach text context</button><span>Up to 5 files · 16 KB each · 6,000 combined characters</span>{contextFiles.map((file, index) => <div className="planner-file" key={`${file.name}-${index}`}><span><b>{file.name}</b><small>{file.characters} characters</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setContextFiles(previous => previous.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}</div><p className="plan-privacy">Model: {gemmaModel} · {gemmaReady ? 'API key detected by the server.' : 'Set GEMINI_API_KEY before requesting a plan.'} When you press Generate, the task, notes, attached text files, tracked path list, changed paths, and up to 5,000 characters of README go to Google for Gemma. The key stays on the server. Do not include secrets.</p><button className="button secondary plan-button" onClick={generatePlan} disabled={planning || health !== 'online'}>{planning ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{planning ? 'Generating with Gemma…' : 'Generate with Gemma'}</button>{proposedPlan && <div className="plan-proposal"><div><b>{proposedPlan.plan.task_summary}</b><span>{String(proposedPlan.generation?.model || gemmaModel)} · {proposedPlan.plan.checks.length} proposed checks</span></div><pre>{pretty(proposedPlan.plan)}</pre><p>Repository: {proposedPlan.repository?.workspace || 'local workspace'} · {proposedPlan.repository?.branch || 'no branch'} · {proposedPlan.repository?.revision ? proposedPlan.repository.revision.slice(0, 7) : 'revision unavailable'}{proposedPlan.repository?.working_tree_changes ? ` · ${proposedPlan.repository.working_tree_changes} changed paths` : ''}. Review the proposal, apply supported checks, then edit the contract JSON before running.</p><button className="button secondary" onClick={applyPlan}>Apply checks to editable contract</button></div>}</section>
              <div className="editor-label"><label htmlFor="contract-editor">CONTRACT JSON</label><span className={`json-valid ${task ? 'valid' : 'invalid'}`}><span />{task ? 'Valid JSON' : 'Invalid JSON'}</span></div><div className="editor-shell"><div className="editor-gutter">{rawTask.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea id="contract-editor" value={rawTask} onChange={event => setRawTask(event.target.value)} spellCheck={false} aria-label="Task contract JSON" /></div>
              {error && <div className="error-banner" role="alert"><CircleAlert size={16} /><span>{error}</span><IconButton label="Dismiss error" onClick={() => setError('')}><X size={14} /></IconButton></div>}
              <section className="coverage-review" aria-labelledby="coverage-review-title"><div><span className="panel-kicker">HUMAN REVIEW · TASK COVERAGE</span><h3 id="coverage-review-title">Are all requirements represented?</h3><p>List one requirement per line and link it to a criterion in this contract. This is a review aid, not an automated completeness claim. {coverageItems.length - coveredCount} of {coverageItems.length} requirements still need a linked check.</p></div><textarea aria-label="Task requirements, one per line" value={coverageRequirements} onChange={event => setCoverageRequirements(event.target.value)} placeholder={'One requirement per line, for example:\nThe settings file must parse as JSON\nThe requested output must exist'} />{coverageItems.map((requirement, index) => <label className="coverage-row" key={coverageKeys[index]}><span>{requirement}</span><select aria-label={`Verification criterion for ${requirement}`} value={coverageMapping[coverageKeys[index]] || ''} onChange={event => setCoverageMapping(current => ({ ...current, [coverageKeys[index]]: event.target.value }))}><option value="">Not linked · remains uncovered</option>{editableChecks.map((check, checkIndex) => <option key={String(check.id || checkIndex)} value={String(check.id || check.check_name || checkIndex)}>{String(check.id || check.check_name || `${String(check.kind || 'Check')} ${checkIndex + 1}`)} · {String(check.kind || 'unknown')}</option>)}</select></label>)}</section>
              <div className="run-controls"><div className="run-controls-note"><ShieldCheck size={15} /><span>Contract commands are never executed.<br /><b>Local commands use a separate server allowlist.</b></span></div><button className="button primary run-button" onClick={runVerification} disabled={busy || !task || health === 'offline'}>{busy ? <LoaderCircle className="spin" size={17} /> : <Play size={16} fill="currentColor" />}{busy ? 'Evaluating…' : 'Run verification'}<ArrowRight size={16} /></button></div>
              <section className="approved-check-panel" aria-labelledby="approved-check-title"><div><span className="panel-kicker">SEPARATE EVIDENCE · EXPLICITLY STARTED</span><h3 id="approved-check-title">Run project tests</h3><p>These tests run only when you start them. Their result is separate from the task receipt; a passing suite does not mark every task requirement as passed.</p></div>{approvedChecksState === 'loading' && <p role="status">Checking whether this workspace has an approved test command…</p>}{approvedChecksState === 'available' && approvedChecks.map(check => <button key={check.id} className="button secondary" onClick={() => runApprovedCheck(check)} disabled={runningApproved || busy}>{runningApproved ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}{runningApproved ? 'Running tests…' : `Run ${check.label}`}<span>max {check.timeout_seconds}s</span></button>)}{approvedChecksState === 'none' && <p role="status">No approved test command was found for “{workspace.trim() || '.'}”. Choose the project folder that contains its tests directory.</p>}{approvedChecksState === 'unavailable' && <div role="status"><p>The API didn’t provide the test-runner list. Restart DoneProof from the project folder with <code>python -m doneproof --serve</code>, then retry. Your current page may be connected to an older API version.</p><button className="button secondary" onClick={() => setApprovedChecksRetry(value => value + 1)}>Retry detection</button></div>}{approvedRuns.map(run => <details className="approved-check-result" key={run.id}><summary><b>{run.status.toUpperCase()} · exit {run.exit_code ?? 'timeout'} · {run.duration_seconds}s</b><small>{run.time} · {run.label}</small></summary><code>{run.command.join(' ')}</code><pre>{run.output || '(no output)'}</pre></details>)}</section>
            </section>
            <section className={`panel result-panel ${selectedCheck ? 'has-detail' : ''}`}>
              {!report ? <div className="result-empty"><div className="result-orbit orbit-one" /><div className="result-orbit orbit-two" /><span className="result-empty-icon"><FileCheck2 size={23} /></span><span className="panel-kicker">02 / RESULTS</span><h2>Evidence, clearly<br />accounted for.</h2><p>Run a contract to see which conditions were satisfied and what remains unknown.</p><div className="empty-steps"><span><i>1</i> Submit JSON</span><ArrowRight size={13} /><span><i>2</i> Evaluate checks</span><ArrowRight size={13} /><span><i>3</i> Inspect evidence</span></div></div> : <>
              <div className="result-top"><div><span className="panel-kicker">02 / RESULTS</span><div className="result-title-line"><h2>{report.task_id || 'Verification result'}</h2><span className={`status-pill large ${String(report.status || 'partial').toLowerCase()}`}>{report.status || 'PARTIAL'}</span></div></div><IconButton label="Download report JSON" onClick={downloadReport}><ArrowDownToLine size={16} /></IconButton></div>
              {report.repository && <div className="repo-receipt"><HardDrive size={14} /><span><b>{report.repository.workspace}</b> · {report.repository.branch || 'no branch'} · {report.repository.revision ? report.repository.revision.slice(0, 7) : 'revision unavailable'} · {report.repository.working_tree_changes || 0} changed paths at check time</span></div>}
                <div className="score-row"><div className="score-number">{score}<small>%</small></div><div className="score-copy"><b>Listed checks passed</b><span>Scoped to this contract · {passed} of {total}</span><div className="progress-track"><span style={{ width: `${score}%` }} /></div></div><span className="score-total">{total} <small>checks</small></span></div>
                <div className="result-counts"><span className="count-green"><Check size={13} />{passed} passed</span><span className="count-red"><X size={13} />{failed} failed</span><span className="count-amber"><CircleHelp size={13} />{open} unresolved</span></div>
                <div className="result-tabs" role="tablist" aria-label="Verification report sections">
                  {([['evidence', 'Evidence'], ['claim', 'Claim & scope'], ['raw', 'Raw report']] as const).map(([value, label]) => <button key={value} id={`report-tab-${value}`} type="button" role="tab" data-tab={value} aria-controls={`report-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} className={tab === value ? 'selected' : ''} onClick={() => { setTab(value); setSelected(null) }} onKeyDown={event => handleResultTabKeyDown(event, tab, setTab)}>{label}</button>)}
                </div>
                {tab === 'evidence' && <div id="report-panel-evidence" className="check-list" role="tabpanel" aria-labelledby="report-tab-evidence" tabIndex={0}>{checks.length === 0 ? <div className="no-checks"><CircleHelp size={17} /> No individual check results were returned.</div> : checks.map((check, index) => <button type="button" className={`check-row ${selected === index ? 'check-selected' : ''}`} key={`${labelFor(check, index)}-${index}`} onClick={() => setSelected(selected === index ? null : index)}><span className={`check-status-icon ${resultStatus(check)}`}>{resultStatus(check) === 'passed' ? <CircleCheck size={18} /> : resultStatus(check) === 'failed' ? <CircleAlert size={18} /> : <CircleHelp size={18} />}</span><span className="check-row-copy"><b>{labelFor(check, index)}</b><small>{check.kind || 'Check'}{check.evidence !== undefined ? ` · ${typeof check.evidence === 'string' ? check.evidence : 'Evidence available'}` : ''}</small></span><span className={`check-result-tag ${resultStatus(check)}`}>{resultStatus(check)}</span><ArrowRight size={14} className="check-chevron" /></button>)}</div>}
                {tab === 'claim' && <div id="report-panel-claim" className="claim-content" role="tabpanel" aria-labelledby="report-tab-claim" tabIndex={0}><div className="claim-card"><span className="panel-kicker">ORIGINAL TASK</span><p>{report.task_description || 'No task description was attached.'}</p></div><div className="claim-card"><span className="panel-kicker">AGENT CLAIM</span><p>{typeof task?.agent_claim === 'string' && task.agent_claim.trim() ? `“${task.agent_claim}”` : 'No agent claim was included in this contract.'}</p></div><div className="scope-card"><ShieldCheck size={17} /><div><b>What this result means</b><p>{String(report.status) === 'VERIFIED' ? 'Every supported check listed in this contract passed.' : 'The contract did not result in every listed check passing. Review the individual evidence and unresolved checks.'} This result does not establish correctness beyond the checks listed.</p></div></div><div className="scope-facts"><span>Checks evaluated <b>{total}</b></span><span>Unverified <b>{asCount(report.checks_unverified)}</b></span><span>Unsupported <b>{asCount(report.checks_unsupported)}</b></span><span>Evaluation errors <b>{asCount(report.checks_errored)}</b></span></div></div>}
                {tab === 'raw' && <pre id="report-panel-raw" className="raw-report" role="tabpanel" aria-labelledby="report-tab-raw" tabIndex={0}>{pretty(report)}</pre>}
                {tab === 'evidence' && selectedCheck && <div className="detail-panel"><div className="detail-heading"><div><span className="panel-kicker">CHECK DETAIL</span><h3>{labelFor(selectedCheck, selected!)}</h3></div><IconButton label="Close check detail" onClick={() => setSelected(null)}><X size={15} /></IconButton></div><div className="detail-meta"><span>KIND</span><b>{selectedCheck.kind || 'Unknown'}</b><span>STATUS</span><b className={`detail-status ${resultStatus(selectedCheck)}`}>{resultStatus(selectedCheck)}</b><span>SOURCE</span><b>{selectedCheck.evidence_source || 'unspecified'}</b></div>{selectedCheck.expected_outcome && <div className="detail-evidence"><span>EXPECTED</span><pre>{selectedCheck.expected_outcome}</pre></div>}<div className="detail-evidence"><span>OBSERVED EVIDENCE</span><pre>{selectedCheck.evidence === undefined ? 'No evidence was returned for this check.' : typeof selectedCheck.evidence === 'string' ? selectedCheck.evidence : pretty(selectedCheck.evidence)}</pre></div>{selectedCheck.error && <div className="detail-error"><CircleAlert size={14} />{selectedCheck.error}</div>}</div>}
                <div className="scope-footnote"><ShieldCheck size={14} /><span>A passing report applies only to these listed checks. Evidence provenance is not authenticated by this result.</span></div>
              </>}
            </section>
          </div>
          <div className="runner-bottom-note"><LockIcon /> <span>Your task contract is evaluated by the local API. This interface sends it only to the configured DoneProof server.</span></div>
        </>}
        <footer className="page-footer"><span>DONEPROOF <span>·</span> EVIDENCE-BASED VERIFICATION</span><span>Each result stays within its stated scope.</span></footer>
      </div>
    </main>
  </div>
}

function LockIcon() { return <ShieldCheck size={15} /> }
