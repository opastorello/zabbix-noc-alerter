// Zabbix NOC Alerter - Options (Multi-Instance)

const SOUNDS = [
  'klaxon', 'siren', 'airraid', 'slowwhoop', 'twotone', 'warble', 'whoop', 'woop',
  't3', 'eas', 'redalert', 'sos', 'pulse', 'beepbeep', 'digital', 'chirp', 'microwave',
  'truck', 'ekg', 'radar', 'sonar', 'bell', 'alarmclock', 'trill', 'airhorn',
  'foghorn', 'submarine', 'steamwhistle', 'caralarm', 'laser', 'phaser', 'ascending',
  'descending', 'nuclear', 'industrial', 'gong', 'oldphone', 'seatbelt', 'buzzer',
  'flatline', 'chime'
];
const MAX_INSTANCES = 8;
const NUM = ['pollInterval', 'repeatInterval'];
const SEL = ['minSeverity', 'soundSev5', 'soundSev4', 'soundSev3', 'soundSev2', 'soundSev1'];
const CHK = ['soundEnabled', 'notificationsEnabled', 'notifyResolved', 'badgeUnseen', 'repeatAlarm', 'nagNotify', 'suppressDuringMeeting', 'meetSuppressNotif', 'meetSuppressSound', 'workingTimeOnly', 'ignoreAckd', 'ignoreSuppressed', 'ignoreMaintenance'];

let currentLang = 'pt';

document.addEventListener('DOMContentLoaded', () => {
  populateLangSelect(document.getElementById('lang')); // idiomas gerados do i18n.js (auto-extensivel)
  applyI18n(resolveLang()); // aplica o idioma na hora (evita flash sem acento)
  // versao: fonte unica = manifest.json (versao completa, ex.: v0.1.1)
  const ver = 'v' + chrome.runtime.getManifest().version;
  document.getElementById('appVer').textContent = ver;
  const vf = document.getElementById('appVerFoot'); if (vf) vf.textContent = ver;

  ['soundSev5', 'soundSev4', 'soundSev3', 'soundSev2', 'soundSev1'].forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = SOUNDS.map(s => `<option value="${s}">${s}</option>`).join('');
  });

  loadSettings();
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  document.getElementById('exportBtn').addEventListener('click', exportSettings);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => { if (e.target.files[0]) importSettings(e.target.files[0]); e.target.value = ''; });
  document.getElementById('addInstanceBtn').addEventListener('click', addInstance); // teste por instancia fica no card (.inst-test-btn)
  document.getElementById('lang').addEventListener('change', (e) => {
    currentLang = e.target.value;
    applyI18n(currentLang);
    chrome.runtime.sendMessage({ action: 'setConfig', config: { lang: currentLang } });
  });

  const vol = document.getElementById('volume');
  vol.addEventListener('input', () => updateVolLabel());

  const syncMeetSub = () => {
    const on = document.getElementById('suppressDuringMeeting').checked;
    document.getElementById('meetSubOptions').classList.toggle('hidden', !on);
    // ligar o modo reuniao com as duas sub-opcoes desmarcadas seria um no-op -> marca as duas
    const notif = document.getElementById('meetSuppressNotif'), sound = document.getElementById('meetSuppressSound');
    if (on && !notif.checked && !sound.checked) { notif.checked = true; sound.checked = true; }
  };
  document.getElementById('suppressDuringMeeting').addEventListener('change', syncMeetSub);

  document.querySelectorAll('[data-test]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = document.getElementById(btn.dataset.test).value;
      chrome.runtime.sendMessage({ action: 'testSound', preset, volume: parseFloat(vol.value) });
    });
  });
});

// Valida se o Working time do servidor e legivel pela API. Se nao for (sem instancia,
// sem permissao no settings.get, Zabbix < 6.0), desativa o checkbox: a opcao nao teria efeito.
function checkWorkPeriod() {
  const chk = document.getElementById('workingTimeOnly');
  const st = document.getElementById('workTimeStatus');
  st.textContent = t('testing', currentLang);
  chrome.runtime.sendMessage({ action: 'getWorkPeriod' }, (r) => {
    if (r?.ok) {
      chk.disabled = false;
      // um item por instancia legivel: "1-5,09:00-18:00 (PRD), 1-5,08:00-17:00 (HML)"
      st.textContent = t('work_time_srv', currentLang) +
        (r.list || []).map(i => (i.period || '-') + (i.label ? ' (' + i.label + ')' : '')).join(', ');
    } else {
      chk.disabled = true;
      chk.checked = false;
      st.textContent = t('work_time_na', currentLang) + (r?.error ? ' [' + r.error + ']' : '');
    }
  });
}

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
    container.innerHTML = `<div class="inst-empty-state">${esc(t('inst_empty', currentLang))}</div>`;
  } else {
    instances.forEach((inst, idx) => {
      const card = createInstanceCard(inst, idx);
      card.classList.add('collapsed'); // ao acessar, toda instancia comeca recolhida (clique no cabecalho expande)
      container.appendChild(card);
    });
  }
  // esconder botao de adicionar se ja atingiu o teto
  const addBtn = document.getElementById('addInstanceBtn');
  addBtn.style.display = (instances || []).length >= MAX_INSTANCES ? 'none' : '';
}

// titulo do cabecalho do card: o rotulo, ou "Rotulo N" quando vazio
function instCardTitle(card) {
  return t('inst_label', currentLang) + ' ' + (Number(card.dataset.idx) + 1);
}

function createInstanceCard(inst, idx) {
  const card = document.createElement('div');
  card.className = 'inst-card' + (inst.enabled ? '' : ' disabled');
  card.dataset.idx = idx;
  const hasLabel = (inst.label || '').trim();
  card.innerHTML = `
    <div class="inst-header">
      <button type="button" class="inst-toggle" data-i18n-title="inst_toggle" data-i18n-aria="inst_toggle" title="${esc(t('inst_toggle', currentLang))}">&#x25BE;</button>
      <span class="inst-num">#${idx + 1}</span>
      <span class="inst-title${hasLabel ? '' : ' empty'}">${esc(hasLabel || (t('inst_label', currentLang) + ' ' + (idx + 1)))}</span>
      <label class="check inst-enabled-wrap">
        <input type="checkbox" class="inst-enabled" ${inst.enabled ? 'checked' : ''}>
        <span>${esc(t('inst_enabled', currentLang))}</span>
      </label>
    </div>
    <div class="inst-body">
      <div class="inst-field">
        <label>${esc(t('inst_label', currentLang))}</label>
        <input type="text" class="inst-label-input" value="${esc(inst.label || '')}" placeholder="${esc(t('inst_label_ph', currentLang))}" maxlength="20">
      </div>
      <div class="inst-field">
        <label>${esc(t('inst_url', currentLang))}</label>
        <input type="text" class="inst-url" value="${esc(inst.url || '')}" placeholder="https://zabbix.empresa.com" autocomplete="off">
      </div>
      <div class="inst-field">
        <label>${esc(t('inst_token', currentLang))}</label>
        <input type="password" class="inst-token" value="${esc(inst.token || '')}" placeholder="${esc(t('token_ph', currentLang))}" autocomplete="off">
      </div>
      <div class="inst-field">
        <label>${esc(t('inst_groups', currentLang))}</label>
        <input type="text" class="inst-groups" value="${esc(inst.hostGroups || '')}" placeholder="${esc(t('inst_groups_ph', currentLang))}" autocomplete="off">
        <div class="desc">${esc(t('inst_groups_desc', currentLang))}</div>
      </div>
      <div class="inst-actions">
        <button class="btn-test inst-test-btn">${esc(t('inst_test', currentLang))}</button>
        <span class="inst-status"></span>
        <button class="btn-danger inst-remove-btn">${esc(t('inst_remove', currentLang))}</button>
      </div>
    </div>`;

  const titleEl = card.querySelector('.inst-title');
  // colapsar/expandir clicando no cabecalho (menos nos controles de ativar)
  card.querySelector('.inst-header').addEventListener('click', () => card.classList.toggle('collapsed'));
  // o toggle de "ativa" nao deve disparar o colapso
  card.querySelector('.inst-enabled-wrap').addEventListener('click', (e) => e.stopPropagation());
  card.querySelector('.inst-enabled').addEventListener('change', (e) => {
    card.classList.toggle('disabled', !e.target.checked);
  });
  // o titulo do cabecalho acompanha o rotulo digitado
  card.querySelector('.inst-label-input').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    titleEl.textContent = v || instCardTitle(card);
    titleEl.classList.toggle('empty', !v);
  });
  card.querySelector('.inst-test-btn').addEventListener('click', () => testInstance(card));
  card.querySelector('.inst-remove-btn').addEventListener('click', () => removeInstance(card));
  return card;
}

function addInstance() {
  const container = document.getElementById('instancesContainer');
  const empty = container.querySelector('.inst-empty-state');
  if (empty) empty.remove(); // tira o placeholder de "nenhuma instancia"
  const current = container.querySelectorAll('.inst-card').length;
  if (current >= MAX_INSTANCES) return;
  const idx = current;
  const inst = { id: 'inst' + (Date.now() % 100000), label: '', url: '', token: '', enabled: true };
  container.appendChild(createInstanceCard(inst, idx)); // novo card ja vem expandido
  // atualizar visibilidade do botao
  document.getElementById('addInstanceBtn').style.display = (idx + 1) >= MAX_INSTANCES ? 'none' : '';
}

function removeInstance(card) {
  card.remove();
  const container = document.getElementById('instancesContainer');
  const cards = container.querySelectorAll('.inst-card');
  if (!cards.length) { renderInstances([]); return; } // voltou a zero -> mostra o placeholder
  // re-numerar (e atualizar o titulo dos que estao sem rotulo)
  cards.forEach((c, i) => {
    c.dataset.idx = i;
    c.querySelector('.inst-num').textContent = '#' + (i + 1);
    const titleEl = c.querySelector('.inst-title');
    if (titleEl.classList.contains('empty')) titleEl.textContent = instCardTitle(c);
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
      hostGroups: card.querySelector('.inst-groups').value.trim(),
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
    document.getElementById('meetSubOptions').classList.toggle('hidden', !c.suppressDuringMeeting);
    document.getElementById('volume').value = c.volume ?? 0.8;
    document.getElementById('maxAgeDays').value = c.maxAgeDays ?? 0;
    document.getElementById('excludePatterns').value = c.excludePatterns || '';
    updateVolLabel();
    checkWorkPeriod(); // depois de aplicar o config: valida/desativa o checkbox de working time
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
    checkWorkPeriod(); // instancias podem ter mudado -> revalida o working time
  });
}

function resetSettings() {
  if (!confirm(t('reset_confirm', currentLang))) return;
  const defaults = {
    instances: [], excludePatterns: '', maxAgeDays: 0, pollInterval: 15, repeatAlarm: true, nagNotify: true, repeatInterval: 60,
    minSeverity: 4, soundEnabled: true, notificationsEnabled: true, notifyResolved: true, volume: 0.8,
    soundSev5: 'klaxon', soundSev4: 'siren', soundSev3: 'pulse', soundSev2: 'beepbeep', soundSev1: 'chime',
    ignoreAckd: false, ignoreSuppressed: true, ignoreMaintenance: true, badgeUnseen: false, muted: false,
    suppressDuringMeeting: true, meetSuppressNotif: true, meetSuppressSound: true, workingTimeOnly: false, lang: currentLang
  };
  chrome.runtime.sendMessage({ action: 'setConfig', config: defaults }, () => {
    loadSettings();
    showAlert(t('reset_done', currentLang), 'success');
  });
}

function exportSettings() {
  chrome.runtime.sendMessage({ action: 'getConfig' }, (r) => {
    const cfg = { ...(r?.config || {}) };
    delete cfg.apiToken; // legado: nao exporta o segredo
    delete cfg.muted;    // estado transitorio
    // multi-instancia: nao exporta os tokens das instancias (segredo)
    if (Array.isArray(cfg.instances)) cfg.instances = cfg.instances.map(i => ({ ...i, token: '' }));
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zabbix-noc-alerter-settings.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function importSettings(file) {
  const lang = document.getElementById('lang').value;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid');
      delete data.apiToken; // import nunca sobrescreve o token do usuario
      chrome.runtime.sendMessage({ action: 'setConfig', config: data }, () => {
        loadSettings();
        showAlert(t('import_ok', lang), 'success');
      });
    } catch (e) {
      showAlert(t('import_err', lang), 'error');
    }
  };
  reader.readAsText(file);
}

function showAlert(msg, type) {
  const a = document.getElementById('alertArea');
  a.textContent = msg; a.className = 'alert ' + type;
  setTimeout(() => { a.className = 'alert'; }, 5000);
}

function esc(s) { const d = document.createElement('span'); d.textContent = s || ''; return d.innerHTML.replace(/"/g, '&quot;'); }
