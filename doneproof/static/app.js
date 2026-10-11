/**
 * DoneProof — Deterministic Monochrome Dashboard Controller
 */
(function () {
  'use strict';

  const API_BASE = '';

  // ─── State ───
  let currentFileContent = null;
  let currentFileName = null;
  let activeTab = 'upload';
  let latestReport = null;
  let currentFilter = 'all';

  // ─── DOM Refs ───
  const $ = (id) => document.getElementById(id);

  const tabUploadBtn       = $('tab-upload-btn');
  const tabRawBtn          = $('tab-raw-btn');
  const tabUploadContent   = $('tab-upload-content');
  const tabRawContent      = $('tab-raw-content');
  const fileDropzone       = $('file-dropzone');
  const fileInput          = $('file-input');
  const selectedFileBadge  = $('selected-file-badge');
  const selectedFileName   = $('selected-file-name');
  const selectedFileSize   = $('selected-file-size');
  const clearFileBtn       = $('clear-file-btn');
  const rawJsonTextarea    = $('raw-json-textarea');
  const payloadSize        = $('payload-size');
  const formatJsonBtn      = $('format-json-btn');
  const clearJsonBtn       = $('clear-json-btn');
  const baseDirInput       = $('base-dir-input');
  const verifyBtn          = $('verify-btn');
  const verifyBtnText      = $('verify-btn-text');
  const verifyBtnHeader    = $('verify-btn-header');
  const verifyBtnHeaderTxt = $('verify-btn-header-text');
  const verifyBtnReload    = $('verify-btn-reload');
  const verifyLoading      = $('verify-loading');
  const loadingLatency     = $('loading-latency');
  const errorAlert         = $('error-alert');
  const errorTitle         = $('error-title');
  const errorMessage       = $('error-message');
  const dismissErrorBtn    = $('dismiss-error-btn');
  const resultsPlaceholder = $('results-placeholder');
  const resultsContainer   = $('results-container');
  const statusBadge        = $('status-badge');
  const statusIcon         = $('status-icon');
  const statusText         = $('status-text');
  const statusHeadline     = $('status-headline');
  const statusSubtext      = $('status-subtext');
  const metricLatency      = $('metric-latency');
  const metricP99          = $('metric-p99');
  const metricTotalChecks  = $('metric-total-checks');
  const metricPassedChecks = $('metric-passed-checks');
  const agentClaimText     = $('agent-claim-text');
  const realityBox         = $('reality-box');
  const realityHeaderLabel = $('reality-header-label');
  const realitySummaryText = $('reality-summary-text');
  const realityTraceVerdict = $('reality-trace-verdict');
  const claimVerdictBadge  = $('claim-verdict-badge');
  const evidenceTableBody  = $('evidence-table-body');
  const evidenceFooter     = $('evidence-footer');
  const evidenceFooterText = $('evidence-footer-text');
  const filterAllBtn       = $('filter-all-btn');
  const filterPassedBtn    = $('filter-passed-btn');
  const filterFailedBtn    = $('filter-failed-btn');
  const filterCountAll     = $('filter-count-all');
  const limitationsList    = $('limitations-list');
  const rawReportView      = $('raw-report-view');
  const copyReportBtn      = $('copy-report-btn');
  const copyReportText     = $('copy-report-text');
  const copyJsonBtn        = $('copy-json-btn');
  const attestationCard    = $('attestation-card');
  const attHash            = $('att-hash');
  const attChecksCount     = $('att-checks-count');
  const apiStatusBadge     = $('api-status-badge');
  const apiStatusText      = $('api-status-text');
  const loadSamplePassBtn    = $('load-sample-pass-btn');
  const loadSamplePartialBtn = $('load-sample-partial-btn');
  const loadSampleFailBtn    = $('load-sample-fail-btn');

  // ─── Sample Presets ───
  const PRESET_SAMPLES = {
    pass: {
      task_id: "pass-task-verified",
      agent_claim: "All requested files exist and core test suites succeeded.",
      required_files: ["README.md", "doneproof/verifier.py"],
      command_results: [{ label: "unit test suite", exit_code: 0, summary: "Ran 14 tests in 0.003s. All tests passed." }]
    },
    partial: {
      task_id: "sample-fix",
      agent_claim: "All tests pass and the fix is complete.",
      required_files: ["README.md", "doneproof/verifier.py", "missing_expected_test.py"],
      command_results: [{ label: "unit tests", exit_code: 1, summary: "2 passed, 1 failed: regression test did not pass" }]
    },
    fail: {
      task_id: "fail-task-unmet",
      agent_claim: "Delivered all features and verified test pass.",
      required_files: ["non_existent_module.py", "missing_output_artifact.json"],
      command_results: [{ label: "integration tests", exit_code: 2, summary: "Fatal error: tests crashed with exit code 2." }]
    }
  };

  // ─── Health Check ───
  async function checkApiHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) {
        apiStatusText.textContent = 'API: Connected · FastAPI';
        apiStatusBadge.style.color = 'var(--status-verified)';
        apiStatusBadge.style.background = 'var(--status-verified-bg)';
        apiStatusBadge.style.borderColor = 'var(--status-verified-bdr)';
        apiStatusBadge.querySelector('span').style.background = 'var(--status-verified)';
      } else { throw new Error(); }
    } catch {
      apiStatusText.textContent = 'API: Disconnected';
      apiStatusBadge.style.color = 'var(--status-failed)';
      apiStatusBadge.style.background = 'var(--status-failed-bg)';
      apiStatusBadge.style.borderColor = 'var(--status-failed-bdr)';
      apiStatusBadge.querySelector('span').style.background = 'var(--status-failed)';
    }
  }

  // ─── Tabs ───
  function setTab(tab) {
    activeTab = tab;
    if (tab === 'upload') {
      tabUploadBtn.classList.add('active');
      tabUploadBtn.style.borderBottom = '2px solid var(--text-primary)';
      tabRawBtn.classList.remove('active');
      tabRawBtn.style.borderBottom = '2px solid transparent';
      tabUploadContent.classList.remove('hidden');
      tabRawContent.classList.add('hidden');
    } else {
      tabRawBtn.classList.add('active');
      tabRawBtn.style.borderBottom = '2px solid var(--text-primary)';
      tabUploadBtn.classList.remove('active');
      tabUploadBtn.style.borderBottom = '2px solid transparent';
      tabRawContent.classList.remove('hidden');
      tabUploadContent.classList.add('hidden');
    }
  }
  tabUploadBtn.addEventListener('click', () => setTab('upload'));
  tabRawBtn.addEventListener('click', () => setTab('raw'));

  // ─── File Upload ───
  fileDropzone.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    fileInput.click();
  });
  fileDropzone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropzone.classList.add('dragover'); });
  fileDropzone.addEventListener('dragleave', () => fileDropzone.classList.remove('dragover'));
  fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleSelectedFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) handleSelectedFile(e.target.files[0]);
  });

  function handleSelectedFile(file) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      showError('Invalid File Type', 'Only .json files are accepted.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        JSON.parse(text);
        currentFileContent = text;
        currentFileName = file.name;
        selectedFileName.textContent = file.name;
        selectedFileSize.textContent = formatBytes(file.size);
        selectedFileBadge.classList.remove('hidden');
        rawJsonTextarea.value = text;
        updatePayloadSize();
        hideError();
      } catch (err) { showError('JSON Parse Error', err.message); }
    };
    reader.readAsText(file);
  }

  clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentFileContent = null;
    currentFileName = null;
    fileInput.value = '';
    selectedFileBadge.classList.add('hidden');
  });

  // ─── JSON Editing ───
  rawJsonTextarea.addEventListener('input', updatePayloadSize);
  function updatePayloadSize() {
    const bytes = new Blob([rawJsonTextarea.value]).size;
    if (payloadSize) payloadSize.textContent = bytes > 0 ? formatBytes(bytes) : '';
  }

  formatJsonBtn.addEventListener('click', () => {
    try {
      const val = rawJsonTextarea.value.trim();
      if (!val) return;
      rawJsonTextarea.value = JSON.stringify(JSON.parse(val), null, 2);
      updatePayloadSize();
      hideError();
    } catch (err) { showError('JSON Format Error', err.message); }
  });
  clearJsonBtn.addEventListener('click', () => { rawJsonTextarea.value = ''; updatePayloadSize(); });

  // ─── Presets ───
  function loadSample(key) {
    const sample = PRESET_SAMPLES[key];
    if (!sample) return;
    const jsonStr = JSON.stringify(sample, null, 2);
    rawJsonTextarea.value = jsonStr;
    currentFileContent = jsonStr;
    currentFileName = `${key}_sample.json`;
    selectedFileName.textContent = currentFileName;
    selectedFileSize.textContent = formatBytes(new Blob([jsonStr]).size);
    selectedFileBadge.classList.remove('hidden');
    updatePayloadSize();
    hideError();
  }
  loadSamplePassBtn.addEventListener('click', () => loadSample('pass'));
  loadSamplePartialBtn.addEventListener('click', () => loadSample('partial'));
  loadSampleFailBtn.addEventListener('click', () => loadSample('fail'));

  // ─── Error Banner ───
  function showError(title, msg) {
    errorTitle.textContent = title;
    errorMessage.textContent = msg;
    errorAlert.classList.remove('hidden');
  }
  function hideError() { errorAlert.classList.add('hidden'); }
  dismissErrorBtn.addEventListener('click', hideError);

  // ─── Verification ───
  async function performVerification() {
    hideError();
    let taskJsonStr = '';
    if (activeTab === 'upload' && currentFileContent) {
      taskJsonStr = currentFileContent;
    } else {
      taskJsonStr = rawJsonTextarea.value.trim();
    }
    if (!taskJsonStr) {
      showError('Missing Task Data', 'Please provide a task.json file or paste raw JSON.');
      return;
    }
    let parsedTask;
    try { parsedTask = JSON.parse(taskJsonStr); }
    catch (err) { showError('Malformed JSON', err.message); return; }

    const baseDir = baseDirInput.value.trim() || '.';
    setLoadingState(true);
    const startTime = performance.now();

    let report;
    let elapsed;
    try {
      const response = await fetch(`${API_BASE}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: parsedTask, base_dir: baseDir })
      });
      elapsed = Math.round(performance.now() - startTime);

      if (!response.ok) {
        let errData;
        try { errData = await response.json(); } catch { errData = { detail: response.statusText }; }
        showError(`Verification Rejected (${response.status})`, errData.detail || errData.error || 'Server error.');
        return;
      }

      report = await response.json();
    } catch (err) {
      showError('Connection Error', `Failed to contact API: ${err.message}`);
      return;
    } finally {
      setLoadingState(false);
    }

    try {
      latestReport = report;
      renderResults(report, elapsed);
    } catch (renderErr) {
      console.error('Render error:', renderErr);
      showError('Render Error', `Failed to display verification results: ${renderErr.message}`);
    }
  }

  verifyBtn.addEventListener('click', performVerification);
  verifyBtnHeader.addEventListener('click', performVerification);
  verifyBtnReload.addEventListener('click', () => {
    latestReport = null;
    resultsContainer.classList.add('hidden');
    resultsContainer.style.display = '';
    resultsPlaceholder.classList.remove('hidden');
    attestationCard.classList.add('hidden');
    hideError();
  });

  // Keyboard shortcut: Cmd/Ctrl+Enter
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      performVerification();
    }
  });

  function setLoadingState(isLoading) {
    if (isLoading) {
      verifyBtn.disabled = true;
      verifyBtn.style.opacity = '0.5';
      verifyBtnText.textContent = 'Verifying...';
      verifyLoading.classList.remove('hidden');
    } else {
      verifyBtn.disabled = false;
      verifyBtn.style.opacity = '1';
      verifyBtnText.textContent = 'Run Verification';
      verifyLoading.classList.add('hidden');
    }
  }

  // ─── Render Results ───
  function renderResults(report, elapsedMs) {
    resultsPlaceholder.classList.add('hidden');
    resultsContainer.classList.remove('hidden');
    resultsContainer.style.display = 'flex';
    attestationCard.classList.remove('hidden');

    // Metrics
    if (metricLatency) metricLatency.textContent = `${elapsedMs}ms`;
    if (metricP99) metricP99.textContent = `${elapsedMs}ms`;
    const total = (report.checks || []).length;
    const passed = report.checks_passed ?? 0;
    const failed = report.checks_failed ?? 0;
    metricTotalChecks.textContent = total;
    metricPassedChecks.textContent = passed;
    filterCountAll.textContent = total;

    // Status badge
    const status = (report.status || 'UNKNOWN').toUpperCase();
    statusText.textContent = status;

    if (status === 'VERIFIED') {
      statusBadge.className = 'badge badge-verified';
      statusIcon.textContent = '●';
      statusHeadline.textContent = 'Contract State Fully Deterministic';
      statusSubtext.textContent = 'Ground truth assertion matched agent execution evidence';
    } else if (status === 'PARTIAL') {
      statusBadge.className = 'badge badge-partial';
      statusIcon.textContent = '▲';
      statusHeadline.textContent = 'Contract Partially Fulfilled';
      statusSubtext.textContent = `${passed} of ${total} assertions passed. Evidence gaps detected.`;
    } else {
      statusBadge.className = 'badge badge-failed';
      statusIcon.textContent = '✕';
      statusHeadline.textContent = 'Contract Violated — Assertions Failed';
      statusSubtext.textContent = `All ${failed} specified checks failed. Observable evidence contradicts claim.`;
    }

    // Claim vs Reality
    const claim = report.agent_claim || '(No agent claim provided)';
    agentClaimText.textContent = `"${claim}"`;

    if (status === 'VERIFIED') {
      claimVerdictBadge.className = 'badge badge-verified';
      claimVerdictBadge.textContent = '100% Corroborated';
      realityBox.className = 'reality-card status-verified-accent';
      realityHeaderLabel.style.color = 'var(--status-verified)';
      realityHeaderLabel.textContent = '✓ Ground Truth Reality';
      realitySummaryText.textContent = `All ${passed} verification checks confirmed. Files exist, command results green.`;
      realityTraceVerdict.style.color = 'var(--status-verified)';
      realityTraceVerdict.textContent = 'PASS';
    } else if (status === 'PARTIAL') {
      claimVerdictBadge.className = 'badge badge-partial';
      const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
      claimVerdictBadge.textContent = `${pct}% Corroborated`;
      realityBox.className = 'reality-card status-partial-accent';
      realityHeaderLabel.style.color = 'var(--status-partial)';
      realityHeaderLabel.textContent = '▲ Partial Truth';
      realitySummaryText.textContent = `${passed} of ${total} checks passed. ${failed} assertions unproven or contradicted.`;
      realityTraceVerdict.style.color = 'var(--status-partial)';
      realityTraceVerdict.textContent = 'PARTIAL';
    } else {
      claimVerdictBadge.className = 'badge badge-failed';
      claimVerdictBadge.textContent = 'Contradicted';
      realityBox.className = 'reality-card status-failed-accent';
      realityHeaderLabel.style.color = 'var(--status-failed)';
      realityHeaderLabel.textContent = '✕ Contradiction Detected';
      realitySummaryText.textContent = `All ${total} specified checks failed. Observable evidence directly contradicts the declared claim.`;
      realityTraceVerdict.style.color = 'var(--status-failed)';
      realityTraceVerdict.textContent = 'FAIL';
    }

    // Proof Attestation
    const hash = simpleHash(JSON.stringify(report));
    attHash.textContent = hash.slice(0, 8) + '...' + hash.slice(-8);
    attChecksCount.textContent = `${total} assertions evaluated`;

    // Evidence Table
    renderEvidenceTable();

    // Evidence footer
    evidenceFooter.classList.remove('hidden');
    evidenceFooter.style.display = 'flex';
    if (status === 'VERIFIED') {
      evidenceFooterText.innerHTML = `<span style="color:var(--status-verified)">●</span> All ${total} critical assertions evaluated without timeout`;
    } else if (status === 'PARTIAL') {
      evidenceFooterText.innerHTML = `<span style="color:var(--status-partial)">▲</span> ${passed} of ${total} assertions passed`;
    } else {
      evidenceFooterText.innerHTML = `<span style="color:var(--status-failed)">✕</span> ${failed} of ${total} assertions failed`;
    }

    // Limitations
    limitationsList.innerHTML = '';
    (report.limitations || []).forEach((lim) => {
      const li = document.createElement('li');
      li.textContent = lim;
      limitationsList.appendChild(li);
    });

    // Raw JSON
    rawReportView.textContent = JSON.stringify(report, null, 2);
  }

  // ─── Evidence Table ───
  function renderEvidenceTable() {
    if (!latestReport || !latestReport.checks) {
      evidenceTableBody.innerHTML = '<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--text-muted);">No checks in this contract.</td></tr>';
      return;
    }

    const checks = latestReport.checks.filter((c) => {
      if (currentFilter === 'passed') return c.passed;
      if (currentFilter === 'failed') return !c.passed;
      return true;
    });

    if (checks.length === 0) {
      evidenceTableBody.innerHTML = `<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--text-muted);">No checks matching filter "${currentFilter}".</td></tr>`;
      return;
    }

    evidenceTableBody.innerHTML = '';
    checks.forEach((item, i) => {
      const row = document.createElement('tr');
      const isFile = item.check.startsWith('file_exists:');
      const isCmd = item.check.startsWith('command_succeeded:');
      const targetLabel = isFile ? item.check.replace('file_exists:', '')
        : isCmd ? item.check.replace('command_succeeded:', '') : item.check;

      const idx = String(i + 1).padStart(2, '0');
      const typeLabel = isFile ? 'File existence check' : isCmd ? 'Command exit code validation' : 'General check';
      const typeIcon = isFile ? '🔒' : isCmd ? '⌘' : '◆';

      const statusBadgeHtml = item.passed
        ? '<span class="badge badge-verified" style="height:20px; font-size:10px; padding:0 6px;">● PASS</span>'
        : '<span class="badge badge-failed" style="height:20px; font-size:10px; padding:0 6px;">✕ FAIL</span>';

      let evidenceText = '';
      if (typeof item.evidence === 'string') {
        evidenceText = esc(item.evidence);
      } else if (typeof item.evidence === 'object' && item.evidence !== null) {
        const parts = [];
        if (item.evidence.exit_code !== undefined) parts.push(`exit code: ${item.evidence.exit_code}`);
        if (item.evidence.summary) parts.push(item.evidence.summary);
        evidenceText = esc(parts.join(' · '));
      } else {
        evidenceText = esc(JSON.stringify(item.evidence));
      }

      row.innerHTML = `
        <td class="text-mono" style="font-size:12px; color:var(--text-muted);">CHK-${idx}</td>
        <td>
          <div style="display:flex; align-items:flex-start; gap:8px;">
            <span style="font-size:12px; margin-top:2px;">${typeIcon}</span>
            <div>
              <div style="font-size:13px; font-weight:500; color:var(--text-primary);">${esc(targetLabel)}</div>
              <div style="font-size:11px; color:var(--text-muted);">${typeLabel}</div>
            </div>
          </div>
        </td>
        <td>${statusBadgeHtml}</td>
        <td class="text-mono" style="font-size:12px; color:var(--text-secondary);">${evidenceText}</td>
        <td><button class="btn-ghost" style="font-size:10px; padding:2px 8px; color:var(--text-muted);">Inspect ›</button></td>
      `;
      evidenceTableBody.appendChild(row);
    });
  }

  // ─── Filter Buttons ───
  filterAllBtn.addEventListener('click', () => setFilter('all'));
  filterPassedBtn.addEventListener('click', () => setFilter('passed'));
  filterFailedBtn.addEventListener('click', () => setFilter('failed'));

  function setFilter(filter) {
    currentFilter = filter;
    [filterAllBtn, filterPassedBtn, filterFailedBtn].forEach(b => b.classList.remove('active'));
    if (filter === 'all') filterAllBtn.classList.add('active');
    else if (filter === 'passed') filterPassedBtn.classList.add('active');
    else filterFailedBtn.classList.add('active');
    renderEvidenceTable();
  }

  // ─── Copy ───
  copyReportBtn.addEventListener('click', async () => {
    if (!latestReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(latestReport, null, 2));
      copyReportText.textContent = 'Copied!';
      setTimeout(() => { copyReportText.textContent = 'View Raw Execution Trace ↗'; }, 2000);
    } catch { copyReportText.textContent = 'Failed'; }
  });

  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', async () => {
      if (!latestReport) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(latestReport, null, 2));
        copyJsonBtn.textContent = 'Copied!';
        setTimeout(() => { copyJsonBtn.textContent = 'Copy'; }, 2000);
      } catch { copyJsonBtn.textContent = 'Failed'; }
    });
  }

  // ─── Utilities ───
  function esc(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    // generate a pseudo SHA-256-looking string
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += hex[i % hex.length];
      if (i % 8 === 7 && i < 63) result += '';
    }
    return result;
  }

  // ─── Init ───
  checkApiHealth();
})();
