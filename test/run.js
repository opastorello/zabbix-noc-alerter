// Testes do Zabbix NOC Alerter - node puro, sem framework, sem dependencias.
// Carrega i18n.js + background.js num contexto com chrome.* e fetch mockados e
// exercita funcoes puras + cenarios de poll multi-instancia. Rode com: npm test
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const i18nSrc = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
const bgSrc = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');

// ---------- contadores ----------
let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FAIL: ' + label); } }
function eq(a, b, label) { assert(JSON.stringify(a) === JSON.stringify(b), label + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' (got ' + JSON.stringify(a) + ')')); }

// ---------- capturas de efeitos (som/notificacao/badge) ----------
let captured = { sounds: [], notifs: [], cleared: [], badge: null };
function resetCaptures() { captured = { sounds: [], notifs: [], cleared: [], badge: null }; }
let notifButtonListener = null, notifClickListener = null, openedTabs = [];

// ---------- cenario do Zabbix (controlado por teste) ----------
// login: {user, pass, sid} habilita o user.login; requireSid: problem.get exige o sid atual
// (simula sessao expirada trocando o sid); loginParam: 'username' (moderno) ou 'user' (Zabbix antigo);
// cookie: valor do zbx_session do navegador (null = sem sessao aberta)
let scenario = { byBase: {}, version: '6.0.4', groups: {}, lastProblemGet: {}, meetTabs: [], workPeriod: '', login: null, requireSid: false, loginParam: 'username', lastAuth: {}, cookie: null, disabledTriggers: [], disabledHosts: [], problemGetError: null, problemGetCalls: {}, triggerGetError: null, hiddenTriggers: [] };

// ---------- mock chrome ----------
const storageLocal = {}, storageSession = {};
let messageListener = null;
const chrome = {
  storage: {
    local: {
      get: (keys, cb) => { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (storageLocal[k] !== undefined) o[k] = storageLocal[k]; }); cb(o); },
      set: (obj, cb) => { Object.assign(storageLocal, obj); cb && cb(); },
    },
    session: {
      get: (keys, cb) => { const o = {}; cb && cb(o); return Promise.resolve(o); },
      set: (obj, cb) => { Object.assign(storageSession, obj); cb && cb(); return Promise.resolve(); },
    },
  },
  action: { setBadgeText: ({ text }) => { captured.badge = text; }, setBadgeBackgroundColor: () => {} },
  notifications: {
    create: (id, opts) => { captured.notifs.push({ id, title: opts && opts.title, message: opts && opts.message, contextMessage: opts && opts.contextMessage, buttons: opts && opts.buttons }); },
    clear: (id) => { captured.cleared.push(id); },
    onClicked: { addListener: (fn) => { notifClickListener = fn; } }, onClosed: { addListener: () => {} },
    onButtonClicked: { addListener: (fn) => { notifButtonListener = fn; } },
  },
  runtime: {
    getManifest: () => ({ version: '0.0.0' }),
    onMessage: { addListener: (fn) => { messageListener = fn; } },
    onStartup: { addListener: () => {} }, onInstalled: { addListener: () => {} },
    sendMessage: () => Promise.resolve(), lastError: null, // MV3: sem callback devolve Promise (o .catch do background depende disso)
  },
  alarms: { create: () => {}, clear: () => {}, onAlarm: { addListener: () => {} }, get: (_n, cb) => cb && cb(null) },
  cookies: {
    get: async ({ name }) => (name === 'zbx_session' && scenario.cookie) ? { name, value: scenario.cookie } : null,
    getAll: async () => scenario.cookie ? [{ name: 'zbx_session', value: scenario.cookie }] : [],
  },
  tabs: { create: (o) => { openedTabs.push(o); }, query: async ({ url }) => scenario.meetTabs.filter(u => String(url) === 'https://meet.google.com/*' && u.startsWith('https://meet.google.com/')).map(u => ({ url: u })) },
  offscreen: { hasDocument: async () => true, createDocument: async () => {}, closeDocument: async () => {} },
};

// ---------- mock fetch (JSON-RPC do Zabbix) ----------
async function fetchMock(url, opts) {
  const base = String(url).replace('/api_jsonrpc.php', '');
  const body = JSON.parse(opts.body);
  const hdrs = (opts && opts.headers) || {};
  const auth = String(hdrs['Authorization'] || '').replace('Bearer ', '') || body.auth || null;
  const errResp = (message, data) => ({ status: 200, json: async () => ({ jsonrpc: '2.0', error: { message, data }, id: 1 }) });
  let result;
  // Zabbix 7.2+/8.0: o parametro 'auth' no corpo nao existe mais (erro de schema, antes da credencial)
  if (scenario.rejectBodyAuth && body.auth !== undefined) {
    scenario.bodyAuthCalls = (scenario.bodyAuthCalls || 0) + 1;
    return { status: 200, json: async () => ({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid request.', data: 'Invalid parameter "/": unexpected parameter "auth".' }, id: 1 }) };
  }
  // Zabbix 6.x: nao conhece o header Bearer (so o 'auth' no corpo)
  if (scenario.rejectHeaderAuth && hdrs['Authorization'] && body.method !== 'apiinfo.version' && body.method !== 'user.login') return errResp('Invalid params.', 'Not authorized.');
  if (scenario.badToken && auth === scenario.badToken && body.method !== 'apiinfo.version' && body.method !== 'user.login') return errResp('Invalid params.', 'Session terminated, re-login, please.');
  if (body.method === 'apiinfo.version') result = scenario.version;
  else if (body.method === 'user.login') {
    if (auth) return errResp('Invalid params.', 'user.login nao aceita autorizacao'); // metodo publico
    const wantOld = scenario.loginParam === 'user';
    if (wantOld && body.params.username !== undefined) return errResp('Invalid params.', 'unexpected parameter "username"');
    if (!wantOld && body.params.user !== undefined) return errResp('Invalid params.', 'unexpected parameter "user"');
    const u = wantOld ? body.params.user : body.params.username;
    if (scenario.login && u === scenario.login.user && body.params.password === scenario.login.pass) result = scenario.login.sid;
    else return errResp('Login name or password is incorrect.', '');
  }
  else if (body.method === 'problem.get') {
    scenario.lastProblemGet[base] = body.params;
    scenario.lastAuth[base] = auth;
    scenario.problemGetCalls[base] = (scenario.problemGetCalls[base] || 0) + 1;
    if (scenario.requireSid && scenario.login && auth !== scenario.login.sid) return errResp('Session terminated, re-login, please.', '');
    if (scenario.problemGetError) return errResp(scenario.problemGetError, '');
    result = (scenario.byBase[base] || []).map(p => ({ ...p }));
  }
  else if (body.method === 'hostgroup.get') { const want = (body.params.filter && body.params.filter.name) || []; result = (scenario.groups[base] || []).filter(g => want.includes(g.name)).map(g => ({ groupid: g.groupid })); }
  else if (body.method === 'trigger.get') {
    if (scenario.triggerGetError) return errResp(scenario.triggerGetError, '');
    const ids = ((body.params && body.params.triggerids) || []).filter(id => !scenario.hiddenTriggers.includes(id));
    result = ids.map(id => ({ triggerid: id, status: scenario.disabledTriggers.includes(id) ? '1' : '0', hosts: [{ hostid: 'h' + id, name: 'host-' + id, status: scenario.disabledHosts.includes('h' + id) ? '1' : '0' }] }));
  }
  else if (body.method === 'event.acknowledge') {
    scenario.ackCalls = scenario.ackCalls || []; scenario.ackCalls.push({ base, params: body.params });
    if (scenario.ackError) return errResp(scenario.ackError, '');
    result = { eventids: body.params.eventids };
  }
  else if (body.method === 'settings.get') {
    if (scenario.workPeriod === null) return { status: 200, json: async () => ({ jsonrpc: '2.0', error: { message: 'No permissions', data: 'settings.get negado' }, id: 1 }) };
    result = { work_period: scenario.workPeriod || '' };
  }
  else result = [];
  return { status: 200, json: async () => ({ jsonrpc: '2.0', result, id: 1 }) };
}

// ---------- monta o contexto ----------
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: fetchMock, chrome,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  URL, TextEncoder, TextDecoder, structuredClone, importScripts: () => {},
};
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
const bridge = '\n;globalThis.__bg = { getConfig:()=>config, getState:()=>state, getDefaults:()=>DEFAULT_CONFIG, setPlaySpy:(fn)=>{ playSound = fn; } };';
vm.runInContext(bgSrc + bridge, sandbox, { filename: 'background.js' });
const BG = sandbox.__bg;
BG.setPlaySpy((preset, vol) => { captured.sounds.push({ preset, vol }); return Promise.resolve(); });

// ---------- popup.js real (as funcoes; o DOM e um duble minimo) ----------
// Monta a linha (renderList) sem navegador: getElementById devolve um elemento falso que guarda o
// innerHTML e o teste le o HTML montado. Nao valida layout/CSS - isso continua sendo ao vivo.
const popupSrc = fs.readFileSync(path.join(ROOT, 'popup.js'), 'utf8');
const popEls = {};
function fakeEl() { return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, className: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, getAttribute: () => null }; }
const popEl = (id) => popEls[id] || (popEls[id] = fakeEl());
const popSandbox = {
  console, setTimeout, clearTimeout, setInterval: () => 0, navigator: { language: 'pt-BR' },
  document: { addEventListener() {}, getElementById: popEl, querySelector: popEl, querySelectorAll: () => [], documentElement: {},
    // esc() usa div.textContent -> innerHTML; o navegador serializa texto escapando so & < > (e nbsp)
    createElement: () => { let txt = ''; return { set textContent(v) { txt = String(v); }, get innerHTML() { return txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;'); } }; } },
  chrome: { runtime: { sendMessage() {}, getManifest: () => ({ version: '0.0.0' }), openOptionsPage() {} }, storage: { local: { get() {}, set() {} } } },
};
vm.createContext(popSandbox);
vm.runInContext(i18nSrc, popSandbox, { filename: 'i18n.js' });
vm.runInContext(popupSrc + '\n;globalThis.__pop = { setDisp: (c) => { disp = displayOpts(c); } };', popSandbox, { filename: 'popup.js' });
// HTML da linha de UM problema com estas opcoes de exibicao (config parcial; o resto no padrao)
function popRow(p, c) {
  try { popSandbox.__pop.setDisp(c || {}); popSandbox.renderList([p], false, 'none'); return popEl('list').innerHTML; }
  catch (e) { return 'ERRO: ' + e.message; }
}

// ---------- helpers de integracao ----------
function send(msg) { return new Promise(res => { const r = messageListener(msg, {}, res); if (r !== true) res(undefined); }); }
const setConfig = (cfg) => send({ action: 'setConfig', config: cfg });
const poll = async () => { resetCaptures(); await send({ action: 'pollNow' }); };
const status = () => BG.getState().status;
const knownKeys = () => [...BG.getState().known.keys()].sort();
const probByEvent = (instId, ev) => (status().problems || []).find(p => p.instId === instId && p.eventid === ev);
function P(ev, sev, x = {}) { return { eventid: String(ev), objectid: 't' + ev, name: x.name || ('p' + ev), severity: String(sev), clock: String(x.clock || 1700000000), acknowledged: x.acknowledged || '0', suppressed: x.suppressed || '0', suppression_data: x.suppression_data || [], acknowledges: x.acknowledges || [], opdata: x.opdata || '', tags: x.tags || [] }; }

(async () => {
  // =================================================================
  console.log('\n--- Funcoes puras ---');
  eq(BG.getConfig().volume, 0.25, 'volume padrao (DEFAULT_CONFIG) e 25%, antes de qualquer setConfig');
  eq(sandbox.normalizeUrl('https://z.example.com/'), 'https://z.example.com', 'normalizeUrl tira barra final');
  eq(sandbox.normalizeUrl('  https://z.example.com//  '), 'https://z.example.com', 'normalizeUrl trim + barras');
  eq(sandbox.normalizeUrl(''), '', 'normalizeUrl vazio');

  eq(sandbox.snzKey({ _instId: 'inst1', eventid: '42' }), 'inst1:42', 'snzKey monta instId:eventid');
  eq(sandbox.snzKey({ eventid: '42' }), ':42', 'snzKey sem instId vira :eventid');

  assert(sandbox.inMaintenance({ suppression_data: [{ maintenanceid: '5' }] }) === true, 'inMaintenance true com maintenanceid != 0');
  assert(sandbox.inMaintenance({ suppression_data: [{ maintenanceid: '0' }] }) === false, 'inMaintenance false com maintenanceid 0 (supressao manual)');
  assert(sandbox.inMaintenance({ suppression_data: [] }) === false, 'inMaintenance false sem suppression_data');

  eq(sandbox.soundForSeverity(5), 'klaxon', 'soundForSeverity(5) = klaxon (default)');
  eq(sandbox.soundForSeverity(4), 'siren', 'soundForSeverity(4) = siren (default)');

  // migrateConfig
  const mig = sandbox.migrateConfig({ zabbixUrl: 'https://old.example.com', apiToken: 'tok' });
  eq(mig.instances.length, 1, 'migrateConfig: cria 1 instancia do formato flat');
  eq([mig.instances[0].url, mig.instances[0].token], ['https://old.example.com', 'tok'], 'migrateConfig: migra url+token');
  assert(mig.zabbixUrl === undefined && mig.apiToken === undefined, 'migrateConfig: remove campos antigos');
  eq(sandbox.migrateConfig({ instances: [{ id: 'inst1' }] }).instances.length, 1, 'migrateConfig: idempotente se ja tem instances');
  eq(sandbox.migrateConfig({}).instances, [], 'migrateConfig: sem url vira lista vazia');
  eq(sandbox.migrateConfig({ instances: [{ id: 'a', token: 'tok' }, { id: 'b', token: '' }] }).instances.map(i => i.authType),
    ['token', 'session'], 'migrateConfig: authType derivado do token (preenchido=token, vazio=session)');
  eq(sandbox.migrateConfig({ instances: [{ id: 'a', authType: 'password', token: 'tok' }] }).instances[0].authType,
    'password', 'migrateConfig: authType explicito e preservado');

  // instAuthType
  eq(sandbox.instAuthType({ authType: 'password' }), 'password', 'instAuthType: usa o authType explicito');
  eq(sandbox.instAuthType({ token: 'tok' }), 'token', 'instAuthType: sem authType com token = token');
  eq(sandbox.instAuthType({ token: '  ' }), 'session', 'instAuthType: sem authType e token em branco = session');

  // enabledInstances
  const en = sandbox.enabledInstances({ instances: [
    { id: 'a', enabled: true, url: 'https://a' }, { id: 'b', enabled: false, url: 'https://b' },
    { id: 'c', enabled: true, url: '' }, { id: 'd', enabled: true, url: '  ' },
  ] });
  eq(en.map(i => i.id), ['a'], 'enabledInstances: so habilitada com url preenchida');

  // problemUrl (compartilhada com o popup)
  eq(sandbox.problemUrl('https://z.example.com', { objectid: '10', eventid: '99' }),
    'https://z.example.com/tr_events.php?triggerid=10&eventid=99', 'problemUrl: evento exato via tr_events.php');
  assert(sandbox.problemUrl('https://z.example.com', { hostid: '7' }).includes('hostids[]=7'), 'problemUrl: fallback por hostid');

  // inWorkPeriod (work_period do Zabbix; dias 1=seg..7=dom)
  const qua10 = new Date(2026, 6, 8, 10, 0);  // quarta 08/07/2026 10:00
  const sab10 = new Date(2026, 6, 11, 10, 0); // sabado
  const dom10 = new Date(2026, 6, 12, 10, 0); // domingo
  assert(sandbox.inWorkPeriod('1-5,09:00-18:00', qua10) === true, 'inWorkPeriod: quarta 10h dentro de 1-5,09:00-18:00');
  assert(sandbox.inWorkPeriod('1-5,09:00-18:00', new Date(2026, 6, 8, 18, 0)) === false, 'inWorkPeriod: 18:00 exato ja e fora (fim exclusivo)');
  assert(sandbox.inWorkPeriod('1-5,09:00-18:00', sab10) === false, 'inWorkPeriod: sabado fora de 1-5');
  assert(sandbox.inWorkPeriod('1-5,09:00-18:00;6-7,09:00-12:00', dom10) === true, 'inWorkPeriod: domingo casa no 2o segmento');
  assert(sandbox.inWorkPeriod('7,09:00-12:00', dom10) === true, 'inWorkPeriod: dia unico sem range');
  assert(sandbox.inWorkPeriod('', qua10) === true, 'inWorkPeriod: vazio = sempre dentro (fail-open)');
  assert(sandbox.inWorkPeriod('lixo-invalido', qua10) === true, 'inWorkPeriod: formato invalido = fail-open');
  assert(sandbox.inWorkPeriod('1-7,00:00-24:00', dom10) === true, 'inWorkPeriod: 00:00-24:00 cobre o dia todo');

  // alertGate / canAlert: precedencia de silencio num lugar so
  const G = (kind, ctx, cfgOver) => { const c = BG.getConfig(); const saved = { ...c }; Object.assign(c, { soundEnabled: true, notificationsEnabled: true, notifyResolved: true, nagNotify: true, meetSuppressSound: true, meetSuppressNotif: true }, cfgOver || {}); const g = sandbox.alertGate(kind, ctx); Object.keys(c).forEach(k => delete c[k]); Object.assign(c, saved); return [g.sound, g.notif]; };
  const C0 = { muted: false, offHours: false, inMeeting: false };
  eq(G('fresh', C0), [true, true], 'alertGate: sem nada ativo, novo toca e notifica');
  eq(G('fresh', { ...C0, muted: true }), [false, false], 'alertGate: mudo bloqueia tudo');
  eq(sandbox.alertGate('fresh', { ...C0, muted: true }).muted, true, 'alertGate: mudo marca muted=true (chamador pula ate o nag)');
  eq(G('fresh', { ...C0, offHours: true }), [false, false], 'alertGate: fora do horario bloqueia som e notificacao');
  eq(G('fresh', { ...C0, inMeeting: true }, { meetSuppressSound: true, meetSuppressNotif: false }), [false, true], 'alertGate: reuniao so com som suprimido');
  eq(G('fresh', { ...C0, inMeeting: true }, { meetSuppressSound: false, meetSuppressNotif: true }), [true, false], 'alertGate: reuniao so com notificacao suprimida');
  eq(G('fresh', C0, { soundEnabled: false }), [false, true], 'alertGate: opcao de som desligada');
  eq(G('resolved', C0), [false, true], 'alertGate: resolvido nunca toca som, so notifica');
  eq(G('resolved', C0, { notifyResolved: false }), [false, false], 'alertGate: resolvido respeita notifyResolved');
  eq(G('resolved', { ...C0, muted: true }), [false, false], 'alertGate: resolvido respeita o mudo');
  eq(G('nag', C0, { nagNotify: false }), [true, false], 'alertGate: nag sem nagNotify = so som');
  const maintP = { eventid: '1', _instId: 'x', acknowledged: '0', suppression_data: [{ maintenanceid: '3' }] };
  const ackP = { eventid: '2', _instId: 'x', acknowledged: '1', suppression_data: [] };
  ['fresh', 'woke', 'nag'].forEach(k => assert(sandbox.canAlert(maintP, k) === false, 'canAlert: manutencao nunca alerta (' + k + ')'));
  assert(sandbox.canAlert(ackP, 'fresh') === true, 'canAlert: ackado ainda alerta como novo');
  assert(sandbox.canAlert(ackP, 'woke') === false && sandbox.canAlert(ackP, 'nag') === false, 'canAlert: ackado nao re-alerta (fim de snooze, nag)');

  // resolveLang
  eq(sandbox.resolveLang('en'), 'en', 'resolveLang: idioma valido');
  assert(['pt', 'en', 'es'].includes(sandbox.resolveLang('xx')), 'resolveLang: idioma invalido cai num suportado');

  // =================================================================
  console.log('\n--- Integracao: poll multi-instancia ---');
  scenario.byBase = { 'https://z1': [P(10, 5)], 'https://z2': [P(20, 4)] };
  await setConfig({ instances: [
    { id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true },
    { id: 'inst2', label: 'HML', url: 'https://z2', token: 't2', enabled: true },
  ], minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false });
  eq(knownKeys(), ['inst1:10', 'inst2:20'], 'known usa chave composta instId:eventid');
  eq(captured.badge, '2', 'badge = total agregado (2)');
  assert((status().problems || []).some(p => p.instId === 'inst1' && p.instLabel === 'PRD'), 'status traz instId/instLabel');

  console.log('\n--- Integracao: baseline silencioso e alerta de novo ---');
  await poll();
  assert(captured.sounds.length === 0 && captured.notifs.length === 0, '1o poll sem novidade = silencio');
  scenario.byBase['https://z2'].push(P(21, 5, { name: 'novo' }));
  await poll();
  assert(captured.sounds.length === 1, 'problema novo toca som');
  assert(captured.notifs.length >= 1, 'problema novo gera notificacao');

  console.log('\n--- Integracao: eventid colidente entre instancias ---');
  scenario.byBase = { 'https://z1': [P(100, 5)], 'https://z2': [P(100, 5)] };
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, repeatAlarm: true, repeatInterval: 10, soundEnabled: true });
  await poll();
  eq(knownKeys(), ['inst1:100', 'inst2:100'], 'eventid igual em instancias diferentes nao colide');
  await send({ action: 'snoozeEvent', eventid: '100', instId: 'inst1', ms: 60000 });
  await poll();
  assert(probByEvent('inst1', '100').snoozedUntil > 0, 'snooze afeta inst1:100');
  assert(!probByEvent('inst2', '100').snoozedUntil, 'snooze NAO vaza pra inst2:100');

  console.log('\n--- Integracao: lista truncada nao pode contradizer a contagem por severidade (issue #26) ---');
  const manyProbs = [];
  for (let i = 0; i < 70; i++) manyProbs.push(P(1000 + i, 5));
  for (let i = 0; i < 42; i++) manyProbs.push(P(2000 + i, 3));
  for (let i = 0; i < 30; i++) manyProbs.push(P(3000 + i, 2));
  scenario.byBase = { 'https://z1': manyProbs, 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  await poll();
  const stMany = status();
  eq(stMany.bySev[3], 42, 'bySev conta os 42 avg mesmo com lista grande (142 no total)');
  eq(stMany.bySev[2], 30, 'bySev conta os 30 warn mesmo com lista grande');
  const avgInList = (stMany.problems || []).filter(p => Number(p.severity) === 3).length;
  const warnInList = (stMany.problems || []).filter(p => Number(p.severity) === 2).length;
  eq(avgInList, 42, 'lista enviada ao popup traz os 42 avg (nao pode sumir so por causa do corte por severidade)');
  eq(warnInList, 30, 'lista enviada ao popup traz os 30 warn (mesmo motivo)');

  console.log('\n--- Integracao: teto de gravacao no storage (achado do code-review) ---');
  const hugeProbs = [];
  for (let i = 0; i < 2100; i++) hugeProbs.push(P(9000 + i, 3));
  scenario.byBase = { 'https://z1': hugeProbs, 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  await poll();
  const stHuge = status();
  eq(stHuge.total, 2100, 'total continua exato mesmo passando do teto de gravacao (bySev/total nao sao afetados)');
  eq(stHuge.bySev[3], 2100, 'bySev tambem continua exato');
  assert((stHuge.problems || []).length <= 2000, 'a lista gravada no storage tem um teto (MAX_PROBLEMS_STORE), nao cresce sem limite');

  console.log('\n--- Integracao: problema de trigger desabilitado nao aparece (issue #25) ---');
  scenario.byBase = { 'https://z1': [P(400, 5), P(401, 4)], 'https://z2': [] };
  scenario.disabledTriggers = ['t401']; // trigger do problema 401 foi desabilitado
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  await poll();
  const stDisabled = status();
  eq((stDisabled.problems || []).map(p => p.eventid).sort(), ['400'], 'problema com trigger desabilitado nao entra na lista');
  eq(stDisabled.total, 1, 'total tambem exclui o problema de trigger desabilitado');
  scenario.disabledTriggers = [];

  console.log('\n--- Integracao: problema de host desabilitado nao aparece (issue #27) ---');
  scenario.byBase = { 'https://z1': [P(420, 5), P(421, 4)], 'https://z2': [] };
  scenario.disabledHosts = ['ht421']; // host do problema 421 foi desabilitado (t421 -> hostid ht421)
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  await poll();
  const stHostDisabled = status();
  eq((stHostDisabled.problems || []).map(p => p.eventid).sort(), ['420'], 'problema de host desabilitado nao entra na lista');
  eq(stHostDisabled.total, 1, 'total tambem exclui o problema de host desabilitado');
  scenario.disabledHosts = [];

  console.log('\n--- Integracao: falha do trigger.get vira estado degradado, nao silenciosa (hardening) ---');
  scenario.byBase = { 'https://z1': [P(410, 5)], 'https://z2': [] };
  scenario.triggerGetError = 'Internal error';
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  await poll();
  eq(BG.getState().instStatus.inst1.degraded, true, 'trigger.get falhando marca instStatus.degraded');
  assert((status().problems || []).some(p => p.eventid === '410' && !p.host), 'problema continua na lista, so sem host (fail-open, ja existente)');
  scenario.triggerGetError = null;
  await poll();
  eq(BG.getState().instStatus.inst1.degraded, false, 'trigger.get voltando a funcionar limpa o degraded');

  console.log('\n--- Integracao: trigger.get 200 mas incompleto tambem marca degraded (achado do code-review) ---');
  scenario.byBase = { 'https://z1': [P(415, 5)], 'https://z2': [] };
  scenario.hiddenTriggers = ['t415']; // trigger.get responde 200 mas sem esse trigger (permissao?)
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  await poll();
  eq(BG.getState().instStatus.inst1.degraded, true, 'trigger.get incompleto (sem excecao) tambem marca degraded');
  assert((status().problems || []).some(p => p.eventid === '415' && !p.host), 'problema continua na lista (fail-open), so sem host');
  scenario.hiddenTriggers = [];
  await poll();
  eq(BG.getState().instStatus.inst1.degraded, false, 'trigger.get completo de novo: degraded limpa');

  console.log('\n--- Integracao: teto de notificacoes por poll avisa "e mais N" (hardening) ---');
  scenario.byBase = { 'https://z1': [], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false });
  await poll(); // baseline vazio
  scenario.byBase['https://z1'] = Array.from({ length: 8 }, (_, i) => P(420 + i, 5, { name: 'p' + i }));
  await poll();
  eq(captured.notifs.length, 5, 'so MAX_NOTIFS_PER_POLL notificacoes de fato aparecem (anti-flood, ja existente)');
  const last = captured.notifs[captured.notifs.length - 1];
  assert(/mais 3|3 more|3 más/.test(last.contextMessage || ''), 'a ultima notificacao do lote avisa quantas ficaram de fora (3)');
  assert(!/mais|more|más/.test(captured.notifs[0].contextMessage || ''), 'as notificacoes anteriores do lote NAO tem o aviso (so a ultima)');

  console.log('\n--- Integracao: manutencao nao alarma ---');
  scenario.byBase = { 'https://z1': [P(200, 5, { suppression_data: [{ maintenanceid: '7' }] })], 'https://z2': [] };
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, ignoreMaintenance: false, soundEnabled: true, repeatAlarm: false });
  await poll();
  assert(probByEvent('inst1', '200').maintenance === true, 'problema em manutencao marca maintenance=true');
  scenario.byBase['https://z1'].push(P(201, 5, { suppression_data: [{ maintenanceid: '7' }] }));
  await poll();
  assert(captured.sounds.length === 0, 'novo problema em manutencao nao toca som');

  console.log('\n--- Integracao: modo reuniao (Google Meet) ---');
  scenario.byBase = { 'https://z1': [P(600, 5)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, suppressDuringMeeting: true, meetSuppressSound: true, meetSuppressNotif: false });
  await poll(); // baseline
  // em reuniao real: som silenciado, notificacao continua
  scenario.meetTabs = ['https://meet.google.com/kyd-fyte-jgt'];
  scenario.byBase['https://z1'].push(P(601, 5, { name: 'novo em call' }));
  await poll();
  assert(captured.sounds.length === 0, 'em reuniao com meetSuppressSound: nao toca som');
  assert(captured.notifs.length >= 1, 'em reuniao com meetSuppressSound: notificacao continua');
  // so a homepage do meet aberta (sem codigo) NAO conta como reuniao
  scenario.meetTabs = ['https://meet.google.com/'];
  scenario.byBase['https://z1'].push(P(602, 5, { name: 'sem call' }));
  await poll();
  assert(captured.sounds.length === 1, 'meet.google.com sem codigo nao suprime (toca som)');
  // meetSuppressNotif: silencia notificacao mas som toca
  scenario.meetTabs = ['https://meet.google.com/kyd-fyte-jgt'];
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, suppressDuringMeeting: true, meetSuppressSound: false, meetSuppressNotif: true });
  await poll(); // baseline apos setConfig (re-baseline)
  scenario.byBase['https://z1'].push(P(603, 5, { name: 'notif off' }));
  await poll();
  assert(captured.sounds.length === 1, 'em reuniao com meetSuppressNotif: som toca');
  assert(captured.notifs.length === 0, 'em reuniao com meetSuppressNotif: notificacao silenciada');
  // suppressDuringMeeting off: nada e suprimido mesmo em reuniao
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, suppressDuringMeeting: false, meetSuppressSound: true, meetSuppressNotif: true });
  await poll();
  scenario.byBase['https://z1'].push(P(604, 5, { name: 'toggle off' }));
  await poll();
  assert(captured.sounds.length === 1 && captured.notifs.length >= 1, 'suppressDuringMeeting off: som e notificacao normais');
  scenario.meetTabs = [];

  console.log('\n--- Integracao: working time (horario de trabalho) ---');
  // fora do horario: work_period que nunca casa -> som e notificacao silenciados, badge segue
  scenario.byBase = { 'https://z1': [P(800, 5)] };
  scenario.workPeriod = '1-7,00:00-00:00';
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, soundEnabled: true, notificationsEnabled: true, notifyResolved: true, repeatAlarm: false, suppressDuringMeeting: false, workingTimeOnly: true });
  await poll(); // baseline
  scenario.byBase['https://z1'].push(P(801, 5, { name: 'fora do horario' }));
  await poll();
  assert(captured.sounds.length === 0, 'fora do working time: nao toca som');
  assert(captured.notifs.length === 0, 'fora do working time: nao notifica');
  eq(captured.badge, '2', 'fora do working time: badge continua atualizando');
  // dentro do horario: alerta normal
  scenario.workPeriod = '1-7,00:00-24:00';
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, workingTimeOnly: true }); // limpa cache + re-baseline
  scenario.byBase['https://z1'].push(P(802, 5, { name: 'dentro do horario' }));
  await poll();
  assert(captured.sounds.length === 1 && captured.notifs.length >= 1, 'dentro do working time: som e notificacao normais');
  assert(!status().workingTimeError, 'settings.get funcionando: sem aviso de working time quebrado (hardening)');
  // settings.get sem permissao: fail-open (alerta normalmente), mas AVISA que a opcao parou de filtrar
  scenario.workPeriod = null;
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, workingTimeOnly: true });
  scenario.byBase['https://z1'].push(P(803, 5, { name: 'sem permissao' }));
  await poll();
  assert(captured.sounds.length === 1 && captured.notifs.length >= 1, 'settings.get sem permissao: fail-open (alerta normal)');
  assert(!!status().workingTimeError, 'settings.get sem permissao: status avisa que o working time parou de funcionar (hardening)');
  // opcao desligada: nem consulta o work_period
  scenario.workPeriod = '1-7,00:00-00:00';
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, workingTimeOnly: false });
  scenario.byBase['https://z1'].push(P(804, 5, { name: 'opcao off' }));
  await poll();
  assert(captured.sounds.length === 1 && captured.notifs.length >= 1, 'workingTimeOnly off: alerta normal mesmo fora do horario');
  // getWorkPeriod (validacao usada pela pagina de opcoes pra habilitar/desabilitar o checkbox)
  scenario.workPeriod = '1-5,09:00-18:00';
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, repeatAlarm: false }); // limpa o cache
  const wp = await send({ action: 'getWorkPeriod' });
  eq([wp.ok, wp.list.map(i => i.period)], [true, ['1-5,09:00-18:00']], 'getWorkPeriod: retorna o periodo lido do servidor');
  // varias instancias: lista o periodo de cada uma
  await setConfig({ instances: [
    { id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true },
    { id: 'inst2', label: 'HML', url: 'https://z2', token: 't2', enabled: true },
  ], minSeverity: 0, repeatAlarm: false });
  const wpm = await send({ action: 'getWorkPeriod' });
  eq(wpm.list.map(i => i.label), ['PRD', 'HML'], 'getWorkPeriod: multi-instancia lista todas as legiveis');
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  scenario.workPeriod = null; // settings.get sem permissao
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, repeatAlarm: false });
  const wp2 = await send({ action: 'getWorkPeriod' });
  eq(wp2.ok, false, 'getWorkPeriod: leitura impossivel retorna ok=false (opcoes desativam o checkbox)');
  scenario.workPeriod = '';

  console.log('\n--- Integracao: resolvido e instancia desabilitada ---');
  scenario.byBase = { 'https://z1': [P(300, 5)], 'https://z2': [] };
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, notifyResolved: true, notificationsEnabled: true, ignoreMaintenance: true, repeatAlarm: false });
  await poll();
  scenario.byBase['https://z1'] = [];
  await poll();
  assert(captured.notifs.some(n => /resolv|recuper|resolved/i.test(n.title + ' ' + n.message)), 'problema que some gera notificacao de resolvido');

  console.log('\n--- Integracao: problema so ESCONDIDO (ainda aberto no Zabbix) nao vira "resolvido" ---');
  // host desabilitado (#27), trigger desabilitado (#25), ack com ignoreAckd, manutencao com
  // ignoreMaintenance: o problem.get continua devolvendo o problema, a extensao so deixa de mostrar.
  const isResolvedNotif = (n) => /resolv|recuper|resolved/i.test(n.title + ' ' + n.message);
  scenario.byBase = { 'https://zHid': [P(310, 5), P(311, 4), P(312, 4), P(313, 4), P(314, 3)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'instHid', label: 'PRD', url: 'https://zHid', token: 't1', enabled: true }], minSeverity: 0, notifyResolved: true, notificationsEnabled: true, repeatAlarm: false, muted: false, suppressDuringMeeting: false, ignoreAckd: true, ignoreMaintenance: true });
  await poll(); // baseline: os 5 visiveis
  scenario.disabledHosts = ['ht311'];          // host do 311 desabilitado
  scenario.disabledTriggers = ['t312'];        // trigger do 312 desabilitado
  scenario.byBase['https://zHid'][3] = P(313, 4, { acknowledged: '1' });                        // 313 ackado (ignoreAckd)
  scenario.byBase['https://zHid'][4] = P(314, 3, { suppressed: '1', suppression_data: [{ maintenanceid: '7' }] }); // 314 entrou em manutencao
  await poll();
  eq((status().problems || []).map(p => p.eventid).sort(), ['310'], 'os 4 escondidos somem da lista (comportamento mantido)');
  eq(captured.notifs.filter(isResolvedNotif).length, 0, 'nenhum toast de "resolvido" pra problema que continua aberto no Zabbix');
  scenario.disabledHosts = []; scenario.disabledTriggers = [];
  // e o resolvido de verdade continua notificando
  scenario.byBase['https://zHid'] = [];
  await poll();
  assert(captured.notifs.some(isResolvedNotif), 'problema que sai do problem.get (resolvido de verdade) continua gerando o toast');

  console.log('\n--- Integracao: opdata do problema chega no popup ---');
  scenario.byBase = { 'https://zOp': [P(330, 4, { opdata: 'CPU 97%' }), P(331, 3)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'instOp', label: 'PRD', url: 'https://zOp', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  await poll();
  assert((scenario.lastProblemGet['https://zOp'].output || []).includes('opdata'), 'problem.get pede o campo opdata');
  eq(probByEvent('instOp', '330').opdata, 'CPU 97%', 'opdata vai junto no status do problema');
  eq(probByEvent('instOp', '331').opdata, '', 'sem opdata = string vazia (popup nao mostra nada)');
  scenario.byBase['https://zOp'].push(P(332, 5, { name: 'Disk full', opdata: 'free 2%' }), P(333, 5, { name: 'Sem valor' }));
  await poll();
  assert(captured.notifs.some(n => n.message === 'Disk full - free 2%'), 'notificacao de problema novo mostra o opdata junto do nome');
  assert(captured.notifs.some(n => n.message === 'Sem valor'), 'sem opdata a notificacao fica so com o nome');

  console.log('\n--- Integracao: ACK e adiar direto pelos botoes da notificacao ---');
  const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
  scenario.byBase = { 'https://zBtn': [P(340, 4)], 'https://zBtn2': [] };
  await setConfig({ instances: [
    { id: 'instB1', label: 'PRD', url: 'https://zBtn', token: 't1', enabled: true },
    { id: 'instB2', label: 'HML', url: 'https://zBtn2', token: 't2', enabled: true },
  ], minSeverity: 0, repeatAlarm: false, muted: false, notificationsEnabled: true, soundEnabled: true });
  await poll();
  scenario.byBase['https://zBtn2'].push(P(341, 5, { name: 'vai levar ack' }), P(342, 4, { name: 'vai ser adiado' }));
  await poll();
  const nAck = captured.notifs.find(n => n.message === 'vai levar ack');
  const nSnz = captured.notifs.find(n => n.message === 'vai ser adiado');
  assert(nAck && Array.isArray(nAck.buttons) && nAck.buttons.length === 2, 'notificacao de problema novo tem 2 botoes (ACK, adiar)');
  assert(typeof notifButtonListener === 'function', 'background registra onButtonClicked');
  scenario.ackCalls = [];
  notifButtonListener(nAck.id, 0); await tick(80);
  eq(scenario.ackCalls.map(c => [c.base, c.params.eventids]), [['https://zBtn2', ['341']]], 'botao 0 = ACK do evento certo, na instancia certa');
  assert(scenario.ackCalls[0] && scenario.ackCalls[0].params.action === 6 && !!scenario.ackCalls[0].params.message, 'ACK pela notificacao manda ack + mensagem padrao');
  assert(captured.cleared.includes(nAck.id), 'ACK ok fecha a notificacao');
  notifButtonListener(nSnz.id, 1); await tick(80);
  const snzUntil = BG.getState().snoozes['instB2:342'] || 0;
  assert(Math.abs(snzUntil - (Date.now() + 15 * 60000)) < 5000, 'botao 1 = adia o problema por 15 min (chave instId:eventid)');
  assert(captured.cleared.includes(nSnz.id), 'adiar fecha a notificacao');
  // ACK que falha avisa, em vez de sumir calado
  scenario.byBase['https://zBtn2'].push(P(343, 5, { name: 'ack vai falhar' }));
  await poll();
  const nFail = captured.notifs.find(n => n.message === 'ack vai falhar');
  scenario.ackError = 'No permissions to referred object or it does not exist!';
  resetCaptures();
  notifButtonListener(nFail.id, 0); await tick(80);
  assert(captured.notifs.some(n => /No permissions/.test(n.message || '')), 'ACK que falha mostra o erro do Zabbix numa notificacao');
  scenario.ackError = null;
  // clique no corpo continua abrindo o evento
  openedTabs = [];
  notifClickListener(nFail.id); await tick(30);
  assert(openedTabs.some(o => /eventid=343/.test(o.url)), 'clique no corpo da notificacao continua abrindo o evento');

  console.log('\n--- Tags: filtro por instancia (servidor) + tags no status ---');
  eq(sandbox.parseTagFilter(''), [], 'parseTagFilter: vazio = sem filtro');
  eq(sandbox.parseTagFilter('service:web, env=prod\nteam'), [
    { tag: 'service', value: 'web', operator: 0 }, { tag: 'env', value: 'prod', operator: 1 }, { tag: 'team', value: '', operator: 4 },
  ], 'parseTagFilter: tag:valor = contem (0), tag=valor = igual (1), so tag = existe (4)');
  eq(sandbox.parseTagFilter(' url : http://x:8080 '), [{ tag: 'url', value: 'http://x:8080', operator: 0 }], 'parseTagFilter: so o 1o ":" separa (valor pode ter ":")');
  eq(sandbox.parseTagFilter(', ,:x,=y'), [], 'parseTagFilter: entradas sem nome de tag sao ignoradas');
  scenario.byBase = { 'https://zTag': [P(360, 4, { tags: [{ tag: 'service', value: 'web' }, { tag: 'team', value: 'noc' }] }), P(361, 3)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'instTag', label: 'PRD', url: 'https://zTag', token: 't1', enabled: true, tags: 'service:web, env=prod' }], minSeverity: 0, repeatAlarm: false, muted: false });
  await poll();
  const tagGet = scenario.lastProblemGet['https://zTag'];
  eq(tagGet.tags, [{ tag: 'service', value: 'web', operator: 0 }, { tag: 'env', value: 'prod', operator: 1 }], 'problem.get recebe o filtro de tags da instancia (corta no servidor)');
  eq(tagGet.evaltype, 0, 'evaltype 0 (E/Ou: mesma tag = OU, tags diferentes = E), igual ao padrao do Zabbix');
  assert(Array.isArray(tagGet.selectTags) && tagGet.selectTags.includes('tag') && tagGet.selectTags.includes('value'), 'problem.get pede as tags de cada problema (selectTags)');
  eq(probByEvent('instTag', '360').tags, [{ tag: 'service', value: 'web' }, { tag: 'team', value: 'noc' }], 'tags vao no status do problema (popup mostra os chips)');
  eq(probByEvent('instTag', '361').tags, [], 'problema sem tag = lista vazia');
  await setConfig({ instances: [{ id: 'instTag', label: 'PRD', url: 'https://zTag', token: 't1', enabled: true, tags: '' }] });
  await poll();
  assert(scenario.lastProblemGet['https://zTag'].tags === undefined, 'sem filtro de tags: nao manda o parametro tags');
  // mudar o filtro de tags muda o conjunto visivel -> re-baseline (problema recem-visivel nao alerta como novo)
  scenario.byBase['https://zTag'].push(P(362, 5, { name: 'ja existia, so ficou visivel' }));
  resetCaptures();
  await setConfig({ instances: [{ id: 'instTag', label: 'PRD', url: 'https://zTag', token: 't1', enabled: true, tags: 'team' }] }); // o poll do proprio setConfig e o que alertaria
  assert(!captured.sounds.length && !captured.notifs.length, 'trocar o filtro de tags re-baseia: problema que so ficou visivel nao alerta');

  console.log('\n--- Zabbix 7.2+/8.0: sem "auth" no corpo, erro de credencial limpo ---');
  scenario.rejectBodyAuth = true; scenario.badToken = 'tok-ruim'; scenario.bodyAuthCalls = 0;
  scenario.byBase = { 'https://z80': [P(370, 4)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst80', label: 'Z80', url: 'https://z80', authType: 'token', token: 'tok-ruim', enabled: true }], minSeverity: 0, repeatAlarm: false, blindSpotAlert: false });
  const err80 = BG.getState().instStatus.inst80 || {};
  eq([err80.state, err80.error], ['error', 'Session terminated, re-login, please.'], 'erro mostrado e o da credencial, sem o "unexpected parameter auth" do corpo misturado');
  const bodyAfterFirst = scenario.bodyAuthCalls;
  BG.getState().instBackoff = {}; await poll();
  eq(scenario.bodyAuthCalls, bodyAfterFirst, 'servidor sem auth no corpo e lembrado: nao tenta o corpo de novo a cada poll');
  // token bom no mesmo servidor: header funciona normal
  await setConfig({ instances: [{ id: 'inst80', label: 'Z80', url: 'https://z80', authType: 'token', token: 'tok-bom', enabled: true }] });
  eq((BG.getState().instStatus.inst80 || {}).state, 'ok', 'token valido no 8.0 (so header) funciona');
  scenario.rejectBodyAuth = false; scenario.badToken = null;
  // e o 6.x (sem Bearer) continua caindo pro corpo: outro servidor, outra instancia
  await setConfig({ instances: [{ id: 'inst60', label: 'Z60', url: 'https://z60', authType: 'token', token: 'tok60', enabled: true }], blindSpotAlert: true });
  eq((BG.getState().instStatus.inst60 || {}).state, 'ok', 'outra instancia (6.x) nao herda o "sem corpo" da instancia 8.0');
  // MESMA instancia trocando de um 8.0 pra um 6.x: o "so header" aprendido nao pode grudar
  // (o "so header" so e aprendido quando o header falha e o corpo e rejeitado: token ruim num 8.0)
  scenario.rejectBodyAuth = true; scenario.badToken = 'tokA';
  await setConfig({ instances: [{ id: 'instMv', label: 'MV', url: 'https://z80b', authType: 'token', token: 'tokA', enabled: true }] });
  eq(BG.getState().authModes.instMv, 'header-only', 'token ruim num 8.0: aprende que o servidor e so header');
  scenario.rejectBodyAuth = false; scenario.badToken = null; scenario.rejectHeaderAuth = true; // agora o servidor e um 6.x: so corpo
  await setConfig({ instances: [{ id: 'instMv', label: 'MV', url: 'https://z60b', authType: 'token', token: 'tokA', enabled: true }] });
  eq((BG.getState().instStatus.instMv || {}).state, 'ok', 'trocar a URL da instancia (8.0 -> 6.x) re-descobre o modo de auth');
  scenario.rejectHeaderAuth = false; scenario.rejectBodyAuth = true; scenario.badToken = 'tokX';
  await send({ action: 'testConnection', zabbixUrl: 'https://z80c', authType: 'token', apiToken: 'tokX' }); // Testar num 8.0 com token ruim
  scenario.rejectBodyAuth = false; scenario.badToken = null; scenario.rejectHeaderAuth = true;
  const t60 = await send({ action: 'testConnection', zabbixUrl: 'https://z60c', authType: 'token', apiToken: 'tokB' });
  eq(t60 && t60.ok, true, 'botao Testar num 6.x depois de um teste num 8.0 tambem re-descobre (instId "test" compartilhado)');
  scenario.rejectHeaderAuth = false;

  console.log('\n--- Integracao: ponto cego (instancia que a extensao parou de enxergar) ---');
  const blindNotifs = () => captured.notifs.filter(n => /^zbx-blind-/.test(n.id));
  const ageDown = (id, min) => { BG.getState().downSince[id] = Date.now() - min * 60000; };
  scenario.byBase = { 'https://zBlind': [P(350, 4)], 'https://z2': [] };
  scenario.problemGetError = null;
  await setConfig({ instances: [{ id: 'instBl', label: 'PRD', url: 'https://zBlind', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false, muted: false, mutedUntil: 0, blindSpotAlert: true, blindSpotMinutes: 2, notificationsEnabled: true, soundEnabled: true, workingTimeOnly: false, suppressDuringMeeting: false });
  await poll();
  eq([BG.getDefaults().blindSpotAlert, BG.getDefaults().blindSpotMinutes], [true, 2], 'ponto cego vem ligado por padrao, 2 min (DEFAULT_CONFIG)');
  scenario.problemGetError = 'Connection refused';
  await poll();
  eq(blindNotifs().length, 0, 'falha recem-comecada (< N min) ainda nao alerta (evita falso alarme num soluco)');
  ageDown('instBl', 3);
  BG.getState().instBackoff = {}; // forca tentar de novo (senao o backoff pula o poll, e tudo bem: continua "cego")
  await poll();
  const bn = blindNotifs();
  eq(bn.length, 1, 'cego ha mais de N min: UMA notificacao de ponto cego');
  assert(bn[0] && /PRD/.test(bn[0].title) && /Connection refused/.test(bn[0].message), 'notificacao diz qual instancia e o motivo');
  assert(captured.sounds.some(s => s.preset === 'flatline'), 'ponto cego toca um som proprio (flatline), diferente de alerta de problema');
  await poll();
  eq(blindNotifs().length, 0, 'continua cego: nao repete a notificacao a cada poll');
  scenario.problemGetError = null;
  BG.getState().instBackoff = {};
  await poll();
  assert(captured.notifs.some(n => /^zbx-blindok-/.test(n.id)), 'instancia voltou: avisa que voltou a enxergar');
  assert(captured.cleared.includes('zbx-blind-instBl'), 'e fecha a notificacao de ponto cego');
  // sessao caida (modo sessao sem cookie) tambem e ponto cego
  scenario.cookie = null;
  await setConfig({ instances: [{ id: 'instBl', label: 'PRD', url: 'https://zBlind', authType: 'session', enabled: true }] });
  await poll(); ageDown('instBl', 5); await poll();
  assert(blindNotifs().some(n => /PRD/.test(n.title)), 'sessao caida por mais de N min = ponto cego');
  // mudo segura o aviso; ao desmutar ele sai (uma vez)
  await setConfig({ instances: [{ id: 'instBl', label: 'PRD', url: 'https://zBlindMute', authType: 'session', enabled: true }], muted: true });
  await poll(); ageDown('instBl', 5); await poll();
  eq(blindNotifs().length, 0, 'mudo: ponto cego nao alerta');
  await send({ action: 'setMuted', muted: false });
  await poll();
  eq(blindNotifs().length, 1, 'desmutou e continua cego: o aviso que estava segurado sai agora');
  await setConfig({ volume: 0.3 });
  ageDown('instBl', 10); await poll();
  eq(blindNotifs().length, 0, 'salvar opcao sem relacao (volume) com a instancia ainda cega nao repete o aviso');
  // varias instancias cegas no mesmo poll: um aviso por instancia, mas UM som so
  await setConfig({ instances: [
    { id: 'instBA', label: 'A', url: 'https://zBlA', authType: 'session', enabled: true },
    { id: 'instBB', label: 'B', url: 'https://zBlB', authType: 'session', enabled: true },
    { id: 'instBC', label: 'C', url: 'https://zBlC', authType: 'session', enabled: true },
  ], blindSpotAlert: true, muted: false });
  await poll(); ['instBA', 'instBB', 'instBC'].forEach(id => ageDown(id, 5)); await poll();
  eq(blindNotifs().length, 3, '3 instancias cegas: 3 notificacoes (uma por instancia)');
  eq(captured.sounds.filter(s => s.preset === 'flatline').length, 1, '...mas um som so no poll, nao 3 flatlines empilhados');
  // desligado nas opcoes = nunca
  await setConfig({ instances: [{ id: 'instBl', label: 'PRD', url: 'https://zBlindOff', authType: 'session', enabled: true }], blindSpotAlert: false });
  await poll(); ageDown('instBl', 30); await poll();
  eq(blindNotifs().length, 0, 'blindSpotAlert desligado: nunca alerta');
  await setConfig({ blindSpotAlert: true });

  console.log('\n--- Integracao: mudo com tempo desliga sozinho e avisa ---');
  scenario.byBase = { 'https://zMute': [P(320, 5)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'instMute', label: 'PRD', url: 'https://zMute', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false, muted: false, mutedUntil: 0, suppressDuringMeeting: false, workingTimeOnly: false, notificationsEnabled: true, soundEnabled: true });
  await poll(); // baseline
  const m1 = await send({ action: 'setMuted', muted: true, minutes: 15 });
  assert(m1.muted === true && Math.abs(m1.mutedUntil - (Date.now() + 15 * 60000)) < 5000, 'setMuted com minutes: mudo ate agora+15min');
  scenario.byBase['https://zMute'].push(P(321, 5, { name: 'chegou mutado' }));
  await poll();
  assert(!captured.sounds.length && !captured.notifs.length, 'durante o mudo com tempo: problema novo nao alerta');
  eq((await send({ action: 'getStatus' })).mutedUntil, m1.mutedUntil, 'getStatus devolve mutedUntil pro popup mostrar a contagem');
  BG.getConfig().mutedUntil = Date.now() - 1000; // o tempo do mudo passou
  scenario.byBase['https://zMute'].push(P(322, 5, { name: 'chegou depois do mudo' }));
  await poll();
  assert(BG.getConfig().muted === false && BG.getConfig().mutedUntil === 0, 'mudo vencido desliga sozinho no poll');
  assert(captured.notifs.some(n => n.id === 'zbx-unmuted'), 'avisa com uma notificacao que os alertas voltaram');
  assert(captured.sounds.length === 1 && captured.notifs.some(n => /chegou depois do mudo/.test(n.message)), 'problema novo apos o fim do mudo alerta normalmente');
  // re-alarme DESLIGADO: o que chegou durante o mudo com tempo e continua aberto tem que alertar
  // quando o mudo acaba (como o fim de um snooze), senao some calado
  scenario.byBase = { 'https://zMute2': [P(325, 5, { name: 'ja existia antes do mudo' })], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'instMute2', label: 'PRD', url: 'https://zMute2', token: 't1', enabled: true }], repeatAlarm: false, muted: false, mutedUntil: 0 });
  await poll();
  await send({ action: 'setMuted', muted: true, minutes: 60 });
  scenario.byBase['https://zMute2'].push(P(326, 5, { name: 'chegou durante o mudo' }), P(327, 4, { name: 'chegou e levou ack', acknowledged: '1' }));
  await poll();
  assert(!captured.sounds.length && !captured.notifs.length, '(pre) durante o mudo nada alerta');
  BG.getConfig().mutedUntil = Date.now() - 1000;
  await poll();
  const wokeMsgs = captured.notifs.filter(n => !/^zbx-unmuted$/.test(n.id)).map(n => n.message);
  eq(wokeMsgs, ['chegou durante o mudo'], 'fim do mudo com tempo: alerta o que chegou durante ele e continua aberto sem ack (so isso)');
  assert(captured.sounds.length === 1, 'com som (um so)');
  await poll();
  assert(!captured.sounds.length && !captured.notifs.length, 'e nao repete no poll seguinte');

  // fim de snooze + problema novo no MESMO poll: um som so, e ganha a maior severidade
  scenario.byBase = { 'https://zOv': [P(328, 5, { name: 'desastre adiado' })], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'instOv', label: 'PRD', url: 'https://zOv', token: 't1', enabled: true }], repeatAlarm: false, muted: false, mutedUntil: 0 });
  await poll();
  BG.getState().snoozes['instOv:328'] = Date.now() - 1; // o snooze do desastre acabou agora
  scenario.byBase['https://zOv'].push(P(329, 2, { name: 'warning novo' }));
  await poll();
  eq(captured.sounds.map(s => s.preset), ['klaxon'], 'fim de snooze (desastre) + novo (warning) no mesmo poll: UM som, o do desastre');
  assert(captured.notifs.some(n => n.message === 'desastre adiado') && captured.notifs.some(n => n.message === 'warning novo'), 'as duas notificacoes saem normalmente');

  const m2 = await send({ action: 'setMuted', muted: true });
  eq([m2.muted, m2.mutedUntil], [true, 0], 'setMuted sem tempo: mudo ate reativar (mutedUntil 0)');
  await poll();
  assert(BG.getConfig().muted === true, 'mudo sem tempo continua ligado apos o poll');
  const m3 = await send({ action: 'setMuted', muted: false });
  eq([m3.muted, m3.mutedUntil], [false, 0], 'desmutar zera o mutedUntil');
  // fim do turno: segmento atual do work_period
  const wpe = sandbox.workPeriodEnd('1-5,09:00-18:00', new Date(2026, 6, 8, 10, 30));
  eq(wpe && [wpe.getHours(), wpe.getMinutes(), wpe.getDate()], [18, 0, 8], 'workPeriodEnd: quarta 10:30 em 1-5,09:00-18:00 termina 18:00 do mesmo dia');
  eq(sandbox.workPeriodEnd('1-5,09:00-18:00', new Date(2026, 6, 11, 10, 0)), null, 'workPeriodEnd: fora do periodo (sabado) = null');
  const wpe24 = sandbox.workPeriodEnd('1-7,00:00-24:00', new Date(2026, 6, 8, 23, 0));
  eq(wpe24 && [wpe24.getDate(), wpe24.getHours()], [9, 0], 'workPeriodEnd: 24:00 vira meia-noite do dia seguinte');
  eq(sandbox.workPeriodEnd('', new Date()), null, 'workPeriodEnd: sem periodo = null (sem turno pra acabar)');
  const wpeU = sandbox.workPeriodEnd('1-5,08:00-12:00;1-5,09:00-20:00', new Date(2026, 6, 8, 10, 0));
  eq(wpeU && wpeU.getHours(), 20, 'workPeriodEnd: segmentos sobrepostos = o fim mais tarde');

  console.log('\n--- Integracao: importar settings nao apaga token/senha locais ---');
  // o arquivo exportado leva token:'' e password:'' de proposito; importar ele de volta (mesmo
  // navegador, backup) nao pode zerar as credenciais, senao toda instancia token/senha vira erro.
  await setConfig({ instances: [
    { id: 'inst1', label: 'PRD', url: 'https://zImp1', authType: 'token', token: 'tokA', enabled: true },
    { id: 'inst2', label: 'HML', url: 'https://zImp2/', authType: 'password', username: 'noc', password: 'pwB', enabled: true },
    { id: 'inst3', label: 'LAB', url: 'https://zImp3', authType: 'token', token: 'tokC', enabled: true },
    { id: 'inst4', label: 'DEV', url: 'https://zImp4', authType: 'password', username: 'old', password: 'pwD', enabled: true },
  ], minSeverity: 0, repeatAlarm: false });
  await send({ action: 'importConfig', config: { minSeverity: 3, apiToken: 'legado', instances: [
    { id: 'inst1', label: 'PRD-imp', url: 'https://zImp1', authType: 'token', token: '', enabled: true },
    { id: 'inst2', label: 'HML-imp', url: 'https://zImp2', authType: 'password', username: 'noc', password: '', enabled: true },
    { id: 'inst3', label: 'LAB-imp', url: 'https://outro-servidor', authType: 'token', token: '', enabled: true },
    { id: 'inst4', label: 'DEV-imp', url: 'https://zImp4', authType: 'password', username: 'novo', password: '', enabled: true },
  ] } });
  const impInst = BG.getConfig().instances;
  eq(impInst.map(i => i.label), ['PRD-imp', 'HML-imp', 'LAB-imp', 'DEV-imp'], 'import aplica as instancias do arquivo');
  eq(BG.getConfig().minSeverity, 3, 'import aplica as opcoes globais do arquivo');
  eq(impInst[0].token, 'tokA', 'mesma URL: token local preservado (arquivo vem sem token)');
  eq(impInst[1].password, 'pwB', 'mesma URL (barra final ignorada) e mesmo usuario: senha local preservada');
  eq(impInst[2].token, '', 'URL diferente: token local NAO vai pra outro servidor');
  eq(impInst[3].password, '', 'usuario diferente: senha local NAO e reaproveitada');
  assert(BG.getConfig().apiToken === undefined, 'apiToken legado do arquivo e ignorado');

  console.log('\n--- Integracao: resolvido respeita mute e modo reuniao (hardening) ---');
  scenario.byBase = { 'https://z1': [P(301, 5)], 'https://z2': [] };
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, notifyResolved: true, notificationsEnabled: true, repeatAlarm: false, muted: true });
  await poll();
  scenario.byBase['https://z1'] = [];
  await poll();
  assert(!captured.notifs.some(n => /resolv|recuper|resolved/i.test(n.title + ' ' + n.message)), 'mutado: problema resolvido NAO notifica');

  scenario.byBase = { 'https://z1': [P(302, 5)], 'https://z2': [] };
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, notifyResolved: true, notificationsEnabled: true, repeatAlarm: false, muted: false, suppressDuringMeeting: true, meetSuppressNotif: true, meetSuppressSound: false });
  scenario.meetTabs = ['https://meet.google.com/aaa-bbbb-ccc'];
  await poll();
  scenario.byBase['https://z1'] = [];
  await poll();
  assert(!captured.notifs.some(n => /resolv|recuper|resolved/i.test(n.title + ' ' + n.message)), 'em reuniao (meetSuppressNotif): problema resolvido NAO notifica');
  scenario.meetTabs = [];

  console.log('\n--- Integracao: backoff exponencial apos falha de rede/API (hardening) ---');
  // apiCall tenta 2 modos de auth (header/body) quando falha, entao 1 erro "logico" pode custar
  // 2 fetches; por isso comparamos POR DELTA (bateu a rede ou nao), nao um numero fixo por poll.
  const calls = () => scenario.problemGetCalls['https://z1'] || 0;
  scenario.byBase = { 'https://z1': [P(600, 5)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false });
  scenario.problemGetCalls = {}; // zera DEPOIS do setConfig (ele mesmo ja dispara um poll interno)
  await poll();
  const afterBaseline = calls();
  assert(afterBaseline > 0, 'poll baseline bate a rede normalmente');

  scenario.problemGetError = 'Internal server error';
  await poll();
  const afterFirstFail = calls();
  assert(afterFirstFail > afterBaseline, '1a falha bate a rede (ainda sem backoff)');
  eq(BG.getState().instStatus.inst1.state, 'error', '1a falha vira instStatus error');
  const firstNextAt = BG.getState().instBackoff.inst1.nextAt;
  assert(firstNextAt > Date.now(), 'backoff arma um proximo horario no futuro apos a 1a falha');

  await poll();
  eq(calls(), afterFirstFail, 'poll seguinte, ainda dentro do backoff, NAO bate a rede de novo');
  eq(BG.getState().instStatus.inst1.state, 'error', 'instStatus continua error (reaproveitado) durante o backoff');
  eq((status().problems || []).map(p => p.eventid), ['600'], 'lista continua mostrando o ultimo conhecido durante o backoff (nao fica vazia)');
  assert(!captured.notifs.length, 'poll pulado pelo backoff nao gera notificacao nenhuma (nem falso resolvido)');

  BG.getState().instBackoff.inst1.nextAt = Date.now() - 1000; // forca o backoff a vencer
  await poll();
  const afterSecondFail = calls();
  assert(afterSecondFail > afterFirstFail, 'backoff vencido: volta a bater a rede');
  const secondDelay = BG.getState().instBackoff.inst1.nextAt - Date.now();
  const firstDelay = firstNextAt - Date.now(); // aproximado, so pra comparar ordem de grandeza
  assert(secondDelay > firstDelay * 1.5, '2a falha seguida aumenta o backoff (exponencial)');

  scenario.problemGetError = null; // "conserta" a instancia
  BG.getState().instBackoff.inst1.nextAt = Date.now() - 1000;
  await poll();
  assert(calls() > afterSecondFail, 'backoff vencido de novo: bate a rede e desta vez funciona');
  eq(BG.getState().instStatus.inst1.state, 'ok', 'sucesso volta o instStatus pra ok');
  assert(BG.getState().instBackoff.inst1 === undefined, 'sucesso reseta o backoff (zera fails/nextAt)');

  console.log('\n--- Integracao: setConfig so re-baseia quando o filtro muda (hardening) ---');
  scenario.byBase = { 'https://z1': [P(800, 5)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false });
  await poll(); // baseline
  scenario.byBase['https://z1'].push(P(801, 5, { name: 'chegou bem na hora do save' }));
  // salva uma opcao QUE NAO MUDA quais problemas ficam visiveis (so o volume) -> nao pode
  // "engolir" o 801 que apareceu nessa janela. setConfig ja dispara um poll interno, entao o
  // efeito (se houver) aparece nessa chamada mesmo, nao precisa de um poll() extra depois.
  resetCaptures();
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, volume: 42 });
  assert(captured.sounds.length === 1 || captured.notifs.length >= 1, 'opcao sem relacao com o filtro nao re-baseia: 801 ainda alerta como novo');

  scenario.byBase = { 'https://z1': [P(900, 5), P(901, 5, { name: 'barulhento' })], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, excludePatterns: 'barulhento' });
  await poll(); // baseline: 901 fica de fora pelo exclude, so 900 e "conhecido"
  // remove o exclude -> 901 fica visivel; ISSO E mudanca de filtro, entao tem que re-baselinear
  // (901 nao pode disparar alerta so por ter ficado visivel de novo).
  resetCaptures();
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, excludePatterns: '' });
  assert(!captured.sounds.length && !captured.notifs.length, 'mudanca de filtro (exclude) ainda re-baseia: 901 recem-visivel nao alerta');

  scenario.byBase = { 'https://z1': [P(400, 5)], 'https://z2': [P(500, 5)] };
  await setConfig({ instances: [
    { id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true },
    { id: 'inst2', label: 'HML', url: 'https://z2', token: 't2', enabled: false },
  ], minSeverity: 0, repeatAlarm: false });
  eq(knownKeys(), ['inst1:400'], 'instancia desabilitada some da agregacao');
  assert(BG.getState().instStatus.inst2 === undefined, 'instStatus de instancia desabilitada e limpo (sem fantasma)');

  console.log('\n--- Integracao: filtro por host group ---');
  scenario.groups = { 'https://z1': [{ name: 'Linux servers', groupid: '11' }, { name: 'Rede', groupid: '22' }, { name: 'Outro', groupid: '33' }] };
  scenario.lastProblemGet = {};
  scenario.byBase = { 'https://z1': [P(700, 5)] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true, hostGroups: 'Linux servers, Rede' }], minSeverity: 0, repeatAlarm: false });
  eq((scenario.lastProblemGet['https://z1'] || {}).groupids, ['11', '22'], 'host groups resolvidos viram groupids no problem.get');
  scenario.lastProblemGet = {};
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true, hostGroups: '' }], minSeverity: 0, repeatAlarm: false });
  assert(!('groupids' in (scenario.lastProblemGet['https://z1'] || {})), 'sem host groups: problem.get nao envia groupids (observa todos)');

  console.log('\n--- Integracao: autenticacao usuario/senha ---');
  scenario.login = { user: 'noc', pass: 's3cret', sid: 'sid-aaa' };
  scenario.requireSid = true;
  scenario.byBase = { 'https://z1': [P(900, 5)] };
  const instPwd = { id: 'inst1', label: 'PRD', url: 'https://z1', authType: 'password', username: 'noc', password: 's3cret', enabled: true };
  await setConfig({ instances: [instPwd], minSeverity: 0, repeatAlarm: false });
  eq(knownKeys(), ['inst1:900'], 'usuario/senha: user.login + poll funcionam');
  eq(scenario.lastAuth['https://z1'], 'sid-aaa', 'problem.get usa o sessionid retornado pelo user.login');
  eq(BG.getState().instStatus.inst1.via, 'password', 'instStatus.via = password');

  // sessao da API expira -> re-login transparente no MESMO poll
  scenario.login.sid = 'sid-bbb'; // servidor invalidou o sid antigo
  await poll();
  eq(scenario.lastAuth['https://z1'], 'sid-bbb', 'sessao expirada: re-loga e completa o poll com o sid novo');
  eq(status().total, 1, 'poll apos re-login segue ok');

  // Zabbix antigo: rejeita o parametro "username" -> fallback para "user"
  scenario.loginParam = 'user';
  scenario.login.sid = 'sid-ccc';
  await setConfig({ instances: [instPwd], minSeverity: 0, repeatAlarm: false }); // limpa o cache de login
  eq(scenario.lastAuth['https://z1'], 'sid-ccc', 'Zabbix antigo: fallback do parametro username -> user loga');

  // senha errada -> instStatus de erro (sem alerta falso)
  scenario.loginParam = 'username';
  await setConfig({ instances: [{ ...instPwd, password: 'errada' }], minSeverity: 0, repeatAlarm: false });
  eq(BG.getState().instStatus.inst1.state, 'error', 'senha errada: instStatus vira error');
  assert(/incorrect/i.test(BG.getState().instStatus.inst1.error || ''), 'senha errada: mensagem do Zabbix propagada');

  // campos vazios no modo usuario/senha -> sem credencial (error, nao "no-session")
  await setConfig({ instances: [{ ...instPwd, username: '', password: '' }], minSeverity: 0, repeatAlarm: false });
  eq(BG.getState().instStatus.inst1.state, 'error', 'usuario/senha vazios: instStatus error (sem credencial)');

  // testConnection com usuario/senha (fluxo do botao Testar das opcoes)
  const tcOk = await send({ action: 'testConnection', zabbixUrl: 'https://z1', authType: 'password', username: 'noc', password: 's3cret', instId: 'test' });
  eq([tcOk.ok, tcOk.via], [true, 'password'], 'testConnection: usuario/senha ok, via=password');
  const tcBad = await send({ action: 'testConnection', zabbixUrl: 'https://z1', authType: 'password', username: 'noc', password: 'errada', instId: 'test' });
  eq(tcBad.ok, false, 'testConnection: senha errada retorna ok=false');
  // mensagem antiga sem authType (compat): token preenchido continua via=token
  scenario.requireSid = false; // token de API nao passa pela exigencia de sid do mock
  const tcTok = await send({ action: 'testConnection', zabbixUrl: 'https://z1', apiToken: 't1', instId: 'test' });
  eq([tcTok.ok, tcTok.via], [true, 'token'], 'testConnection sem authType: deriva token do apiToken');
  scenario.login = null;

  console.log('\n--- Integracao: modo sessao explicito e token vazio ---');
  const zbxCookie = (sid) => Buffer.from(JSON.stringify({ sessionid: sid, sign: 'x' })).toString('base64');
  scenario.cookie = zbxCookie('sess-123');
  scenario.byBase = { 'https://z1': [P(950, 5)] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', authType: 'session', token: 'IGNORADO', enabled: true }], minSeverity: 0, repeatAlarm: false });
  eq(knownKeys(), ['inst1:950'], 'modo sessao: poll funciona com o cookie zbx_session');
  eq(scenario.lastAuth['https://z1'], 'sess-123', 'modo sessao: usa o sessionid do cookie e IGNORA o token digitado');
  eq(BG.getState().instStatus.inst1.via, 'session', 'instStatus.via = session');

  // formato legado do cookie: o valor cru e o proprio sessionid
  scenario.cookie = 'abcdef1234567890abcd';
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', authType: 'session', enabled: true }], minSeverity: 0, repeatAlarm: false });
  eq(scenario.lastAuth['https://z1'], 'abcdef1234567890abcd', 'modo sessao: cookie legado (valor = sessionid)');

  // sessao rejeitada pelo servidor -> no-session (pede login de novo, nao vira "error")
  scenario.cookie = zbxCookie('sess-morta');
  scenario.login = { user: 'x', pass: 'y', sid: 'sess-viva' };
  scenario.requireSid = true;
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', authType: 'session', enabled: true }], minSeverity: 0, repeatAlarm: false });
  eq(BG.getState().instStatus.inst1.state, 'no-session', 'sessao rejeitada pelo servidor: no-session');
  scenario.login = null; scenario.requireSid = false;

  // sem cookie -> no-session
  scenario.cookie = null;
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', authType: 'session', enabled: true }], minSeverity: 0, repeatAlarm: false });
  eq(BG.getState().instStatus.inst1.state, 'no-session', 'modo sessao sem cookie: no-session');

  // modo token com token vazio -> sem credencial (error, nao cai pra sessao)
  scenario.cookie = zbxCookie('sess-123');
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', authType: 'token', token: '', enabled: true }], minSeverity: 0, repeatAlarm: false });
  eq(BG.getState().instStatus.inst1.state, 'error', 'modo token sem token: error (nao usa a sessao como fallback)');

  console.log('\n--- Integracao: sessao caida e recuperada nao gera tempestade de alertas (hardening, achado do code-review) ---');
  scenario.cookie = zbxCookie('sess-abc');
  scenario.byBase = { 'https://z1': [P(960, 5)] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', authType: 'session', enabled: true }], minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false });
  await poll(); // baseline com sessao ok
  eq(knownKeys(), ['inst1:960'], 'baseline: problema 960 conhecido com sessao ok');

  scenario.cookie = null; // sessao cai (cookie some, ex.: logout em outra aba)
  await poll(); await poll(); await poll(); // varios polls seguidos sem sessao
  eq(BG.getState().instStatus.inst1.state, 'no-session', 'sessao caida: no-session nos polls seguintes');
  assert((status().problems || []).some(p => p.eventid === '960'), 'lista continua mostrando o 960 (ultimo conhecido) mesmo com a sessao caida, nao fica vazia');
  assert(!captured.sounds.length && !captured.notifs.length, 'sessao caida: nenhum alerta falso enquanto esta fora do ar');

  scenario.cookie = zbxCookie('sess-nova'); // usuario loga de novo em outra aba
  await poll();
  eq(BG.getState().instStatus.inst1.state, 'ok', 'sessao recuperada: volta a ok');
  assert(!captured.sounds.length && !captured.notifs.length, 'sessao recuperada: 960 continua ativo mas NAO dispara alerta (nao e um problema novo)');

  // testConnection no modo sessao
  const tcSess = await send({ action: 'testConnection', zabbixUrl: 'https://z1', authType: 'session', instId: 'test' });
  eq([tcSess.ok, tcSess.via], [true, 'session'], 'testConnection: modo sessao ok, via=session');
  scenario.cookie = null;

  // =================================================================
  console.log('\n--- Integracao: nag nao duplica a notificacao de um problema recem-chegado (hardening) ---');
  // lastAlarmTs so era tocado pelo ramo de SOM do fresh/woke; com soundEnabled=false ele ficava
  // parado, o gap do nag vencia sozinho e o MESMO problema recebia uma 2a notificacao (zbx-nag)
  // no mesmo poll em que a 1a (fresh) acabou de sair.
  scenario.byBase = { 'https://z1': [], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, soundEnabled: false, notificationsEnabled: true, nagNotify: true, repeatAlarm: true, repeatInterval: 60 });
  await poll(); // baseline vazio
  BG.getState().lastAlarmTs = Date.now() - 120000; // forca o gap do nag ja ter passado
  scenario.byBase['https://z1'] = [P(950, 5, { name: 'novo e critico' })];
  await poll();
  eq(captured.notifs.length, 1, 'problema recem-chegado gera so 1 notificacao (fresh), nao fresh+nag no mesmo poll');

  console.log('\n--- Integracao: badge "nao visto" usa quando a EXTENSAO descobriu, nao o clock do Zabbix (hardening) ---');
  // Um problema detectado tarde (poll atrasado, instancia que estava em backoff) tem clock antigo
  // no Zabbix mesmo sendo a 1a vez que a extensao o ve; comparar contra p.clock fazia ele nunca
  // contar como "nao visto". firstSeenTs (quando a extensao descobriu) resolve isso.
  scenario.byBase = { 'https://z1': [], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'inst1', label: 'PRD', url: 'https://z1', token: 't1', enabled: true }], minSeverity: 0, badgeUnseen: true, repeatAlarm: false });
  await poll(); // baseline vazio
  await send({ action: 'getStatus' }); // usuario abre o popup com a lista vazia -> lastSeenTs vira "agora"
  scenario.byBase['https://z1'] = [P(960, 5, { clock: 1700000000 })]; // clock antigo (relativo a lastSeenTs): deteccao atrasada
  await poll();
  eq(captured.badge, '1', 'problema nunca visto pelo usuario conta no badge, mesmo com clock antigo do Zabbix');

  console.log('\n--- Integracao: cada problema carrega "unseen", independente do badgeUnseen (issue #28) ---');
  // instId/url diferentes dos testes anteriores: forca filterSignature() a mudar de verdade, garantindo
  // um baseline real (senao state.initialized carrega do teste anterior e 970 nasceria "fresh").
  scenario.byBase = { 'https://zUnseen': [P(970, 5)], 'https://z2': [] };
  await setConfig({ instances: [{ id: 'instUnseen', label: 'PRD', url: 'https://zUnseen', token: 't1', enabled: true }], minSeverity: 0, badgeUnseen: false, repeatAlarm: false });
  await poll(); // baseline: 970 e "conhecido"
  await send({ action: 'getStatus' }); // popup abre -> lastSeenTs vira "agora", 970 ja foi visto
  scenario.byBase['https://zUnseen'].push(P(971, 5, { name: 'chegou depois do popup abrir' }));
  await poll();
  const stUnseen = status();
  const p970 = (stUnseen.problems || []).find(p => p.eventid === '970');
  const p971 = (stUnseen.problems || []).find(p => p.eventid === '971');
  eq(p970.unseen, false, '970 (conhecido antes do popup abrir) nao fica marcado unseen');
  eq(p971.unseen, true, '971 (chegou depois do popup abrir) fica marcado unseen, mesmo com badgeUnseen desligado');

  // =================================================================
  // Bug hunt da rodada v0.6 (combinacoes das mudancas da rodada). Testes que FALHAM no codigo atual.
  scenario.rejectBodyAuth = false; scenario.rejectHeaderAuth = false; scenario.problemGetError = null;
  scenario.meetTabs = []; scenario.workPeriod = ''; scenario.login = null; scenario.requireSid = false;

  console.log('\n--- Bug hunt (pre-existente, fora da rodada): baseline gasto num poll que falhou ---');
  scenario.cookie = null;
  scenario.byBase = { 'https://zNew': [P(397, 5, { name: 'ja existia antes de logar' }), P(398, 4)] };
  await setConfig({ instances: [{ id: 'instNew', label: 'NOVO', url: 'https://zNew', authType: 'session', enabled: true }], minSeverity: 0, repeatAlarm: false, muted: false, notificationsEnabled: true, soundEnabled: true, blindSpotAlert: false });
  eq(BG.getState().instStatus.instNew.state, 'no-session', '(pre) instancia recem-adicionada, ainda sem sessao no Zabbix dela');
  scenario.cookie = zbxCookie('sess-inst-nova'); // usuario loga no Zabbix novo
  await poll();
  eq(BG.getState().instStatus.instNew.state, 'ok', '(pre) logou: instancia ok');
  assert(!captured.sounds.length && !captured.notifs.length, 'problemas que ja existiam antes do 1o poll COM SUCESSO nao disparam alerta de novo (baseline nao pode ser gasto num poll que falhou)');
  scenario.byBase['https://zNew'].push(P(399, 5, { name: 'novo de verdade' }));
  await poll();
  assert(captured.sounds.length === 1 && captured.notifs.some(n => n.message === 'novo de verdade'), 'depois desse baseline, um problema novo de verdade nessa instancia alerta normalmente');
  scenario.cookie = null;

  console.log('\n--- Bug hunt v0.6: botoes da notificacao depois do service worker dormir ---');
  // storage.session real: o get e assincrono, entao 2 saveNotifUrl no mesmo tick leem o MESMO mapa
  // antigo e o ultimo set ganha. Mock fiel so neste teste (restaurado no fim).
  const sessGetOrig = chrome.storage.session.get;
  chrome.storage.session.get = (keys, cb) => {
    const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (storageSession[k] !== undefined) o[k] = JSON.parse(JSON.stringify(storageSession[k])); });
    return new Promise(res => setTimeout(() => { cb && cb(o); res(o); }, 0));
  };
  storageSession.notifUrls = {};
  scenario.byBase = { 'https://zSw': [] };
  await setConfig({ instances: [{ id: 'instSw', label: 'PRD', url: 'https://zSw', token: 't1', enabled: true }], minSeverity: 0, repeatAlarm: false, muted: false, notificationsEnabled: true, soundEnabled: true });
  await poll();
  scenario.byBase['https://zSw'].push(P(390, 5, { name: 'primeiro do lote' }), P(391, 4, { name: 'segundo do lote' }));
  await poll(); await tick(30);
  const nFirst = captured.notifs.find(n => n.message === 'primeiro do lote');
  BG.getState().notifUrls = {}; // service worker dormiu: a memoria some, o storage.session fica
  scenario.ackCalls = []; resetCaptures();
  notifButtonListener(nFirst.id, 0); await tick(80);
  chrome.storage.session.get = sessGetOrig;
  eq((scenario.ackCalls || []).map(c => c.params.eventids), [['390']], 'SW dormiu: ACK pelo botao de QUALQUER notificacao do lote (nao so a ultima) chega no Zabbix, em vez de so fechar a notificacao');

  console.log('\n--- Bug hunt v0.6: botao ACK depois de remover uma instancia do meio ---');
  scenario.byBase = { 'https://zR1': [], 'https://zR2': [], 'https://zR3': [P(395, 4)] }; // eventid 395 tambem existe no R3
  const R = (id, label, url) => ({ id, label, url, token: 't-' + label, enabled: true });
  await setConfig({ instances: [R('inst1', 'R1', 'https://zR1'), R('inst2', 'R2', 'https://zR2'), R('inst3', 'R3', 'https://zR3')], minSeverity: 0, repeatAlarm: false, muted: false, notificationsEnabled: true });
  await poll();
  scenario.byBase['https://zR2'].push(P(395, 5, { name: 'problema do R2' }));
  await poll();
  const nR2 = captured.notifs.find(n => n.message === 'problema do R2');
  // Opcoes: remove o R1; collectInstances renumera por posicao (R2 vira inst1, R3 vira inst2)
  await setConfig({ instances: [R('inst1', 'R2', 'https://zR2'), R('inst2', 'R3', 'https://zR3')] });
  scenario.ackCalls = [];
  notifButtonListener(nR2.id, 0); await tick(80);
  assert(!(scenario.ackCalls || []).some(c => c.base === 'https://zR3'), 'ACK de uma notificacao antiga do R2 nao vai parar no R3 (outro Zabbix) depois das instancias serem renumeradas');
  eq((scenario.ackCalls || []).map(c => [c.base, c.params.eventids]), [['https://zR2', ['395']]], 'e vai pro R2 certo (achado pela URL gravada na notificacao)');
  // instancia removida de vez: avisa em vez de mandar o ACK pra qualquer lugar
  scenario.byBase['https://zR3'].push(P(396, 5, { name: 'problema do R3' }));
  await poll();
  const nR3 = captured.notifs.find(n => n.message === 'problema do R3');
  await setConfig({ instances: [R('inst1', 'R2', 'https://zR2')] });
  scenario.ackCalls = []; resetCaptures();
  notifButtonListener(nR3.id, 0); await tick(80);
  assert(!(scenario.ackCalls || []).length && captured.notifs.some(n => /^zbx-ackerr-/.test(n.id)), 'instancia removida: nenhum ACK enviado, e um aviso explica');
  resetCaptures();
  notifButtonListener(nR3.id, 1); await tick(80); // "Adiar 15 min" na mesma notificacao orfa
  const snzWarn = captured.notifs.find(n => /^zbx-ackerr-/.test(n.id));
  assert(snzWarn && !/ACK/.test(snzWarn.title), 'adiar numa instancia removida avisa sem dizer "ACK falhou" (o botao era o de adiar)');

  console.log('\n--- Bug hunt v0.6: notificacao de ponto cego nao fica velha apos corrigir a credencial ---');
  scenario.badToken = 'tok-velho';
  scenario.byBase = { 'https://zBlFix': [P(356, 4)] };
  const instFx = { id: 'instFx', label: 'FIX', url: 'https://zBlFix', authType: 'token', token: 'tok-velho', enabled: true };
  await setConfig({ instances: [instFx], minSeverity: 0, repeatAlarm: false, muted: false, mutedUntil: 0, blindSpotAlert: true, blindSpotMinutes: 2, notificationsEnabled: true, soundEnabled: true, workingTimeOnly: false, suppressDuringMeeting: false });
  await poll(); ageDown('instFx', 5); BG.getState().instBackoff = {}; await poll();
  assert(blindNotifs().some(n => n.id === 'zbx-blind-instFx'), '(pre) token invalido ha mais de N min: ponto cego avisado');
  scenario.badToken = null;
  resetCaptures();
  await setConfig({ instances: [{ ...instFx, token: 'tok-novo' }] }); // corrige o token nas Opcoes; o poll do proprio setConfig ja volta ok
  const clearedAfterFix = captured.cleared.slice();
  await poll();
  eq(BG.getState().instStatus.instFx.state, 'ok', '(pre) token corrigido: instancia volta a ok');
  assert(clearedAfterFix.concat(captured.cleared).includes('zbx-blind-instFx'), 'token corrigido nas Opcoes: a notificacao de ponto cego (requireInteraction) e fechada, nao fica na tela dizendo que esta cego');
  // instancia removida enquanto cega: a notificacao dela fecha
  scenario.badToken = 'tok-rm';
  await setConfig({ instances: [{ ...instFx, token: 'tok-rm' }, { id: 'instFx2', label: 'OUTRA', url: 'https://zBlFix2', token: 't2', enabled: true }] });
  await poll(); ageDown('instFx', 5); BG.getState().instBackoff = {}; await poll();
  assert(blindNotifs().some(n => n.id === 'zbx-blind-instFx'), '(pre) cega de novo');
  resetCaptures();
  await setConfig({ instances: [{ id: 'instFx2', label: 'OUTRA', url: 'https://zBlFix2', token: 't2', enabled: true }] }); // remove a cega
  assert(captured.cleared.includes('zbx-blind-instFx'), 'instancia removida enquanto cega: a notificacao fixa dela fecha');
  scenario.badToken = null;
  // service worker reiniciou (flags so em memoria): a 1a vez que a instancia aparece ok fecha uma notificacao velha
  BG.getState().blindAlerted = {}; BG.getState().blindOkSeen = {};
  resetCaptures(); await poll();
  assert(captured.cleared.includes('zbx-blind-instFx2'), 'SW reiniciado: 1o poll ok fecha qualquer notificacao de cego velha da instancia');
  resetCaptures(); await poll();
  assert(!captured.cleared.includes('zbx-blind-instFx2'), 'e nao fica chamando clear a cada poll depois disso');

  console.log('\n--- Bug hunt v0.6: "mudo ate o fim do turno" com o turno ja acabado ---');
  const mPast = await send({ action: 'setMuted', muted: true, untilTs: Date.now() - 60000 });
  assert(!(mPast.muted && !mPast.mutedUntil), 'setMuted com untilTs que ja passou nao vira mudo INDEFINIDO (o oposto do que foi pedido)');
  eq([mPast.muted, BG.getConfig().muted], [false, false], 'turno ja acabado: nao muta (nao ha o que silenciar)');
  await send({ action: 'setMuted', muted: false });

  console.log('\n--- Bug hunt v0.6: import com 2 instancias na mesma URL (filtros diferentes, credenciais diferentes) ---');
  await setConfig({ instances: [
    { id: 'inst1', label: 'A', url: 'https://zDup', authType: 'password', username: 'team-a', password: 'pwA', enabled: false },
    { id: 'inst2', label: 'B', url: 'https://zDup', authType: 'password', username: 'team-b', password: 'pwB', enabled: false },
    { id: 'inst3', label: 'C', url: 'https://zDupT', authType: 'token', token: 'tokC1', enabled: false },
    { id: 'inst4', label: 'D', url: 'https://zDupT', authType: 'token', token: 'tokC2', enabled: false },
  ] });
  await send({ action: 'importConfig', config: { instances: [
    { id: 'inst1', label: 'A', url: 'https://zDup', authType: 'password', username: 'team-a', password: '', enabled: false },
    { id: 'inst2', label: 'B', url: 'https://zDup', authType: 'password', username: 'team-b', password: '', enabled: false },
    { id: 'inst3', label: 'C', url: 'https://zDupT', authType: 'token', token: '', enabled: false },
    { id: 'inst4', label: 'D', url: 'https://zDupT', authType: 'token', token: '', enabled: false },
  ] } });
  const dupInst = BG.getConfig().instances;
  eq(dupInst[1].password, 'pwB', 'import: 2a instancia da mesma URL (outro usuario) mantem a PROPRIA senha local');
  eq(dupInst[3].token, 'tokC2', 'import: 2a instancia da mesma URL mantem o PROPRIO token, nao o da 1a');

  // =================================================================
  // 2a passada adversarial (sobre os fixes da rodada). Testes que FALHAM no codigo atual.

  console.log('\n--- Bug hunt v0.6 (2a passada): re-baseline do setConfig com OUTRA instancia cega ---');
  // A ja tinha baseline e caiu (sessao); o operador adiciona um 2o Zabbix nas Opcoes (o filtro da A
  // nao muda). O re-baseline zera instBaselined de TODAS: a A, ainda cega, perde o baseline que o
  // carry-forward mantinha. Um desastre que chega na A durante a queda e adotado calado ao voltar.
  scenario.cookie = zbxCookie('sess-rb-1');
  scenario.byBase = { 'https://zRbA': [P(410, 4, { name: 'ja conhecido antes da queda' })], 'https://zRbB': [] };
  const instRbA = { id: 'instRbA', label: 'A', url: 'https://zRbA', authType: 'session', enabled: true };
  await setConfig({ instances: [instRbA], minSeverity: 0, repeatAlarm: false, muted: false, mutedUntil: 0, notificationsEnabled: true, soundEnabled: true, blindSpotAlert: false, workingTimeOnly: false, suppressDuringMeeting: false });
  await poll();
  scenario.cookie = null; await poll(); // sessao da A caiu: carry-forward
  await setConfig({ instances: [instRbA, { id: 'instRbB', label: 'B', url: 'https://zRbB', token: 'tB', enabled: true }] });
  eq(BG.getState().instStatus.instRbA.state, 'no-session', '(pre) A continua sem sessao depois de adicionar a B');
  scenario.byBase['https://zRbA'].push(P(411, 5, { name: 'desastre durante a queda' }));
  await poll();
  scenario.cookie = zbxCookie('sess-rb-2'); // operador loga de novo no Zabbix da A
  await poll();
  eq(BG.getState().instStatus.instRbA.state, 'ok', '(pre) A voltou');
  assert(captured.sounds.length === 1 && captured.notifs.some(n => n.message === 'desastre durante a queda'), 'instancia cega durante um re-baseline (outra instancia adicionada): o desastre que chegou nela durante a queda alerta quando ela volta, nao e adotado calado');
  scenario.cookie = null;

  console.log('\n--- Bug hunt v0.6 (2a passada): setConfig com um poll em voo gasta o baseline com o filtro velho ---');
  // o problem.get leva severities (filtro no SERVIDOR) montado antes do await; o setConfig chega no
  // meio, zera instBaselined, e o poll em voo marca a instancia como baselined com a lista do filtro
  // velho. O poll coalescido seguinte ve tudo que so passou a ser visivel como "novo".
  scenario.byBase = { 'https://zRace': [P(420, 4, { name: 'high antigo' }), P(421, 2, { name: 'warning antigo' })] };
  await setConfig({ instances: [{ id: 'instRace', label: 'R', url: 'https://zRace', token: 'tR', enabled: true }], minSeverity: 4, repeatAlarm: false, muted: false, mutedUntil: 0, notificationsEnabled: true, soundEnabled: true, blindSpotAlert: false });
  await poll();
  const fetchOrigRace = sandbox.fetch;
  let releaseRace = null;
  sandbox.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    if (b.method === 'problem.get' && !releaseRace) await new Promise(r => { releaseRace = r; });
    const res = await fetchOrigRace(url, opts);
    if (b.method !== 'problem.get' || !Array.isArray(b.params.severities)) return res;
    const data = await res.json(); // Zabbix filtra severities no servidor (o mock nao filtra)
    data.result = data.result.filter(p => b.params.severities.includes(Number(p.severity)));
    return { status: 200, json: async () => data };
  };
  resetCaptures();
  const inflightRace = send({ action: 'pollNow' });
  await tick(5); // poll parado no problem.get com severities [4,5]
  const cfgRace = setConfig({ minSeverity: 2 }); // operador baixa a severidade minima nesse instante
  releaseRace();
  await inflightRace; await cfgRace; await tick(30);
  sandbox.fetch = fetchOrigRace;
  assert(!captured.notifs.some(n => n.message === 'warning antigo'), 'filtro alterado com um poll em voo: um problema que ja existia e so passou a ser visivel nao dispara como novo');
  assert(!!probByEvent('instRace', '421'), 'mas aparece na lista (o poll seguinte, com o filtro novo, fez o baseline)');
  scenario.byBase['https://zRace'].push(P(422, 3, { name: 'average novo de verdade' }));
  await poll();
  assert(captured.notifs.some(n => n.message === 'average novo de verdade'), 'e um problema novo de verdade depois disso alerta normalmente');
  // mesma corrida com o re-alarme ligado: o poll em voo (que nao vale como baseline) nao pode soltar
  // um re-alarme espurio so porque o setConfig zerou o relogio do nag
  await setConfig({ minSeverity: 4, repeatAlarm: true, repeatInterval: 60, nagNotify: true });
  await poll();
  BG.getState().lastAlarmTs = Date.now(); // acabou de alarmar: o nag so pode voltar daqui a 60s
  let releaseRace2 = null;
  sandbox.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    if (b.method === 'problem.get' && !releaseRace2) await new Promise(r => { releaseRace2 = r; });
    return fetchOrigRace(url, opts);
  };
  resetCaptures();
  const inflight2 = send({ action: 'pollNow' });
  await tick(5);
  const cfg2 = setConfig({ minSeverity: 3 });
  releaseRace2();
  await inflight2; await cfg2; await tick(30);
  sandbox.fetch = fetchOrigRace;
  eq(captured.notifs.filter(n => n.id === 'zbx-nag').length, 0, 'filtro salvo com poll em voo: nenhum re-alarme espurio (o relogio do nag nao fica zerado)');
  await setConfig({ repeatAlarm: false });

  console.log('\n--- Bug hunt v0.6 (2a passada): snooze que vence DURANTE o mudo com tempo ---');
  // o fim do snooze cai no meio do mudo: o lote "woke" sai silenciado e o snooze e apagado. No fim do
  // mudo, o re-alerta so olha firstSeenTs >= mutedAt, e o problema ja existia antes: nunca mais alerta.
  scenario.byBase = { 'https://zSnzMute': [P(450, 5, { name: 'adiado e depois mudo' })] };
  await setConfig({ instances: [{ id: 'instSm', label: 'PRD', url: 'https://zSnzMute', token: 'tS', enabled: true }], minSeverity: 0, repeatAlarm: false, muted: false, mutedUntil: 0, notificationsEnabled: true, soundEnabled: true, blindSpotAlert: false });
  await poll();
  BG.getState().snoozes['instSm:450'] = Date.now() + 15 * 60000; // operador adia 15 min
  await send({ action: 'setMuted', muted: true, minutes: 60 });   // e depois muta por 1 h
  BG.getState().snoozes['instSm:450'] = Date.now() - 1;            // o snooze vence no meio do mudo
  await poll();
  assert(!captured.sounds.length && !captured.notifs.length, '(pre) durante o mudo nada alerta');
  BG.getConfig().mutedUntil = Date.now() - 1000;                    // fim do mudo
  await poll();
  assert(captured.notifs.some(n => n.message === 'adiado e depois mudo'), 'snooze que venceu durante o mudo com tempo (re-alarme off): o problema, ainda aberto e sem ack, alerta no fim do mudo em vez de sumir calado');

  console.log('\n--- Bug hunt v0.6 (2a passada): URL trocada no lugar, Zabbix novo ainda ilegivel ---');
  // _carryForward reusa state.lastActive[instId], que nao e limpo quando a URL da instancia muda: a
  // lista do Zabbix ANTIGO aparece (e re-alarma) como se fosse do novo, com links/ACK pro novo.
  scenario.cookie = null;
  scenario.byBase = { 'https://zOldSrv': [P(460, 5, { name: 'desastre do Zabbix antigo' })], 'https://zNewSrv': [] };
  const instMv = { id: 'instMv', label: 'PRD', url: 'https://zOldSrv', authType: 'token', token: 'tOld', enabled: true };
  await setConfig({ instances: [instMv], minSeverity: 0, repeatAlarm: true, repeatInterval: 5, nagNotify: true, muted: false, mutedUntil: 0, notificationsEnabled: true, soundEnabled: true, blindSpotAlert: false });
  await poll();
  await setConfig({ instances: [{ ...instMv, url: 'https://zNewSrv', authType: 'session', token: '' }] }); // migracao pro Zabbix novo, sem sessao ainda
  eq(BG.getState().instStatus.instMv.state, 'no-session', '(pre) instancia agora aponta pro Zabbix novo, ainda sem sessao');
  assert(!probByEvent('instMv', '460'), 'URL da instancia trocada: a lista do Zabbix ANTIGO nao continua no popup como se fosse do novo');
  BG.getState().lastAlarmTs = 0; await poll();
  assert(!captured.notifs.some(n => n.message === 'desastre do Zabbix antigo'), 'e o nag nao re-alarma um problema do Zabbix antigo apontando (link/ACK) pro novo');
  scenario.byBase['https://zNewSrv'] = [P(461, 5, { name: 'ja existia no Zabbix novo' })];
  scenario.cookie = zbxCookie('sess-novo'); BG.getState().instBackoff = {};
  resetCaptures(); await poll();
  assert(!!probByEvent('instMv', '461'), 'Zabbix novo respondeu: o que ja existia la aparece na lista');
  // (o re-alarme esta LIGADO neste teste: o lembrete zbx-nag de um problema sem ack e esperado; o que
  // nao pode e ele chegar como alerta de problema NOVO, id zbx-<eventid>-...)
  eq(captured.notifs.filter(n => /^zbx-461-/.test(n.id)).length, 0, 'e entra calado como baseline novo, nao como alerta de problema novo (sem enxurrada)');
  eq(captured.notifs.filter(n => n.id !== 'zbx-nag').length, 0, 'nenhuma notificacao alem do lembrete do re-alarme');
  scenario.cookie = null;

  console.log('\n--- Exibicao: tags estilo Zabbix (popup.js real, linha montada) ---');
  const DEF = BG.getDefaults();
  eq([DEF.showTags, DEF.tagNameFormat, DEF.tagPriority], [3, 'full', ''], 'padroes das tags = visual de antes (3 chips, nome completo, sem prioridade)');
  // tags tipicas de template do Zabbix 6+: class/component/scope sao ruido, service/team e o que o NOC le
  const tagsP = { eventid: '1', instId: 'i1', host: 'web-01', name: 'CPU alta', severity: '4', clock: String(Math.floor(Date.now() / 1000)),
    tags: [{ tag: 'class', value: 'os' }, { tag: 'component', value: 'cpu' }, { tag: 'scope', value: 'performance' }, { tag: 'service', value: 'web' }, { tag: 'team', value: '' }] };
  const chips = (html) => [...html.matchAll(/class="tagchip"[^>]*>([^<]*)</g)].map(m => m[1]);
  const tagMore = (html) => (html.match(/class="tagmore"[^>]*>\+(\d+)</) || [])[1] || null;
  let rowH = popRow(tagsP, {});
  eq(chips(rowH), ['class:os', 'component:cpu', 'scope:performance'], 'sem config: os 3 primeiros chips com o nome completo (igual a antes)');
  eq(tagMore(rowH), '2', 'e o "+2" das que sobraram');
  rowH = popRow(tagsP, { showTags: 1 });
  eq(chips(rowH), ['class:os'], 'mostrar 1 tag');
  eq(tagMore(rowH), '4', '...com o +4 do resto');
  rowH = popRow(tagsP, { showTags: 0 });
  assert(/CPU alta/.test(rowH) && !/tagrow/.test(rowH), 'mostrar nenhuma tag: a linha aparece, sem a fila de tags');
  eq(chips(popRow(tagsP, { tagPriority: 'service, Team' })), ['service:web', 'team', 'class:os'], 'prioridade: service e team primeiro, na ordem da lista e sem diferenciar maiusculas; o resto na ordem do Zabbix');
  eq(chips(popRow(tagsP, { tagNameFormat: 'short' })), ['cla:os', 'com:cpu', 'sco:performance'], 'nome abreviado: 3 letras do nome, como no Zabbix');
  eq(chips(popRow(tagsP, { tagNameFormat: 'none', tagPriority: 'team,service' })), ['team', 'web', 'os'], 'so o valor; tag sem valor mostra o nome (senao seria um chip vazio)');
  assert(/data-tag="service:web"/.test(popRow(tagsP, { tagNameFormat: 'none', tagPriority: 'service' })), 'mostrando so o valor, o clique no chip continua filtrando por "tag:valor" completo');
  eq(chips(popRow(tagsP, { showTags: '7', tagNameFormat: 'xx' })).length, 3, 'valor invalido no config cai no padrao (3 chips)');
  eq(chips(popRow(tagsP, { showTags: '2' })).length, 2, 'numero vindo como texto do <select> funciona');

  console.log('\n--- Exibicao: opdata estilo Zabbix (nao mostrar / linha separada / junto do nome) ---');
  eq(DEF.opdataMode, 'separate', 'padrao do opdata = linha separada (visual de antes)');
  const opP = { eventid: '3', instId: 'i1', host: 'web-01', name: 'CPU alta', severity: '4', clock: '1', opdata: 'CPU: 97.3 %', tags: [] };
  const nameOf = (html) => (html.match(/class="name"[^>]*>([^<]*)</) || [])[1];
  const opLine = (html) => (html.match(/class="opdata"[^>]*>([^<]*)</) || [])[1] || null;
  rowH = popRow(opP, {});
  eq([nameOf(rowH), opLine(rowH)], ['CPU alta', 'CPU: 97.3 %'], 'sem config: opdata numa linha separada (igual a antes)');
  rowH = popRow(opP, { opdataMode: 'name' });
  eq([nameOf(rowH), opLine(rowH)], ['CPU alta (CPU: 97.3 %)', null], 'junto do nome: entre parenteses depois do nome, como no Zabbix, e sem a linha separada');
  assert(rowH.includes('title="CPU alta (CPU: 97.3 %)"'), '...e o texto ao passar o mouse tambem traz o valor');
  rowH = popRow(opP, { opdataMode: 'none' });
  eq([nameOf(rowH), opLine(rowH)], ['CPU alta', null], 'nao mostrar: nem linha separada, nem no nome');
  eq(nameOf(popRow({ ...opP, opdata: '  ' }, { opdataMode: 'name' })), 'CPU alta', 'problema sem opdata (ou so espacos): nome sem parenteses vazios');
  eq(opLine(popRow(opP, { opdataMode: 'xx' })), 'CPU: 97.3 %', 'valor invalido no config cai no padrao (linha separada)');

  console.log('\n--- popup: aspas no nome/host/tag nao quebram os atributos da linha ---');
  // esc() do popup nao escapava aspas (o das Opcoes ja escapava): title="${esc(nome)}" com aspas no
  // nome fechava o atributo no meio e o resto do texto virava atributos soltos na tag.
  const quoteP = { eventid: '2', instId: 'i1', host: 'srv-01', name: 'Disco "C:" cheio', severity: '4', clock: '1', tags: [{ tag: 'path', value: 'C:"x"' }] };
  rowH = popRow(quoteP, {});
  assert(rowH.includes('title="Disco &quot;C:&quot; cheio"'), 'aspas no nome do problema ficam escapadas dentro do title');
  assert(rowH.includes('data-tag="path:C:&quot;x&quot;"'), 'aspas no valor da tag ficam escapadas no data-tag (o clique filtra pelo valor certo)');

  // trocar so a exibicao nao pode re-basear (salvar as Opcoes viraria uma enxurrada de "novos")
  scenario.byBase = { 'https://zDisp': [P(470, 5, { name: 'ja existia' })] };
  await setConfig({ instances: [{ id: 'instD', label: 'D', url: 'https://zDisp', token: 'tD', enabled: true }], minSeverity: 0, repeatAlarm: false, muted: false, mutedUntil: 0, notificationsEnabled: true, soundEnabled: true, blindSpotAlert: false });
  await poll();
  await setConfig({ showTags: 1, tagNameFormat: 'short', tagPriority: 'service' });
  assert(BG.getState().initialized === true, 'salvar so opcoes de exibicao das tags nao re-baseia');
  await poll();
  eq(captured.notifs.length + captured.sounds.length, 0, 'e o que ja existia nao alerta de novo');

  // =================================================================
  console.log('\n' + '='.repeat(44));
  console.log('RESULTADO: ' + pass + ' passaram, ' + fail + ' falharam');
  console.log('='.repeat(44));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO no runner:', e); process.exit(2); });
