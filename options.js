// Zabbix NOC Alerter - Options (Multi-Instance)

const SOUNDS = [
  'klaxon', 'siren', 'airraid', 'slowwhoop', 'twotone', 'warble', 'whoop', 'woop',
  't3', 'eas', 'redalert', 'sos', 'pulse', 'beepbeep', 'digital', 'chirp', 'microwave',
  'truck', 'ekg', 'radar', 'sonar', 'bell', 'alarmclock', 'trill', 'airhorn',
  'foghorn', 'submarine', 'steamwhistle', 'caralarm', 'laser', 'phaser', 'ascending',
  'descending', 'nuclear', 'industrial', 'gong', 'oldphone', 'seatbelt', 'buzzer',
  'flatline', 'chime'
];
const MAX_INSTANCES = 4;
const NUM = ['pollInterval', 'repeatInterval'];
const SEL = ['minSeverity', 'soundSev5', 'soundSev4', 'soundSev3', 'soundSev2', 'soundSev1'];
const CHK = ['soundEnabled', 'notificationsEnabled', 'notifyResolved', 'repeatAlarm', 'ignoreAckd', 'ignoreSuppressed'];

let currentLang = 'pt';

document.addEventListener('DOMContentLoaded', () => {
  populateLangSelect(document.getElementById('lang'));
  applyI18n(resolveLang());
  const ver = 'v' + chrome.runtime.getManifest().version.split('.').slice(0, 2).join('.');
  document.getElementById('appVer').textContent = ver;
  const vf = document.getElementById('appVerFoot'); if (vf) vf.textContent = ver;

  ['soundSev5', 'soundSev4', 'soundSev3', 'soundSev2', 'soundSev1'].forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = SOUNDS.map(s => `<option value="${s}">${s}</option>`).join('');
  });

  loadSettings();
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  document.getElementById('addInstanceBtn').addEventListener('click', addInstance);
  document.getElementById('lang').addEventListener('change', (e) => {
    currentLang = e.target.value;
    applyI18n(currentLang);
    chrome.runtime.sendMessage({ action: 'setConfig', config: { lang: currentLang } });
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
  document.getElementById('volume').setAttribute('aria-valuetext', pct);
}

// =====================================================
// Instance rendering
// =====================================================
function renderInstances(instances) {
  const container = document.getElementById('instancesContainer');
  container.innerHTML = '';
  if (!instances || !instances.length) {
    container.innerHTML = `<div class="desc" style="text-align:center;padding:12px;">${esc(t('inst_empty', currentLang))}</div>`;
  } else {
    instances.forEach((inst, idx) => container.appendChild(createInstanceCard(inst, idx)));
  }
  // esconder botao de adicionar se ja tem 4
  const addBtn = document.getElementById('addInstanceBtn');
  addBtn.style.display = (instances || []).length >= MAX_INSTANCES ? 'none' : '';
}

function createInstanceCard(inst, idx) {
  const card = document.createElement('div');
  card.className = 'inst-card' + (inst.enabled ? '' : ' disabled');
  card.dataset.idx = idx;
  card.innerHTML = `
    <div class="inst-header">
      <span class="inst-num">#${idx + 1}</span>
      <label class="check" style="margin:0;font-size:11px;">
        <input type="checkbox" class="inst-enabled" ${inst.enabled ? 'checked' : ''}>
        <span>${esc(t('inst_enabled', currentLang))}</span>
      </label>
    </div>
    <div class="inst-row">
      <div class="field">
        <label>${esc(t('inst_label', currentLang))}</label>
        <input type="text" class="inst-label-input" value="${esc(inst.label || '')}" placeholder="${esc(t('inst_label_ph', currentLang))}" maxlength="20">
      </div>
    </div>
    <div class="inst-row">
      <div class="field" style="flex:2;">
        <label>${esc(t('inst_url', currentLang))}</label>
        <input type="text" class="inst-url" value="${esc(inst.url || '')}" placeholder="https://zabbix.empresa.com" autocomplete="off">
      </div>
    </div>
    <div class="inst-row">
      <div class="field" style="flex:2;">
        <label>${esc(t('inst_token', currentLang))}</label>
        <input type="password" class="inst-token" value="${esc(inst.token || '')}" placeholder="${esc(t('token_ph', currentLang))}" autocomplete="off">
      </div>
    </div>
    <div class="inst-actions">
      <button class="btn-mini inst-test-btn">${esc(t('inst_test', currentLang))}</button>
      <span class="inst-status" style="font-size:10px;"></span>
      <button class="btn-mini inst-remove-btn" style="margin-left:auto;color:#ff8a8a;">${esc(t('inst_remove', currentLang))}</button>
    </div>`;

  // eventos
  card.querySelector('.inst-enabled').addEventListener('change', (e) => {
    card.classList.toggle('disabled', !e.target.checked);
  });
  card.querySelector('.inst-test-btn').addEventListener('click', () => testInstance(card));
  card.querySelector('.inst-remove-btn').addEventListener('click', () => removeInstance(card));
  return card;
}

function addInstance() {
  const container = document.getElementById('instancesContainer');
  const current = container.querySelectorAll('.inst-card').length;
  if (current >= MAX_INSTANCES) return;
  const idx = current;
  const inst = { id: 'inst' + (Date.now() % 100000), label: '', url: '', token: '', enabled: true };
  container.appendChild(createInstanceCard(inst, idx));
  // atualizar visibilidade do botao
  document.getElementById('addInstanceBtn').style.display = (idx + 1) >= MAX_INSTANCES ? 'none' : '';
}

function removeInstance(card) {
  card.remove();
  // re-numerar
  const container = document.getElementById('instancesContainer');
  container.querySelectorAll('.inst-card').forEach((c, i) => {
    c.dataset.idx = i;
    c.querySelector('.inst-num').textContent = '#' + (i + 1);
  });
  document.getElementById('addInstanceBtn').style.display = '';
}

function testInstance(card) {
  const url = card.querySelector('.inst-url').value.trim();
  const token = card.querySelector('.inst-token').value.trim();
  const statusEl = card.querySelector('.inst-status');
  if (!url) { statusEl.textContent = '\u2718 ' + t('e_nourl', currentLang); statusEl.style.color = '#ff8a8a'; return; }
  statusEl.textContent = t('testing', currentLang); statusEl.style.color = '';
  chrome.runtime.sendMessage({ action: 'testConnection', zabbixUrl: url, apiToken: token, instId: 'test' }, (r) => {
    if (r?.ok) {
      const via = r.via === 'token' ? t('via_token', currentLang) : t('via_session', currentLang);
      const v = r.version ? ` (v${r.version})` : '';
      statusEl.textContent = '\u2713 ' + via + v;
      statusEl.style.color = '#22c55e';
    } else {
      statusEl.textContent = '\u2718 ' + (r?.error || t('err', currentLang));
      statusEl.style.color = '#ff8a8a';
    }
  });
}

// =====================================================
// Collect instances from DOM
// =====================================================
function collectInstances() {
  const cards = document.querySelectorAll('#instancesContainer .inst-card');
  const instances = [];
  cards.forEach((card, idx) => {
    instances.push({
      id: 'inst' + (idx + 1),
      label: card.querySelector('.inst-label-input').value.trim() || ('Zabbix ' + (idx + 1)),
      url: card.querySelector('.inst-url').value.trim(),
      token: card.querySelector('.inst-token').value.trim(),
      enabled: card.querySelector('.inst-enabled').checked
    });
  });
  return instances;
}

// =====================================================
// Load / Save / Reset
// =====================================================
function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getConfig' }, (r) => {
    const c = r?.config || {};
    currentLang = resolveLang(c.lang);
    document.getElementById('lang').value = currentLang;
    applyI18n(currentLang);

    // Instances
    renderInstances(c.instances || []);

    // Global settings
    NUM.forEach(id => { const el = document.getElementById(id); if (c[id] != null) el.value = c[id]; });
    SEL.forEach(id => { const el = document.getElementById(id); if (c[id] != null) el.value = String(c[id]); });
    CHK.forEach(id => { const el = document.getElementById(id); el.checked = !!c[id]; });
    document.getElementById('volume').value = c.volume ?? 0.8;
    document.getElementById('maxAgeDays').value = c.maxAgeDays ?? 0;
    document.getElementById('excludePatterns').value = c.excludePatterns || '';
    updateVolLabel();
  });
}

function saveSettings() {
  const cfg = {};
  cfg.instances = collectInstances();
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
  cfg.excludePatterns = document.getElementById('excludePatterns').value.trim();
  cfg.lang = document.getElementById('lang').value;

  chrome.runtime.sendMessage({ action: 'setConfig', config: cfg }, () => {
    showAlert(t('saved', cfg.lang), 'success');
  });
}

function resetSettings() {
  if (!confirm(t('reset_confirm', currentLang))) return;
  const defaults = {
    instances: [], excludePatterns: '', maxAgeDays: 0, pollInterval: 15, repeatAlarm: true, repeatInterval: 60,
    minSeverity: 4, soundEnabled: true, notificationsEnabled: true, notifyResolved: true, volume: 0.8,
    soundSev5: 'klaxon', soundSev4: 'siren', soundSev3: 'pulse', soundSev2: 'beepbeep', soundSev1: 'chime',
    ignoreAckd: false, ignoreSuppressed: true, muted: false, lang: currentLang
  };
  chrome.runtime.sendMessage({ action: 'setConfig', config: defaults }, () => {
    loadSettings();
    showAlert(t('reset_done', currentLang), 'success');
  });
}

function showAlert(msg, type) {
  const a = document.getElementById('alertArea');
  a.textContent = msg; a.className = 'alert ' + type;
  setTimeout(() => { a.className = 'alert'; }, 5000);
}

function esc(s) { const d = document.createElement('span'); d.textContent = s || ''; return d.innerHTML.replace(/"/g, '&quot;'); }
