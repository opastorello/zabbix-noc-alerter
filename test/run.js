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
let scenario = { byBase: {}, version: '6.0.4' };

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
  cookies: { get: async () => null, getAll: async () => [] },
  offscreen: { hasDocument: async () => true, createDocument: async () => {}, closeDocument: async () => {} },
};

// ---------- mock fetch (JSON-RPC do Zabbix) ----------
async function fetchMock(url, opts) {
  const base = String(url).replace('/api_jsonrpc.php', '');
  const body = JSON.parse(opts.body);
  let result;
  if (body.method === 'apiinfo.version') result = scenario.version;
  else if (body.method === 'problem.get') result = (scenario.byBase[base] || []).map(p => ({ ...p }));
  else if (body.method === 'trigger.get') result = ((body.params && body.params.triggerids) || []).map(id => ({ triggerid: id, hosts: [{ hostid: 'h' + id, name: 'host-' + id }] }));
  else if (body.method === 'event.acknowledge') result = { eventids: body.params.eventids };
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

  // =================================================================
  console.log('\n' + '='.repeat(44));
  console.log('RESULTADO: ' + pass + ' passaram, ' + fail + ' falharam');
  console.log('='.repeat(44));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO no runner:', e); process.exit(2); });
