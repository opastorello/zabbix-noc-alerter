// Zabbix NOC Alerter - Popup

const SEV = { 5: ['DIS', 'dis'], 4: ['HIGH', 'high'], 3: ['AVG', 'avg'], 2: ['WARN', 'warn'], 1: ['INFO', 'info'], 0: ['NC', 'info'] };
const MIN_MS = 60000, HOUR_MS = 3600000, DAY_MS = 86400000; // janelas do "ha quanto tempo"
let cfg = {};
let lang = 'pt';
let allProblems = []; // lista completa do ultimo status (base pro filtro client-side)
let sevFilter = null;  // filtro por severidade ao clicar numa stat (null | 5 | 4 | 3 | 2 | 'info')

document.addEventListener('DOMContentLoaded', () => {
  lang = resolveLang(); applyI18n(lang); // idioma na hora: global + estaticos juntos (sem mistura PT/EN)
  const pv = document.getElementById('popVer');
  if (pv) pv.textContent = 'v' + chrome.runtime.getManifest().version;
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('refreshBtn').addEventListener('click', () => {
    setStatusText(t('checking', lang));
    chrome.runtime.sendMessage({ action: 'pollNow' }, () => load());
  });
  document.getElementById('muteBtn').addEventListener('click', toggleMute);
  const fb = document.getElementById('filterBox');
  fb.addEventListener('input', applyFilter);
  fb.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fb.value = ''; applyFilter(); } });
  document.querySelectorAll('.stats-row .stat').forEach(s => s.addEventListener('click', () => {
    const v = s.dataset.sev === 'info' ? 'info' : Number(s.dataset.sev);
    sevFilter = (sevFilter === v) ? null : v; // clica de novo = limpa
    applyFilter();
  }));
  document.getElementById('sortBy').addEventListener('change', applyFilter);
  document.getElementById('groupBy').addEventListener('change', applyFilter);
  load();
});

function load() {
  chrome.runtime.sendMessage({ action: 'getConfig' }, (r) => {
    cfg = r?.config || {};
    lang = resolveLang(cfg.lang);
    applyI18n(lang);
    renderMute();
    chrome.runtime.sendMessage({ action: 'getStatus' }, (s) => {
      render(s?.status || {});
      // status vencido (navegador recem-aberto, service worker dormiu, 1o poll falhou):
      // re-consulta sozinho em vez de esperar o usuario clicar em "checar agora".
      const ts = s?.status?.ts || 0;
      const staleMs = Math.max(5, Number(cfg.pollInterval) || 15) * 2 * 1000;
      if (Date.now() - ts > staleMs) {
        chrome.runtime.sendMessage({ action: 'pollNow' }, (r) => { if (r?.status) render(r.status); });
      }
    });
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
  const fr = document.getElementById('filterRow');
  if (!st || st.state === 'unconfigured') {
    bar.classList.add('warn'); bar.textContent = t('cfg_url', lang);
    setCounts({}); fr.style.display = 'none'; renderEmptyState(); return;
  }
  if (st.state === 'no-session') {
    bar.classList.add('warn'); bar.textContent = t('no_session', lang);
    setCounts({}); fr.style.display = 'none'; renderEmptyState(); return;
  }
  if (st.state === 'error') {
    bar.classList.add('err'); bar.textContent = t('err', lang) + ': ' + (st.error || '?');
    setCounts({}); fr.style.display = 'none'; allProblems = []; renderList([]); return;
  }
  // ok - multi-instance status
  bar.classList.add('ok');
  const instInfo = buildInstInfo(st.instStatus);
  bar.textContent = `${st.total} ${t('active', lang)} ${instInfo} - ${ago(st.ts)}`;
  setCounts(st.bySev || {});
  allProblems = st.problems || [];
  fr.style.display = allProblems.length ? '' : 'none'; // so mostra o filtro quando ha o que filtrar
  applyFilter();
}

// filtro client-side por host OU nome do problema (instantaneo, sem novo poll)
function applyFilter() {
  const term = (document.getElementById('filterBox').value || '').trim().toLowerCase();
  let list = allProblems;
  if (sevFilter !== null) list = list.filter(p => sevFilter === 'info' ? Number(p.severity) <= 1 : Number(p.severity) === sevFilter);
  if (term) list = list.filter(p => ((p.host || '') + ' ' + (p.name || '')).toLowerCase().includes(term));
  // destaca a stat de severidade ativa
  document.querySelectorAll('.stats-row .stat').forEach(s => {
    const v = s.dataset.sev === 'info' ? 'info' : Number(s.dataset.sev);
    s.classList.toggle('active', sevFilter === v);
  });
  // ordenacao: severidade (padrao), idade (mais antigos primeiro) ou host (A-Z)
  const sortBy = document.getElementById('sortBy').value;
  list = list.slice().sort((a, b) =>
    sortBy === 'host' ? ((a.host || '').localeCompare(b.host || '') || Number(b.severity) - Number(a.severity))
    : sortBy === 'age' ? (Number(a.clock) - Number(b.clock))
    : (Number(b.severity) - Number(a.severity) || Number(b.clock) - Number(a.clock)));
  renderList(list, !!term || sevFilter !== null, document.getElementById('groupBy').value);
}

function buildInstInfo(instStatus) {
  if (!instStatus) return '';
  const entries = Object.values(instStatus).filter(s => s && s.label);
  if (entries.length <= 1) {
    const e = entries[0];
    return e ? `(${e.via === 'token' ? t('via_token', lang) : t('via_session', lang)})` : '';
  }
  // multi: mostra quantas OK
  const ok = entries.filter(e => e.state === 'ok').length;
  return `(${ok}/${entries.length} OK)`;
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

function renderList(problems, filtered, groupBy) {
  const el = document.getElementById('list');
  if (!problems.length) {
    el.innerHTML = '<div class="empty">' + (filtered ? esc(t('no_match', lang)) : esc(t('none', lang)) + ' 🟢') + '</div>';
    return;
  }
  // detectar se multi-instance (para mostrar o badge da instancia em cada linha)
  const multiInst = new Set(problems.map(p => p.instId)).size > 1;
  const rowHtml = (p) => {
    const [lbl, cls] = SEV[p.severity] || ['?', 'info'];
    const snoozed = p.snoozedUntil && p.snoozedUntil > Date.now();
    const instBadge = (multiInst && p.instLabel) ? `<span class="inst-badge">${esc(p.instLabel)}</span>` : '';
    const tags = (p.acknowledged ? '<span class="tag ackd">&#x2713; ACK</span>' : '')
      + (p.maintenance ? `<span class="tag mnt" title="${t('tag_maint', lang)}">MNT</span>`
        : (p.suppressed ? '<span class="tag">SUP</span>' : ''));
    const snzBtn = snoozed
      ? `<button class="snzbtn snoozed" data-ev="${p.eventid}" data-inst="${p.instId || ''}" title="${t('snz_wake', lang)}">SNZ ${snzRemain(p.snoozedUntil)}</button>`
      : (p.acknowledged ? '' : `<button class="snzbtn" data-ev="${p.eventid}" data-inst="${p.instId || ''}" title="${t('snz_do', lang)}">SNZ</button>`);
    const ackBtn = p.acknowledged ? '' : `<button class="ackbtn" data-ev="${p.eventid}" data-inst="${p.instId || ''}" title="${t('ack_do', lang)}">ACK</button>`;
    return `<div class="row ${cls}${p.acknowledged ? ' is-ack' : ''}${snoozed ? ' is-snoozed' : ''}" role="button" tabindex="0" data-ev="${p.eventid}" data-tid="${p.objectid || ''}" data-hostid="${p.hostid || ''}" data-inst="${p.instId || ''}" title="${t('open_problem', lang)}">
      <span class="badge ${cls}">${lbl}</span>
      <div class="txt">
        ${p.host ? `<div class="host">${instBadge}${esc(p.host)}</div>` : (instBadge ? `<div class="host">${instBadge}</div>` : '')}
        <div class="name" title="${esc(p.name)}">${esc(p.name)}</div>
        ${p.acknowledged && p.ackmsg ? `<div class="ackinfo" title="${esc(p.ackmsg)}">&#x2713; ${esc(p.ackmsg)}</div>` : ''}
      </div>
      <div class="meta">${tags}${snzBtn}${ackBtn}<span class="age">${ago(p.clock * 1000)}</span></div>
    </div>`;
  };

  if (groupBy === 'host' || groupBy === 'instance') {
    // agrupa preservando a ordem (ja filtrada/ordenada) dentro de cada grupo
    const groups = new Map();
    for (const p of problems) {
      const key = groupBy === 'instance' ? (p.instId || '') : (p.host || '');
      const label = groupBy === 'instance' ? (p.instLabel || '?') : (p.host || t('no_host', lang));
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key).items.push(p);
    }
    const maxSev = (items) => items.reduce((m, p) => Math.max(m, Number(p.severity)), 0);
    const ordered = [...groups.values()].sort((a, b) => maxSev(b.items) - maxSev(a.items)); // grupo mais severo no topo
    el.innerHTML = ordered.map(g => {
      const [, gcls] = SEV[maxSev(g.items)] || ['?', 'info'];
      return `<div class="grp">
        <div class="grp-head ${gcls}" role="button" tabindex="0" title="${t('grp_toggle', lang)}"><span class="grp-caret">&#x25BE;</span><span class="grp-name" title="${esc(g.label)}">${esc(g.label)}</span><span class="grp-count">${g.items.length}</span></div>
        <div class="grp-body">${g.items.map(rowHtml).join('')}</div>
      </div>`;
    }).join('');
    el.querySelectorAll('.grp-head').forEach(h => {
      const toggle = () => h.parentElement.classList.toggle('collapsed');
      h.addEventListener('click', toggle);
      h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  } else {
    el.innerHTML = problems.map(rowHtml).join('');
  }

  el.querySelectorAll('.ackbtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.row');
      const ev = btn.dataset.ev;
      const instId = btn.dataset.inst || row.dataset.inst || '';
      row.style.minHeight = row.offsetHeight + 'px'; // trava a altura: o editor nao encolhe a linha
      row.classList.add('editing');
      row.innerHTML = `<input class="ackmsg" type="text" maxlength="255" placeholder="${t('ack_ph', lang)}">
        <button class="ackok" title="${t('confirm', lang)}">&#x2713;</button>
        <button class="ackcancel" title="${t('cancel', lang)}">&#x2715;</button>`;
      const input = row.querySelector('.ackmsg');
      input.focus();
      const doAck = () => {
        const message = input.value.trim();
        row.innerHTML = '<span class="sending" role="status" aria-live="polite">' + esc(t('sending', lang)) + '</span>';
        chrome.runtime.sendMessage({ action: 'ackEvent', eventid: ev, instId, message }, (r) => {
          if (chrome.runtime.lastError || (r && r.ok)) { setTimeout(load, 600); return; }
          const err = (r && r.error) || t('failed', lang);
          row.innerHTML = `<span class="ackerr" role="status" aria-live="assertive" title="${esc(err)}">\u2718 ${esc(t('err', lang))}: ${esc(err).slice(0, 80)}</span>`;
          setTimeout(load, 4000);
        });
      };
      row.querySelector('.ackok').addEventListener('click', doAck);
      row.querySelector('.ackcancel').addEventListener('click', load);
      input.addEventListener('keydown', (k) => { if (k.key === 'Enter') doAck(); else if (k.key === 'Escape') load(); });
    });
  });

  // snooze: 💤 abre presets (15m/1h/4h); se ja snoozado, o botao "acorda"
  el.querySelectorAll('.snzbtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ev = btn.dataset.ev;
      const instId = btn.dataset.inst || '';
      if (btn.classList.contains('snoozed')) { // ja snoozado -> acordar
        chrome.runtime.sendMessage({ action: 'snoozeEvent', eventid: ev, instId, ms: 0 }, () => setTimeout(load, 300));
        return;
      }
      const row = btn.closest('.row');
      row.style.minHeight = row.offsetHeight + 'px'; // trava a altura: o picker nao encolhe a linha
      row.classList.add('editing');
      row.innerHTML = `<button class="snzopt" data-ms="900000">15 min</button>
        <button class="snzopt" data-ms="1800000">30 min</button>
        <button class="snzopt" data-ms="3600000">1 h</button>
        <button class="snzopt" data-ms="7200000">2 h</button>
        <button class="snzopt" data-ms="14400000">4 h</button>
        <button class="snzx" title="${t('cancel', lang)}">&#x2715;</button>`;
      row.querySelectorAll('.snzopt').forEach(opt => opt.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'snoozeEvent', eventid: ev, instId, ms: Number(opt.dataset.ms) }, () => setTimeout(load, 300));
      }));
      row.querySelector('.snzx').addEventListener('click', load);
    });
  });

  // abrir o problema exato no Zabbix (clique OU teclado). problemUrl() vem do i18n.js (compartilhada).
  const openRow = (row) => {
    if (row.classList.contains('editing')) return;
    // encontrar a URL base da instancia correta
    const instId = row.dataset.inst || '';
    const instances = (cfg.instances || []);
    const inst = instances.find(i => i.id === instId) || instances[0];
    const base = inst ? (inst.url || '').replace(/\/+$/, '') : (cfg.zabbixUrl || '').replace(/\/+$/, '');
    if (!base) return;
    const url = problemUrl(base, {
      objectid: row.dataset.tid, eventid: row.dataset.ev,
      hostid: row.dataset.hostid, name: row.querySelector('.name')?.textContent || ''
    });
    chrome.tabs.create({ url });
  };
  el.querySelectorAll('.row[data-ev]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ackbtn') || e.target.closest('.ackmsg') || e.target.closest('.snzbtn')) return;
      openRow(row);
    });
    row.addEventListener('keydown', (e) => {
      if (e.target.closest('.ackbtn') || e.target.closest('.ackmsg') || e.target.closest('.snzbtn')) return;
      if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault(); openRow(row); }
    });
  });
}

// tempo restante do snooze, curto (ex.: 45m, 3h)
function snzRemain(untilTs) {
  const d = untilTs - Date.now();
  if (d <= 0) return '';
  if (d < HOUR_MS) return Math.max(1, Math.round(d / MIN_MS)) + 'm';
  return Math.round(d / HOUR_MS) + 'h';
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
