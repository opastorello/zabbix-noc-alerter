// Zabbix NOC Alerter - Popup

const SEV = { 5: ['DIS', 'dis'], 4: ['HIGH', 'high'], 3: ['AVG', 'avg'], 2: ['WARN', 'warn'], 1: ['INFO', 'info'], 0: ['NC', 'info'] };
const MIN_MS = 60000, HOUR_MS = 3600000, DAY_MS = 86400000; // janelas do "ha quanto tempo"
let cfg = {};
let lang = 'pt';

document.addEventListener('DOMContentLoaded', () => {
  lang = resolveLang(); applyI18n(lang); // idioma na hora: global + estaticos juntos (sem mistura PT/EN)
  const pv = document.getElementById('popVer');
  if (pv) pv.textContent = 'v' + chrome.runtime.getManifest().version;
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('refreshBtn').addEventListener('click', () => {
    setStatusText(t('checking', lang));
    chrome.runtime.sendMessage({ action: 'pollNow' }, () => load());
  });
  document.getElementById('testBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'testAlert', preset: cfg.soundSev4 || 'siren', volume: cfg.volume ?? 0.8 });
  });
  document.getElementById('muteBtn').addEventListener('click', toggleMute);
  load();
});

function load() {
  chrome.runtime.sendMessage({ action: 'getConfig' }, (r) => {
    cfg = r?.config || {};
    lang = resolveLang(cfg.lang);
    applyI18n(lang);
    renderMute();
    chrome.runtime.sendMessage({ action: 'getStatus' }, (s) => render(s?.status || {}));
  });
}

function toggleMute() {
  chrome.runtime.sendMessage({ action: 'setMuted', muted: !cfg.muted }, (r) => {
    cfg.muted = r?.muted; renderMute();
  });
}

function renderMute() {
  const b = document.getElementById('muteBtn');
  b.innerHTML = `<span aria-hidden="true">${cfg.muted ? '&#x1f507;' : '&#x1f50a;'}</span>`;
  b.title = t('t_mute', lang);
  b.setAttribute('aria-pressed', String(!!cfg.muted)); // estado on/off pra leitor de tela
  b.classList.toggle('muted', !!cfg.muted);
}

function setStatusText(txt) { document.getElementById('statusBar').textContent = txt; }

function render(st) {
  const bar = document.getElementById('statusBar');
  bar.className = 'status-bar';
  if (!st || st.state === 'unconfigured') {
    bar.classList.add('warn'); bar.textContent = t('cfg_url', lang);
    setCounts({}); renderEmptyState(); return;
  }
  if (st.state === 'no-session') {
    bar.classList.add('warn'); bar.textContent = t('no_session', lang);
    setCounts({}); renderEmptyState(); return;
  }
  if (st.state === 'error') {
    bar.classList.add('err'); bar.textContent = t('err', lang) + ': ' + (st.error || '?');
    setCounts({}); renderList([]); return;
  }
  // ok
  bar.classList.add('ok');
  bar.textContent = `${st.total} ${t('active', lang)} (${st.via === 'token' ? t('via_token', lang) : t('via_session', lang)}) - ${ago(st.ts)}`;
  setCounts(st.bySev || {});
  renderList(st.problems || []);
}

// Estado vazio acionavel (sem URL / sem sessao): botao primario que abre as Opcoes.
function renderEmptyState() {
  const el = document.getElementById('list');
  el.innerHTML = `<div class="empty"><button class="open-btn" id="openSettings">${esc(t('open_settings', lang))}</button></div>`;
  const b = document.getElementById('openSettings');
  if (b) b.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function setCounts(bySev) {
  document.getElementById('cDis').textContent = bySev[5] || 0;
  document.getElementById('cHigh').textContent = bySev[4] || 0;
  document.getElementById('cAvg').textContent = bySev[3] || 0;
  document.getElementById('cWarn').textContent = bySev[2] || 0;
  document.getElementById('cInfo').textContent = (bySev[1] || 0) + (bySev[0] || 0);
}

function renderList(problems) {
  const el = document.getElementById('list');
  if (!problems.length) { el.innerHTML = '<div class="empty">' + esc(t('none', lang)) + ' 🟢</div>'; return; }
  el.innerHTML = problems.map(p => {
    const [lbl, cls] = SEV[p.severity] || ['?', 'info'];
    const tags = (p.acknowledged ? '<span class="tag ackd">&#x2713; ACK</span>' : '')
      + (p.maintenance ? `<span class="tag mnt" title="${t('tag_maint', lang)}">MNT</span>`
        : (p.suppressed ? '<span class="tag">SUP</span>' : ''));
    const ackBtn = p.acknowledged ? '' : `<button class="ackbtn" data-ev="${p.eventid}" title="${t('ack_do', lang)}">ACK</button>`;
    return `<div class="row ${cls}${p.acknowledged ? ' is-ack' : ''}" role="button" tabindex="0" data-ev="${p.eventid}" data-tid="${p.objectid || ''}" data-hostid="${p.hostid || ''}" title="${t('open_problem', lang)}">
      <span class="badge ${cls}">${lbl}</span>
      <div class="txt">
        ${p.host ? `<div class="host">${esc(p.host)}</div>` : ''}
        <div class="name" title="${esc(p.name)}">${esc(p.name)}</div>
        ${p.acknowledged && p.ackmsg ? `<div class="ackinfo" title="${esc(p.ackmsg)}">&#x2713; ${esc(p.ackmsg)}</div>` : ''}
      </div>
      <div class="meta">${tags}${ackBtn}<span class="age">${ago(p.clock * 1000)}</span></div>
    </div>`;
  }).join('');

  el.querySelectorAll('.ackbtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.row');
      const ev = btn.dataset.ev;
      row.classList.add('editing');
      row.innerHTML = `<input class="ackmsg" type="text" maxlength="255" placeholder="${t('ack_ph', lang)}">
        <button class="ackok" title="${t('confirm', lang)}">&#x2713;</button>
        <button class="ackcancel" title="${t('cancel', lang)}">&#x2715;</button>`;
      const input = row.querySelector('.ackmsg');
      input.focus();
      const doAck = () => {
        const message = input.value.trim();
        row.innerHTML = '<span class="sending" role="status" aria-live="polite">' + esc(t('sending', lang)) + '</span>';
        chrome.runtime.sendMessage({ action: 'ackEvent', eventid: ev, message }, (r) => {
          // canal fechado (lastError) sem erro real = ack provavelmente foi -> recarrega
          if (chrome.runtime.lastError || (r && r.ok)) { setTimeout(load, 600); return; }
          const err = (r && r.error) || t('failed', lang);
          row.innerHTML = `<span class="ackerr" role="status" aria-live="assertive" title="${esc(err)}">✘ ${esc(t('err', lang))}: ${esc(err).slice(0, 80)}</span>`;
          setTimeout(load, 4000);
        });
      };
      row.querySelector('.ackok').addEventListener('click', doAck);
      row.querySelector('.ackcancel').addEventListener('click', load);
      input.addEventListener('keydown', (k) => { if (k.key === 'Enter') doAck(); else if (k.key === 'Escape') load(); });
    });
  });

  // abrir o problema exato no Zabbix (clique OU teclado). problemUrl() vem do i18n.js (compartilhada).
  const openRow = (row) => {
    if (row.classList.contains('editing')) return;
    const base = (cfg.zabbixUrl || '').replace(/\/+$/, '');
    if (!base) return;
    const url = problemUrl(base, {
      objectid: row.dataset.tid, eventid: row.dataset.ev,
      hostid: row.dataset.hostid, name: row.querySelector('.name')?.textContent || ''
    });
    chrome.tabs.create({ url });
  };
  el.querySelectorAll('.row[data-ev]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ackbtn') || e.target.closest('.ackmsg')) return;
      openRow(row);
    });
    row.addEventListener('keydown', (e) => {
      if (e.target.closest('.ackbtn') || e.target.closest('.ackmsg')) return;
      if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault(); openRow(row); }
    });
  });
}

function ago(ms) {
  if (!ms) return '';
  const d = Date.now() - ms;
  if (d < MIN_MS) return t('ago_now', lang);
  if (d < HOUR_MS) return Math.floor(d / MIN_MS) + 'm';
  if (d < DAY_MS) return Math.floor(d / HOUR_MS) + 'h';
  return Math.floor(d / DAY_MS) + 'd';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
