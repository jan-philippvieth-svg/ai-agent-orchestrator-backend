let csrfToken = '';
let sessionReady = false;

const $ = (id) => document.getElementById(id);

const state = {
  sessionStatus: $('sessionStatus'),
  stubStatus: $('stubStatus'),
  sessionButton: $('sessionButton'),
  chatForm: $('chatForm'),
  sendButton: $('sendButton'),
  messageInput: $('messageInput'),
  messages: $('messages'),
  metadata: $('metadata'),
  benchmarkButton: $('benchmarkButton'),
  benchmarkStatus: $('benchmarkStatus'),
  benchmarkOutput: $('benchmarkOutput'),
  loadLatestButton: $('loadLatestButton'),
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(csrfToken && options.method && options.method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}),
      ...(options.headers ?? {}),
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof body === 'string' ? body : body.message ?? body.error ?? 'Request failed';
    throw new Error(message);
  }
  return body;
}

async function loadConfig() {
  try {
    const config = await request('/ui/config');
    state.stubStatus.textContent = config.stubMode ? 'Stub-Modus aktiv' : 'Echte Services aktiv';
    state.stubStatus.className = config.stubMode ? 'status warn' : 'status ok';
    $('hybridRetrievalEnabled').checked = Boolean(config.hybridRetrievalEnabled);
  } catch (error) {
    state.stubStatus.textContent = 'Status nicht verfügbar';
    state.stubStatus.className = 'status muted';
  }
}

async function startSession() {
  state.sessionButton.disabled = true;
  try {
    const body = {
      tenantId: $('tenantId').value.trim(),
      userId: $('userId').value.trim(),
    };
    const loginKey = $('loginKey').value;
    const result = await request('/bff/session', {
      method: 'POST',
      headers: { 'x-bff-login-key': loginKey },
      body: JSON.stringify(body),
    });
    csrfToken = result.csrfToken;
    sessionReady = true;
    $('loginKey').value = '';
    state.sessionStatus.textContent = `${result.tenantId} / ${result.userId}`;
    state.sessionStatus.className = 'status ok';
    addMessage('assistant', 'Session aktiv. Das Cockpit nutzt jetzt /bff/chat mit HttpOnly Cookie und CSRF-Token.');
  } catch (error) {
    addMessage('error', `Session konnte nicht gestartet werden: ${error.message}`);
    state.sessionStatus.textContent = 'Session fehlt';
    state.sessionStatus.className = 'status muted';
  } finally {
    state.sessionButton.disabled = false;
  }
}

function buildChatRequest() {
  const projectId = $('projectId').value.trim();
  const sourceType = $('sourceType').value.trim();
  return {
    message: state.messageInput.value.trim(),
    useRetrieval: $('useRetrieval').checked,
    preferredModel: $('preferredModel').value,
    controls: {
      toolRouterEnabled: $('toolRouterEnabled').checked,
      promptGuardEnabled: $('promptGuardEnabled').checked,
      cacheEnabled: $('cacheEnabled').checked,
      hybridRetrievalEnabled: $('hybridRetrievalEnabled').checked,
      benchmarkMode: $('benchmarkMode').checked,
    },
    metadata: {
      ...(projectId ? { projectId } : {}),
      ...(sourceType ? { sourceType } : {}),
    },
  };
}

async function sendChat(event) {
  event.preventDefault();
  if (!sessionReady) {
    addMessage('error', 'Bitte zuerst eine BFF-Session starten.');
    return;
  }

  const payload = buildChatRequest();
  if (!payload.message) return;

  addMessage('user', payload.message);
  state.messageInput.value = '';
  state.sendButton.disabled = true;

  const startedAt = performance.now();
  try {
    const result = await request('/bff/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const elapsed = Math.round(performance.now() - startedAt);
    addMessage('assistant', result.answer, metaSummary(result.metadata, elapsed));
    renderMetadata(result.metadata);
  } catch (error) {
    addMessage('error', `Chat fehlgeschlagen: ${error.message}`);
  } finally {
    state.sendButton.disabled = false;
    state.messageInput.focus();
  }
}

function metaSummary(metadata, elapsed) {
  const tools = metadata.tools?.calls?.map((tool) => tool.name).join(', ') || 'keine Tools';
  const retrieval = metadata.retrievalMode ? ` · ${metadata.retrievalMode}` : '';
  return `${metadata.selectedModel} · ${metadata.classification} · ${metadata.processingTimeMs ?? elapsed}ms · ${metadata.chunksUsed} Chunks${retrieval} · ${tools}`;
}

function renderMetadata(metadata) {
  const diagnostics = metadata.retrievalDiagnostics;
  const retrievalLabel = metadata.retrievalMode
    ? metadata.retrievalMode === 'disabled'
      ? 'disabled'
      : `${metadata.retrievalMode} (${diagnostics?.vectorResults ?? 0} vector / ${diagnostics?.sparseResults ?? 0} sparse / ${diagnostics?.fusedResults ?? 0} fused)`
    : '-';
  const rows = [
    ['Modell', `${metadata.selectedModel} (route: ${metadata.routedModel})`],
    ['Klassifikation', metadata.classification],
    ['Latenz', `${metadata.processingTimeMs}ms`],
    ['Chunks', String(metadata.chunksUsed)],
    ['Retrieval', retrievalLabel],
    ['Tools', metadata.tools?.calls?.map((tool) => `${tool.name}:${tool.status}`).join(', ') || 'keine'],
    ['Tokens', String(metadata.tokensEstimated ?? '-')],
  ];

  state.metadata.innerHTML = rows
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');
}

function addMessage(role, text, meta = '') {
  const message = document.createElement('article');
  message.className = `message ${role}`;
  if (meta) {
    const metaLine = document.createElement('div');
    metaLine.className = 'meta-line';
    metaLine.textContent = meta;
    message.append(metaLine);
  }
  const body = document.createElement('div');
  body.textContent = text;
  message.append(body);
  state.messages.append(message);
  state.messages.scrollTop = state.messages.scrollHeight;
}

async function runBenchmark() {
  if (!sessionReady) {
    addMessage('error', 'Bitte zuerst eine BFF-Session starten.');
    return;
  }

  state.benchmarkButton.disabled = true;
  state.benchmarkStatus.textContent = 'Benchmark läuft...';
  state.benchmarkOutput.textContent = '';

  try {
    const result = await request('/bff/benchmark/run', { method: 'POST', body: JSON.stringify({}) });
    renderBenchmark(result.report);
  } catch (error) {
    state.benchmarkStatus.textContent = `Benchmark fehlgeschlagen: ${error.message}`;
  } finally {
    state.benchmarkButton.disabled = false;
  }
}

async function loadLatestBenchmark() {
  if (!sessionReady) {
    addMessage('error', 'Bitte zuerst eine BFF-Session starten.');
    return;
  }

  try {
    const result = await request('/bff/benchmark/latest');
    renderBenchmark(result.report);
  } catch (error) {
    state.benchmarkStatus.textContent = `latest.json konnte nicht geladen werden: ${error.message}`;
  }
}

function renderBenchmark(report) {
  state.benchmarkStatus.textContent = `${report.mode} · best: ${report.summary.bestScenario} · enterpriseReady: ${report.summary.enterpriseReady}`;
  state.benchmarkOutput.textContent = JSON.stringify(
    {
      id: report.id,
      mode: report.mode,
      summary: report.summary,
      scenarioSummary: report.scenarioSummary,
    },
    null,
    2,
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

state.sessionButton.addEventListener('click', startSession);
state.chatForm.addEventListener('submit', sendChat);
state.benchmarkButton.addEventListener('click', runBenchmark);
state.loadLatestButton.addEventListener('click', loadLatestBenchmark);
loadConfig();
