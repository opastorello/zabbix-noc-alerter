// Zabbix NOC Alerter - Background Service Worker
// Le os problemas do Zabbix usando a SESSAO ABERTA do navegador (cookie zbx_session),
// ou um token opcional. Toca som + notificacao quando surge problema novo.
// NADA hardcoded: a URL e o token vivem so nas opcoes (chrome.storage.local).

importScripts('i18n.js'); // traducoes (I18N, t, resolveLang) tambem no service worker

const DEFAULT_CONFIG = {
  zabbixUrl: '',          // ex.: https://zabbix.suaempresa.com  (definido pelo usuario)
  apiToken: '',           // opcional; vazio = usa a sessao aberta (cookie zbx_session)
  pollInterval: 15,       // segundos entre checagens (timer no offscreen permite < 30s)
  repeatAlarm: true,      // re-tocar enquanto houver problema NAO-ackado (nag)
  repeatInterval: 60,     // segundos entre re-toques do nag
  minSeverity: 4,         // 0=nao classif 1=info 2=warning 3=average 4=high 5=disaster
  soundEnabled: true,
  notificationsEnabled: true,
  notifyResolved: true,   // notificar quando um problema for resolvido (recuperado)
  volume: 0.8,            // 0..1
  soundSev5: 'klaxon',    // disaster
  soundSev4: 'siren',     // high
  soundSev3: 'pulse',     // average
  soundSev2: 'beepbeep',  // warning
  soundSev1: 'chime',     // info
  ignoreAckd: false,      // ignorar problemas ja reconhecidos (ack)
  ignoreSuppressed: true, // ignorar problemas suprimidos
  excludePatterns: '',    // esconder problema cujo nome/host contenha qualquer um destes (virgula ou linha)
  maxAgeDays: 0,          // = "Age less than N days" do Zabbix (0 = todos; corta cronicos velhos)
  muted: false,           // mudo temporario (toggle pelo popup)
  lang: ''                // '' = auto (idioma do navegador); 'pt' | 'en' | 'es'
};

const SEV_NAME = { 0: 'not_classified', 1: 'info', 2: 'warning', 3: 'average', 4: 'high', 5: 'disaster' };
const SEV_COLOR = { 5: '#e45959', 4: '#e97659', 3: '#ffa059', 2: '#ffc859', 1: '#7499ff', 0: '#97aab3' };

// Limites de negocio (auto-documentados)
const MAX_PROBLEMS_FETCH = 500;   // teto do problem.get por poll
const MAX_PROBLEMS_UI = 60;       // quantos problemas o popup mostra
const MAX_NOTIFS_PER_POLL = 5;    // notificacoes do navegador por ciclo (anti-flood)
const MIN_POLL_SEC = 5;           // piso do intervalo de checagem
// notifId -> url do problema, espelhado em chrome.storage.session (sobrevive ao sleep do SW)
const NOTIF_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const NOTIF_MAX = 200;

let config = { ...DEFAULT_CONFIG };
let state = {
  initialized: false,     // ja fez baseline? (evita flood no 1o poll)
  known: new Map(),       // eventid -> {name, host, severity} dos ativos
  notifUrls: {},          // notifId -> url (fast-path em memoria; persistido em storage.session)
  lastAlarmTs: 0,         // ultimo toque de som (pro nag)
  authMode: null,         // 'header' | 'body' = modo de auth descoberto (cache; evita 2x request no 6.x)
  status: { state: 'unconfigured' }
};
let _pollInFlight = false, _pollAgain = false; // mutex + coalescing do poll

// =====================================================
// Init
// =====================================================
chrome.storage.local.get(['config'], async (r) => {
  if (r.config) config = { ...DEFAULT_CONFIG, ...r.config };
  scheduleAlarm();
  await startOffscreenTimer();
  pollZabbix();
});

chrome.runtime.onStartup.addListener(() => { scheduleAlarm(); pollZabbix(); });
chrome.runtime.onInstalled.addListener(() => { scheduleAlarm(); pollZabbix(); });

// =====================================================
// Helpers
// =====================================================
function normalizeUrl(u) {
  return (u || '').trim().replace(/\/+$/, '');
}

// problemUrl(base, p) vem de i18n.js (importScripts na linha 6) - funcao pura compartilhada
// com o popup, para a regra de roteamento do Zabbix nao divergir entre as duas copias.

function saveConfig() {
  chrome.storage.local.set({ config });
}

function setStatus(s) {
  state.status = { ...s, ts: Date.now() };
  chrome.storage.local.set({ status: state.status });
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text: text || '' });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {}
}

// Le o sessionid do cookie zbx_session do dominio do Zabbix.
async function getSessionId(baseUrl) {
  let cookie = null;
  try {
    cookie = await chrome.cookies.get({ url: baseUrl, name: 'zbx_session' });
  } catch (e) {}
  if (!cookie) {
    // fallback: procura por dominio
    try {
      const host = new URL(baseUrl).hostname;
      const all = await chrome.cookies.getAll({ domain: host });
      cookie = all.find(c => c.name === 'zbx_session') || null;
    } catch (e) {}
  }
  if (!cookie || !cookie.value) return null;
  // zbx_session = base64(JSON {sessionid, sign}) - pode vir url-encoded.
  let val = cookie.value;
  try { val = decodeURIComponent(val); } catch (e) {}
  try {
    const json = JSON.parse(atob(val));
    if (json && json.sessionid) return json.sessionid;
  } catch (e) {}
  // formatos antigos: o proprio valor e o sessionid
  if (/^[a-z0-9]{16,}$/i.test(val)) return val;
  return null;
}

// Chamada JSON-RPC. Tenta header Bearer (Zabbix 7.0+) e cai pro body 'auth' (6.x).
function errText(e, status) {
  if (e) return e.data || e.message || (typeof e === 'string' ? e : JSON.stringify(e));
  return 'HTTP ' + status + ' (sem JSON)';
}

async function apiCall(baseUrl, method, params, token) {
  const url = baseUrl + '/api_jsonrpc.php';
  const body = { jsonrpc: '2.0', method, params, id: 1 };

  async function call(mode) { // mode: 'anon' | 'header' | 'body'
    const headers = { 'Content-Type': 'application/json-rpc' };
    const b = { ...body };
    if (mode === 'header') headers['Authorization'] = 'Bearer ' + token;
    else if (mode === 'body') b.auth = token;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(b), credentials: 'include' });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { res, data };
  }

  // apiinfo.version e metodo PUBLICO do Zabbix: DEVE ir sem auth (rejeita Authorization).
  if (method === 'apiinfo.version') {
    const r = await call('anon');
    if (r.data && !r.data.error) return r.data.result;
    throw new Error(errText(r.data && r.data.error, r.res.status));
  }

  if (!token) throw new Error(t('e_nocred', resolveLang(config.lang)));

  // ordem: o modo que ja funcionou nesta sessao primeiro (cache) -> evita 2x request no 6.x;
  // senao Bearer (7.0+) e cai pro body 'auth' (6.x).
  const order = state.authMode === 'body' ? ['body', 'header'] : ['header', 'body'];
  const tried = {};
  for (const mode of order) {
    const r = await call(mode);
    tried[mode] = r;
    if (r.data && !r.data.error) { state.authMode = mode; return r.data.result; }
  }

  // ambos falharam: mostrar o erro mais diagnostico. Em auth por sessao (6.x) o erro do
  // body e o verdadeiro; manter tambem o do Bearer (verdadeiro no 7.x). Dedup quando iguais.
  const bodyErr = tried.body && tried.body.data && tried.body.data.error && errText(tried.body.data.error, tried.body.res.status);
  const headerErr = tried.header && tried.header.data && tried.header.data.error && errText(tried.header.data.error, tried.header.res.status);
  const msg = [...new Set([bodyErr, headerErr].filter(Boolean))].join(' / ')
    || ('HTTP ' + ((tried.header || tried.body).res.status));
  // condicao esperada (sessao expirada, sem permissao...) -> warn, nao error; quem chama decide a UI
  console.warn('[zbx] ' + method + ' falhou:', msg);
  throw new Error(msg);
}

// =====================================================
// Poll
// =====================================================
// Serializa o poll: 5 fontes o disparam (alarm, tick <30s, pollNow, setConfig, ackEvent).
// Dois polls concorrentes corromperiam state.known (alarme duplo / baseline duplo).
// Se um chega com outro em voo, marca "rodar mais uma vez" e coalesce.
async function pollZabbix() {
  if (_pollInFlight) { _pollAgain = true; return; }
  _pollInFlight = true;
  try {
    do { _pollAgain = false; await _pollZabbixOnce(); } while (_pollAgain);
  } finally { _pollInFlight = false; }
}

async function _pollZabbixOnce() {
  const base = normalizeUrl(config.zabbixUrl);
  if (!base) { setStatus({ state: 'unconfigured' }); setBadge('', ''); return; }

  let token = (config.apiToken || '').trim();
  let via = 'token';
  if (!token) {
    token = await getSessionId(base);
    via = 'session';
    if (!token) { setStatus({ state: 'no-session', via }); setBadge('!', '#97aab3'); return; }
  }

  let problems;
  try {
    const pget = {
      output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged', 'suppressed'],
      selectAcknowledges: ['clock', 'message'],
      recent: false,
      sortfield: ['eventid'],
      sortorder: 'DESC',
      limit: MAX_PROBLEMS_FETCH
    };
    // filtra severidade no servidor: nao trazer 500 problemas baixos so pra descartar no cliente
    // (com sort por eventid, ruido de baixa severidade poderia esconder disasters no teto de 500)
    const _min = Number(config.minSeverity) || 0;
    if (_min > 0) pget.severities = Array.from({ length: 6 - _min }, (_, i) => _min + i);
    problems = await apiCall(base, 'problem.get', pget, token);
  } catch (e) {
    const emsg = String((e && e.message) || e);
    // cookie presente mas sessao expirada -> 'Not authorized'. Tratar como acionavel (relogar),
    // nao como erro cru. So quando via=session (no modo token o erro de auth e config, nao login).
    if (via === 'session' && /not authorized|session terminated|re-login|reauthorization|need to be logged/i.test(emsg)) {
      setStatus({ state: 'no-session', via });
      setBadge('!', '#97aab3');
      return;
    }
    setStatus({ state: 'error', via, error: emsg });
    setBadge('x', '#e45959');
    return;
  }

  if (!Array.isArray(problems)) problems = [];

  // filtro (severidade minima + ack/suprimido)
  const maxAgeMs = (Number(config.maxAgeDays) || 0) * 86400 * 1000; // espelha "Age less than N days" do Zabbix (0 = sem limite)
  let active = problems.filter(p => {
    if (Number(p.severity) < Number(config.minSeverity)) return false;
    if (config.ignoreAckd && p.acknowledged === '1') return false;
    if (config.ignoreSuppressed && p.suppressed === '1') return false;
    if (maxAgeMs && (Date.now() - Number(p.clock) * 1000) > maxAgeMs) return false; // esconde cronicos velhos
    return true;
  });

  // resolve o HOST de cada problema (problem.get nao traz host nesta versao -> via trigger.get)
  const tids = [...new Set(active.map(p => p.objectid).filter(Boolean))];
  const hostMap = {};
  if (tids.length) {
    try {
      const trg = await apiCall(base, 'trigger.get', { triggerids: tids, output: ['triggerid'], selectHosts: ['hostid', 'name'] }, token);
      (trg || []).forEach(t => { const h = (t.hosts && t.hosts[0]) || {}; hostMap[t.triggerid] = { name: h.name || '', hostid: h.hostid || '' }; });
    } catch (e) {
      console.warn('[zbx] trigger.get falhou; hosts ficarao vazios neste poll:', String((e && e.message) || e));
    }
  }
  active.forEach(p => {
    const h = hostMap[p.objectid] || {}; p.host = h.name || ''; p.hostid = h.hostid || '';
    const acks = (p.acknowledges || []).filter(a => a.message && a.message.trim()).sort((a, b) => Number(a.clock) - Number(b.clock));
    p.ackmsg = acks.length ? acks[acks.length - 1].message : '';
  });

  // filtro 2: excluir por texto (nome OU host contem) - corta lixo cronico; separa por virgula ou quebra de linha
  const exTerms = (config.excludePatterns || '').split(/[\n,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (exTerms.length) {
    active = active.filter(p => {
      const hay = ((p.name || '') + ' ' + (p.host || '')).toLowerCase();
      return !exTerms.some(t => hay.includes(t));
    });
  }

  const currentMap = new Map(active.map(p => [p.eventid, { name: p.name, host: p.host || '', hostid: p.hostid || '', objectid: p.objectid || '', severity: Number(p.severity) }]));

  // novos (fresh) e resolvidos (sairam da lista) - so depois do baseline
  let fresh = [], resolved = [];
  if (state.initialized) {
    fresh = active.filter(p => !state.known.has(p.eventid));
    for (const [id, d] of state.known) { if (!currentMap.has(id)) resolved.push({ eventid: id, ...d }); }
  } else {
    state.lastAlarmTs = Date.now(); // baseline silencioso
  }
  state.known = currentMap;
  state.initialized = true;

  // contagem por severidade
  const bySev = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
  active.forEach(p => { bySev[Number(p.severity)] = (bySev[Number(p.severity)] || 0) + 1; });
  const maxSev = active.reduce((m, p) => Math.max(m, Number(p.severity)), 0);

  setStatus({
    state: 'ok', via,
    total: active.length,
    bySev,
    freshCount: fresh.length,
    problems: active.slice(0, MAX_PROBLEMS_UI).map(p => ({
      eventid: p.eventid, objectid: p.objectid, hostid: p.hostid || '', name: p.name, host: p.host || '', severity: Number(p.severity),
      clock: Number(p.clock), acknowledged: p.acknowledged === '1', suppressed: p.suppressed === '1', ackmsg: p.ackmsg || ''
    }))
  });

  setBadge(active.length ? String(active.length) : '', SEV_COLOR[maxSev] || '#97aab3');

  // dispara alerta
  const now = Date.now();
  if (!config.muted) {
    // NOVOS: som + notificacao imediatos
    if (fresh.length) {
      const freshMax = fresh.reduce((m, p) => Math.max(m, Number(p.severity)), 0);
      if (config.soundEnabled) { playSound(soundForSeverity(freshMax), config.volume); state.lastAlarmTs = now; }
      if (config.notificationsEnabled) {
        fresh.sort((a, b) => Number(b.severity) - Number(a.severity));
        fresh.slice(0, MAX_NOTIFS_PER_POLL).forEach(p => notify(p, base));
      }
    }
    // NAG: re-toca enquanto houver problema NAO-ackado (ate dar ack ou mute)
    if (config.soundEnabled && config.repeatAlarm) {
      const nagPool = active.filter(p => p.acknowledged !== '1');
      const gap = Math.max(MIN_POLL_SEC, Number(config.repeatInterval) || 60) * 1000;
      if (nagPool.length && (now - (state.lastAlarmTs || 0)) >= gap) {
        const nagMax = nagPool.reduce((m, p) => Math.max(m, Number(p.severity)), 0);
        playSound(soundForSeverity(nagMax), config.volume);
        state.lastAlarmTs = now;
      }
    }
  }

  // RESOLVIDOS: notificacao de recuperacao (aparece mesmo mutado - e so notificacao)
  if (config.notifyResolved && config.notificationsEnabled && resolved.length) {
    resolved.slice(0, MAX_NOTIFS_PER_POLL).forEach(p => notifyResolved(p, base));
  }
}

function soundForSeverity(sev) {
  return config['soundSev' + sev] || config.soundSev1 || 'pulse';
}

// =====================================================
// Notifications
// =====================================================
// Espelha notifId->url em chrome.storage.session (in-memory, limpo ao fechar o navegador;
// sobrevive ao sleep do SW). TTL + poda evitam vazamento e mapa infinito.
function saveNotifUrl(id, url) {
  state.notifUrls[id] = url; // fast-path em memoria
  try {
    chrome.storage.session.get(['notifUrls'], (r) => {
      const map = r.notifUrls || {};
      map[id] = { url, ts: Date.now() };
      const ids = Object.keys(map);
      if (ids.length > NOTIF_MAX) {
        ids.sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0));
        ids.slice(0, ids.length - NOTIF_MAX).forEach(old => delete map[old]);
      }
      chrome.storage.session.set({ notifUrls: map });
    });
  } catch (e) {}
}

async function takeNotifUrl(id) {
  if (state.notifUrls[id]) return state.notifUrls[id];
  try {
    const r = await chrome.storage.session.get(['notifUrls']);
    const e = r.notifUrls && r.notifUrls[id];
    if (e && (Date.now() - (e.ts || 0)) < NOTIF_TTL_MS) return e.url;
  } catch (e) {}
  return null;
}

function dropNotifUrl(id) {
  delete state.notifUrls[id];
  try {
    chrome.storage.session.get(['notifUrls'], (r) => {
      const map = r.notifUrls || {};
      delete map[id];
      chrome.storage.session.set({ notifUrls: map });
    });
  } catch (e) {}
}

function notify(p, base) {
  const sev = Number(p.severity);
  const id = 'zbx-' + p.eventid + '-' + Date.now();
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '[' + t('nsev' + sev, resolveLang(config.lang)).toUpperCase() + '] ' + (p.host || 'Zabbix'),
    message: p.name || '(...)',
    contextMessage: 'Zabbix NOC Alerter - ' + t('n_click', resolveLang(config.lang)),
    priority: 2,
    requireInteraction: sev >= 4
  });
  saveNotifUrl(id, problemUrl(base, p));
}

function notifyResolved(p, base) {
  const id = 'zbxr-' + p.eventid + '-' + Date.now();
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '✓ ' + t('n_resolved', resolveLang(config.lang)) + ' - ' + (p.host || 'Zabbix'),
    message: p.name || '(...)',
    contextMessage: 'Zabbix NOC Alerter - ' + t('n_recovered', resolveLang(config.lang)),
    priority: 1,
    requireInteraction: false
  });
  saveNotifUrl(id, problemUrl(base, p));
}

chrome.notifications.onClicked.addListener((id) => {
  takeNotifUrl(id).then((url) => {
    if (url) chrome.tabs.create({ url });
    chrome.notifications.clear(id);
    dropNotifUrl(id);
  });
});

// =====================================================
// Offscreen audio (MV3: service worker nao toca som)
// =====================================================
async function ensureOffscreen() {
  const has = chrome.offscreen && (await chrome.offscreen.hasDocument?.());
  if (!has) {
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Tocar alerta sonoro de problema novo no Zabbix.'
      });
    } catch (e) { /* corrida: ja existe */ }
  }
  // SEMPRE re-arma o heartbeat: o documento pode ter sido destruido pelo Chrome (idle/crash)
  // ou recriado sem timer -> sem isto o poll <30s some e sobra so o alarm de 1min.
  const ms = Math.max(MIN_POLL_SEC, Number(config.pollInterval) || 15) * 1000;
  try { chrome.runtime.sendMessage({ target: 'offscreen', type: 'setInterval', ms }); } catch (e) {}
}

async function playSound(preset, volume) {
  await ensureOffscreen();
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'play', preset: preset || 'beep', volume: Number(volume) || 0.8 });
}

// =====================================================
// Alarms (poll periodico)
// =====================================================
// O alarme e so backstop (1min) - o ritmo fino (<30s) vem do timer no offscreen.
function scheduleAlarm() {
  chrome.alarms.clear('poll');
  chrome.alarms.create('poll', { periodInMinutes: 1, delayInMinutes: 0.05 });
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'poll') pollZabbix(); });

// Mantem um offscreen vivo com um setInterval que "cutuca" o background no intervalo
// configurado (o service worker dorme; o offscreen nao) -> permite checar < 30s.
async function startOffscreenTimer() {
  await ensureOffscreen(); // ensureOffscreen ja (re)arma o setInterval com o pollInterval atual
}

// =====================================================
// Messages (options / popup)
// =====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  if (msg.action === 'getConfig') {
    sendResponse({ config });
    return;
  }

  if (msg.action === 'tick') { // heartbeat vindo do offscreen
    pollZabbix();
    return;
  }

  if (msg.action === 'setConfig') {
    config = { ...DEFAULT_CONFIG, ...config, ...(msg.config || {}) };
    saveConfig();
    state.initialized = false; // re-baseline: nao floodar com o que ja existe
    state.lastAlarmTs = 0;
    scheduleAlarm();
    startOffscreenTimer();
    pollZabbix().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === 'getStatus') {
    sendResponse({ status: state.status, muted: config.muted });
    return;
  }

  if (msg.action === 'pollNow') {
    pollZabbix().then(() => sendResponse({ status: state.status }));
    return true;
  }

  if (msg.action === 'setMuted') {
    config.muted = !!msg.muted;
    saveConfig();
    sendResponse({ ok: true, muted: config.muted });
    return;
  }

  if (msg.action === 'testSound') {
    playSound(msg.preset || 'beep', msg.volume ?? config.volume);
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'testAlert') {
    // som + notificacao de exemplo (pra ver "subindo" no navegador)
    playSound(msg.preset || config.soundSev4 || 'siren', msg.volume ?? config.volume);
    const id = 'zbx-test-' + Date.now();
    chrome.notifications.create(id, {
      type: 'basic', iconUrl: 'icons/icon128.png',
      title: t('n_test_title', resolveLang(config.lang)), message: t('n_test_msg', resolveLang(config.lang)),
      contextMessage: 'Zabbix NOC Alerter - ' + t('n_test_ctx', resolveLang(config.lang)),
      priority: 2, requireInteraction: false
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'ackEvent') {
    (async () => {
      try {
        const base = normalizeUrl(config.zabbixUrl);
        let token = (config.apiToken || '').trim();
        if (!token) token = await getSessionId(base);
        if (!token) { sendResponse({ ok: false, error: t('e_nocred', resolveLang(config.lang)) }); return; }
        // action 6 = acknowledge(2) + add message(4)
        const r = await apiCall(base, 'event.acknowledge', {
          eventids: [String(msg.eventid)], action: 6, message: msg.message || t('ack_msg', resolveLang(config.lang))
        }, token);
        console.log('[zbx] ack OK', msg.eventid, 'via', token.length, r);
        sendResponse({ ok: true });
        pollZabbix(); // refresca em background, sem segurar a resposta
      } catch (e) {
        console.error('[zbx] ack FALHOU', msg.eventid, e);
        sendResponse({ ok: false, error: String((e && e.message) || e || t('failed', resolveLang(config.lang))) });
      }
    })();
    return true;
  }

  if (msg.action === 'testConnection') {
    (async () => {
      const base = normalizeUrl(msg.zabbixUrl ?? config.zabbixUrl);
      if (!base) { sendResponse({ ok: false, error: t('e_nourl', resolveLang(config.lang)) }); return; }
      let token = (msg.apiToken ?? config.apiToken ?? '').trim();
      let via = 'token';
      if (!token) { token = await getSessionId(base); via = 'session'; }
      if (!token) { sendResponse({ ok: false, via, error: t('no_session', resolveLang(config.lang)) }); return; }
      try {
        const r = await apiCall(base, 'problem.get', { output: ['eventid'], limit: 1 }, token);
        const ver = await apiCall(base, 'apiinfo.version', {}, null).catch(() => null);
        sendResponse({ ok: true, via, sample: Array.isArray(r) ? r.length : 0, version: ver });
      } catch (e) {
        sendResponse({ ok: false, via, error: String(e.message || e) });
      }
    })();
    return true;
  }
});
