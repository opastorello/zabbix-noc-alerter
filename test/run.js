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
let scenario = { byBase: {}, version: '6.0.4', groups: {}, lastProblemGet: {}, meetTabs: [], workPeriod: '', login: null, requireSid: false, loginParam: 'username', lastAuth: {}, cookie: null };

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
    create: (id, opts) => { captured.notifs.push({ id, title: opts && opts.title, message: opts && opts.message }); },
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
    if (scenario.requireSid && scenario.login && auth !== scenario.login.sid) return errResp('Session terminated, re-login, please.', '');
    result = (scenario.byBase[base] || []).map(p => ({ ...p }));
  }
  else if (body.method === 'hostgroup.get') { const want = (body.params.filter && body.params.filter.name) || []; result = (scenario.groups[base] || []).filter(g => want.includes(g.name)).map(g => ({ groupid: g.groupid })); }
  else if (body.method === 'trigger.get') result = ((body.params && body.params.triggerids) || []).map(id => ({ triggerid: id, hosts: [{ hostid: 'h' + id, name: 'host-' + id }] }));
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
  // settings.get sem permissao: fail-open (alerta normalmente)
  scenario.workPeriod = null;
  await setConfig({ instances: BG.getConfig().instances, minSeverity: 0, soundEnabled: true, notificationsEnabled: true, repeatAlarm: false, workingTimeOnly: true });
  scenario.byBase['https://z1'].push(P(803, 5, { name: 'sem permissao' }));
  await poll();
  assert(captured.sounds.length === 1 && captured.notifs.length >= 1, 'settings.get sem permissao: fail-open (alerta normal)');
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

  // testConnection no modo sessao
  const tcSess = await send({ action: 'testConnection', zabbixUrl: 'https://z1', authType: 'session', instId: 'test' });
  eq([tcSess.ok, tcSess.via], [true, 'session'], 'testConnection: modo sessao ok, via=session');
  scenario.cookie = null;

  // =================================================================
  console.log('\n' + '='.repeat(44));
  console.log('RESULTADO: ' + pass + ' passaram, ' + fail + ' falharam');
  console.log('='.repeat(44));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO no runner:', e); process.exit(2); });
