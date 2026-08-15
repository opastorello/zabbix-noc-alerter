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

// ---------- cenario do Zabbix (controlado por teste) ----------
// login: {user, pass, sid} habilita o user.login; requireSid: problem.get exige o sid atual
// (simula sessao expirada trocando o sid); loginParam: 'username' (moderno) ou 'user' (Zabbix antigo);
// cookie: valor do zbx_session do navegador (null = sem sessao aberta)
let scenario = { byBase: {}, version: '6.0.4', groups: {}, lastProblemGet: {}, meetTabs: [], workPeriod: '', login: null, requireSid: false, loginParam: 'username', lastAuth: {}, cookie: null, disabledTriggers: [], problemGetError: null, problemGetCalls: {}, triggerGetError: null, hiddenTriggers: [] };

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
    create: (id, opts) => { captured.notifs.push({ id, title: opts && opts.title, message: opts && opts.message, contextMessage: opts && opts.contextMessage }); },
    clear: (id) => { captured.cleared.push(id); },
    onClicked: { addListener: () => {} }, onClosed: { addListener: () => {} },
  },
  runtime: {
    getManifest: () => ({ version: '0.0.0' }),
    onMessage: { addListener: (fn) => { messageListener = fn; } },
    onStartup: { addListener: () => {} }, onInstalled: { addListener: () => {} },
    sendMessage: () => {}, lastError: null,
  },
  alarms: { create: () => {}, clear: () => {}, onAlarm: { addListener: () => {} }, get: (_n, cb) => cb && cb(null) },
  cookies: {
    get: async ({ name }) => (name === 'zbx_session' && scenario.cookie) ? { name, value: scenario.cookie } : null,
    getAll: async () => scenario.cookie ? [{ name: 'zbx_session', value: scenario.cookie }] : [],
  },
  tabs: { query: async ({ url }) => scenario.meetTabs.filter(u => String(url) === 'https://meet.google.com/*' && u.startsWith('https://meet.google.com/')).map(u => ({ url: u })) },
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
    result = ids.map(id => ({ triggerid: id, status: scenario.disabledTriggers.includes(id) ? '1' : '0', hosts: [{ hostid: 'h' + id, name: 'host-' + id }] }));
  }
  else if (body.method === 'event.acknowledge') result = { eventids: body.params.eventids };
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
const bridge = '\n;globalThis.__bg = { getConfig:()=>config, getState:()=>state, setPlaySpy:(fn)=>{ playSound = fn; } };';
vm.runInContext(bgSrc + bridge, sandbox, { filename: 'background.js' });
const BG = sandbox.__bg;
BG.setPlaySpy((preset, vol) => { captured.sounds.push({ preset, vol }); return Promise.resolve(); });

// ---------- helpers de integracao ----------
function send(msg) { return new Promise(res => { const r = messageListener(msg, {}, res); if (r !== true) res(undefined); }); }
const setConfig = (cfg) => send({ action: 'setConfig', config: cfg });
const poll = async () => { resetCaptures(); await send({ action: 'pollNow' }); };
const status = () => BG.getState().status;
const knownKeys = () => [...BG.getState().known.keys()].sort();
const probByEvent = (instId, ev) => (status().problems || []).find(p => p.instId === instId && p.eventid === ev);
function P(ev, sev, x = {}) { return { eventid: String(ev), objectid: 't' + ev, name: x.name || ('p' + ev), severity: String(sev), clock: String(x.clock || 1700000000), acknowledged: x.acknowledged || '0', suppressed: x.suppressed || '0', suppression_data: x.suppression_data || [], acknowledges: x.acknowledges || [] }; }

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

  // =================================================================
  console.log('\n' + '='.repeat(44));
  console.log('RESULTADO: ' + pass + ' passaram, ' + fail + ' falharam');
  console.log('='.repeat(44));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO no runner:', e); process.exit(2); });
