// Zabbix NOC Alerter - Options

const SOUNDS = [
  'klaxon', 'siren', 'airraid', 'slowwhoop', 'twotone', 'warble', 'whoop', 'woop',
  't3', 'eas', 'redalert', 'sos', 'pulse', 'beepbeep', 'digital', 'chirp', 'microwave',
  'truck', 'ekg', 'radar', 'sonar', 'bell', 'alarmclock', 'trill', 'airhorn',
  'foghorn', 'submarine', 'steamwhistle', 'caralarm', 'laser', 'phaser', 'ascending',
  'descending', 'nuclear', 'industrial', 'gong', 'oldphone', 'seatbelt', 'buzzer',
  'flatline', 'chime'
];
const TEXT = ['zabbixUrl', 'apiToken', 'excludePatterns'];
const NUM = ['pollInterval', 'repeatInterval'];
const SEL = ['minSeverity', 'soundSev5', 'soundSev4', 'soundSev3', 'soundSev2', 'soundSev1'];
const CHK = ['soundEnabled', 'notificationsEnabled', 'notifyResolved', 'repeatAlarm', 'ignoreAckd', 'ignoreSuppressed'];

document.addEventListener('DOMContentLoaded', () => {
  populateLangSelect(document.getElementById('lang')); // idiomas gerados do i18n.js (auto-extensivel)
  applyI18n(resolveLang()); // aplica o idioma na hora (evita flash sem acento)
  // versao: fonte unica = manifest.json (versao completa, ex.: v0.1.1)
  const ver = 'v' + chrome.runtime.getManifest().version;
  document.getElementById('appVer').textContent = ver;
  const vf = document.getElementById('appVerFoot'); if (vf) vf.textContent = ver;

  // popula os selects de som (um por severidade)
  ['soundSev5', 'soundSev4', 'soundSev3', 'soundSev2', 'soundSev1'].forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = SOUNDS.map(s => `<option value="${s}">${s}</option>`).join('');
  });

  loadSettings();
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  document.getElementById('testBtn').addEventListener('click', testConnection);
  document.getElementById('lang').addEventListener('change', (e) => {
    applyI18n(e.target.value);
    chrome.runtime.sendMessage({ action: 'setConfig', config: { lang: e.target.value } }); // salva -> vale no popup tambem
  });

  const vol = document.getElementById('volume');
  vol.addEventListener('input', () => updateVolLabel());

  document.querySelectorAll('[data-test]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = document.getElementById(btn.dataset.test).value;
      chrome.runtime.sendMessage({ action: 'testSound', preset, volume: parseFloat(vol.value) });
    });
  });
});

function updateVolLabel() {
  const pct = Math.round(parseFloat(document.getElementById('volume').value) * 100) + '%';
  document.getElementById('volLabel').textContent = pct;
  document.getElementById('volume').setAttribute('aria-valuetext', pct); // leitor de tela le "80%", nao "0.8"
}

function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getConfig' }, (r) => {
    const c = r?.config || {};
    TEXT.forEach(id => { const el = document.getElementById(id); el.value = c[id] || ''; });
    NUM.forEach(id => { const el = document.getElementById(id); if (c[id] != null) el.value = c[id]; });
    SEL.forEach(id => { const el = document.getElementById(id); if (c[id] != null) el.value = String(c[id]); });
    CHK.forEach(id => { const el = document.getElementById(id); el.checked = !!c[id]; });
    document.getElementById('volume').value = c.volume ?? 0.8;
    document.getElementById('maxAgeDays').value = c.maxAgeDays ?? 0;
    updateVolLabel();
    const lang = resolveLang(c.lang);
    document.getElementById('lang').value = lang;
    applyI18n(lang);
  });
}

function saveSettings() {
  const cfg = {};
  TEXT.forEach(id => { cfg[id] = (document.getElementById(id).value || '').trim(); });
  NUM.forEach(id => {
    const el = document.getElementById(id);
    let v = parseInt(el.value, 10) || 30;
    v = Math.min(Math.max(v, parseInt(el.min) || 15), parseInt(el.max) || 3600);
    cfg[id] = v;
  });
  SEL.forEach(id => {
    const v = document.getElementById(id).value;
    cfg[id] = id === 'minSeverity' ? Number(v) : v;
  });
  CHK.forEach(id => { cfg[id] = document.getElementById(id).checked; });
  cfg.volume = parseFloat(document.getElementById('volume').value);
  cfg.maxAgeDays = Math.max(0, parseInt(document.getElementById('maxAgeDays').value, 10) || 0);
  cfg.lang = document.getElementById('lang').value;

  chrome.runtime.sendMessage({ action: 'setConfig', config: cfg }, () => {
    showAlert(t('saved', cfg.lang), 'success');
  });
}

function resetSettings() {
  const lang = document.getElementById('lang').value;
  if (!confirm(t('reset_confirm', lang))) return;
  const defaults = {
    zabbixUrl: '', apiToken: '', excludePatterns: '', maxAgeDays: 0, pollInterval: 15, repeatAlarm: true, repeatInterval: 60,
    minSeverity: 4, soundEnabled: true, notificationsEnabled: true, notifyResolved: true, volume: 0.8,
    soundSev5: 'klaxon', soundSev4: 'siren', soundSev3: 'pulse', soundSev2: 'beepbeep', soundSev1: 'chime',
    ignoreAckd: false, ignoreSuppressed: true, muted: false, lang
  };
  // limpa/ajusta os campos JA (nao depende do callback do background)
  TEXT.forEach(id => { document.getElementById(id).value = defaults[id] || ''; });
  NUM.forEach(id => { document.getElementById(id).value = defaults[id]; });
  SEL.forEach(id => { document.getElementById(id).value = String(defaults[id]); });
  CHK.forEach(id => { document.getElementById(id).checked = !!defaults[id]; });
  document.getElementById('volume').value = defaults.volume; updateVolLabel();
  document.getElementById('maxAgeDays').value = defaults.maxAgeDays;
  chrome.runtime.sendMessage({ action: 'setConfig', config: defaults });
  showAlert(t('reset_done', lang), 'success');
}

function testConnection() {
  const lang = document.getElementById('lang').value;
  const btn = document.getElementById('testBtn');
  const res = document.getElementById('testResult');
  const zabbixUrl = document.getElementById('zabbixUrl').value.trim();
  const apiToken = document.getElementById('apiToken').value.trim();
  if (!zabbixUrl) { res.textContent = '✘ ' + t('zurl', lang); res.style.color = '#ff8a8a'; return; }
  btn.textContent = t('testing', lang); btn.disabled = true; res.textContent = '';

  chrome.runtime.sendMessage({ action: 'testConnection', zabbixUrl, apiToken }, (r) => {
    btn.textContent = t('test', lang); btn.disabled = false;
    if (r?.ok) {
      const via = r.via === 'token' ? t('via_token', lang) : t('via_session', lang);
      const v = r.version ? ` (Zabbix ${r.version})` : '';
      res.textContent = t('conn_ok', lang) + ' - ' + via + v;
      res.style.color = '#22c55e';
    } else {
      res.textContent = '✘ ' + (r?.error || t('err', lang));
      res.style.color = '#ff8a8a';
    }
  });
}

function showAlert(msg, type) {
  const a = document.getElementById('alertArea');
  a.textContent = msg; a.className = 'alert ' + type;
  setTimeout(() => { a.className = 'alert'; }, 5000);
}
