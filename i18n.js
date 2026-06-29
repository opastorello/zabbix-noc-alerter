// Zabbix NOC Alerter - i18n
//
// Para adicionar um idioma: copie um bloco abaixo, traduza os valores, e adicione
// o nome do idioma em LANG_NAMES. O seletor de idioma e tudo o mais se ajusta sozinho.

const I18N = {
  pt: {
    conn: 'Conexão', zurl: 'URL do Zabbix', zurl_ph: 'https://zabbix.suaempresa.com',
    zurl_desc: 'Só o endereço base (sem /zabbix.php). Você define; nada vem hardcoded.',
    token: 'Token de API (opcional)', token_ph: 'deixe vazio para usar a sessão aberta',
    token_desc: 'Vazio = usa o cookie da sessão logada no navegador (sem token).',
    test: 'Testar conexão', mon: 'Monitoramento', interval: 'Intervalo de checagem (seg)',
    interval_desc: 'A cada quantos segundos checa o Zabbix (mín 5s).',
    minsev: 'Severidade mínima', minsev_desc: 'Só alerta deste nível pra cima.',
    sev0: 'Não classificada+', sev1: 'Informação+', sev2: 'Aviso (warning)+', sev3: 'Média (average)+', sev4: 'Alta (high)+', sev5: 'Desastre (disaster)',
    ign_sup: 'Ignorar problemas suprimidos', ign_maint: 'Ignorar problemas em manutenção', tag_maint: 'Em manutenção', ign_ack: 'Ignorar problemas já reconhecidos (ack)',
    exclude: 'Excluir (nome ou host contém)', exclude_ph: '[ANTIGO], Desmobilizado, Unavailable by ICMP', exclude_desc: 'Esconde problemas cujo nome OU host contém qualquer um destes textos (vírgula ou linha; ignora maiúsc/minúsc).',
    maxage: 'Idade máxima (dias, igual ao "Age less than" do Zabbix)', maxage_desc: '0 = mostrar todos. Use o mesmo valor do filtro do seu Zabbix (ex.: 14). Esconde os crônicos antigos.',
    alerts: 'Alertas', snd_on: 'Tocar som em problema novo', notif_on: 'Mostrar notificação do navegador',
    notif_res: 'Notificar quando um problema for resolvido (recuperado)',
    badge_unseen: 'Badge conta só problemas novos (zera ao abrir)',
    repeat: 'Re-alarmar enquanto houver problema (até dar ack ou mudo)',
    nag_notify: 'Re-notificar no re-alarme (além do som)',
    repeat_int: 'Intervalo do re-alarme (seg)', repeat_desc: 'De quanto em quanto tempo re-toca enquanto houver problema não reconhecido.',
    volume: 'Volume', snd5: 'Som - Desastre', snd4: 'Som - Alta (high)', snd3: 'Som - Média (average)', snd2: 'Som - Aviso (warning)', snd1: 'Som - Informação (info)',
    test_btn: 'Testar', save: 'Salvar', reset: 'Restaurar padrões', lang: 'Idioma',
    saved: 'Configurações salvas.', reset_done: 'Padrões restaurados.', reset_confirm: 'Restaurar tudo para o padrão?',
    backup: 'Backup', backup_desc: 'Exporte/importe as configurações em JSON (o token de API não é exportado).', export_btn: 'Exportar', import_btn: 'Importar', import_ok: 'Configurações importadas.', import_err: 'Arquivo inválido.',
    loading: 'Carregando...', checking: 'Checando...', sending: 'enviando ack...',
    cfg_url: 'Configure a URL do Zabbix nas opções (engrenagem).',
    no_session: 'Sem sessão do Zabbix - faça login (ou use token nas opções).',
    none: 'Nenhum problema no filtro atual.', nodata: 'Sem dados ainda.',
    filter_ph: 'Filtrar host ou problema', no_match: 'Nenhum resultado pro filtro.', filter_sev: 'Filtrar por severidade',
    sort_by: 'Ordenar', sort_sev: 'Severidade', sort_age: 'Idade', sort_host: 'Host',
    active: 'ativos', via_session: 'sessão', via_token: 'token', err: 'Erro', conn_ok: 'Conexão OK', testing: 'Testando...', ago_now: 'agora', e_nocred: 'Sem credencial (sessão/token)', e_nourl: 'URL vazia',
    t_mute: 'Mudo', t_testsound: 'Testar som', t_check: 'Checar agora', t_settings: 'Configurações',
    n_resolved: 'Resolvido', n_recovered: 'problema recuperado', n_click: 'clique para abrir',
    n_test_title: '[TESTE] host-exemplo', n_test_msg: 'Problema de exemplo (alerta de teste)', n_test_ctx: 'notificação de teste',
    ack_msg: 'Reconhecido pelo NOC.',
    nsev0: 'Não classif.', nsev1: 'Info', nsev2: 'Aviso', nsev3: 'Média', nsev4: 'Alta', nsev5: 'Desastre',
    failed: 'falhou', open_settings: 'Abrir configurações',
    ack_do: 'Reconhecer (ack)', ack_ph: 'mensagem do ack (opcional) - Enter confirma',
    confirm: 'Confirmar', cancel: 'Cancelar', open_problem: 'Clique para abrir no Zabbix',
    snz_do: 'Adiar (snooze)', snz_wake: 'Acordar',
    inst_label: 'Rótulo', inst_label_ph: 'Ex.: PRD, HML, Filial',
    inst_url: 'URL do Zabbix', inst_token: 'Token de API (opcional)',
    inst_enabled: 'Ativa', inst_add: 'Adicionar instância', inst_remove: 'Remover',
    inst_section: 'Instâncias do Zabbix', inst_desc: 'Configure até 4 instâncias independentes. Cada uma pode usar sessão do navegador ou token.',
    inst_test: 'Testar', inst_empty: 'Nenhuma instância configurada.'
  },
  en: {
    conn: 'Connection', zurl: 'Zabbix URL', zurl_ph: 'https://zabbix.yourcompany.com',
    zurl_desc: 'Base address only (no /zabbix.php). You set it; nothing is hardcoded.',
    token: 'API token (optional)', token_ph: 'leave empty to use the open session',
    token_desc: 'Empty = uses the logged-in browser session cookie (no token).',
    test: 'Test connection', mon: 'Monitoring', interval: 'Check interval (sec)',
    interval_desc: 'How often it checks Zabbix (min 5s).',
    minsev: 'Minimum severity', minsev_desc: 'Only alerts from this level up.',
    sev0: 'Not classified+', sev1: 'Information+', sev2: 'Warning+', sev3: 'Average+', sev4: 'High+', sev5: 'Disaster',
    ign_sup: 'Ignore suppressed problems', ign_maint: 'Ignore problems in maintenance', tag_maint: 'In maintenance', ign_ack: 'Ignore already acknowledged problems',
    exclude: 'Exclude (name or host contains)', exclude_ph: '[OLD], Decommissioned, Unavailable by ICMP', exclude_desc: 'Hides problems whose name OR host contains any of these (comma or line separated; case-insensitive).',
    maxage: 'Max age (days, like Zabbix "Age less than")', maxage_desc: '0 = show all. Use the same value as your Zabbix filter (e.g. 14). Hides old chronic ones.',
    alerts: 'Alerts', snd_on: 'Play sound on new problem', notif_on: 'Show browser notification',
    notif_res: 'Notify when a problem is resolved (recovered)',
    badge_unseen: 'Badge counts only new problems (resets on open)',
    repeat: 'Re-alarm while a problem persists (until ack or mute)',
    nag_notify: 'Re-notify on re-alarm (besides the sound)',
    repeat_int: 'Re-alarm interval (sec)', repeat_desc: 'How often to replay the sound while an unacknowledged problem exists.',
    volume: 'Volume', snd5: 'Sound - Disaster', snd4: 'Sound - High', snd3: 'Sound - Average', snd2: 'Sound - Warning', snd1: 'Sound - Information',
    test_btn: 'Test', save: 'Save', reset: 'Restore defaults', lang: 'Language',
    saved: 'Settings saved.', reset_done: 'Defaults restored.', reset_confirm: 'Restore everything to defaults?',
    backup: 'Backup', backup_desc: 'Export/import settings as JSON (the API token is not exported).', export_btn: 'Export', import_btn: 'Import', import_ok: 'Settings imported.', import_err: 'Invalid file.',
    loading: 'Loading...', checking: 'Checking...', sending: 'sending ack...',
    cfg_url: 'Set the Zabbix URL in options (gear).',
    no_session: 'No Zabbix session - log in (or use a token in options).',
    none: 'No problems in the current filter.', nodata: 'No data yet.',
    filter_ph: 'Filter host or problem', no_match: 'No matches for the filter.', filter_sev: 'Filter by severity',
    sort_by: 'Sort', sort_sev: 'Severity', sort_age: 'Age', sort_host: 'Host',
    active: 'active', via_session: 'session', via_token: 'token', err: 'Error', conn_ok: 'Connection OK', testing: 'Testing...', ago_now: 'now', e_nocred: 'No credential (session/token)', e_nourl: 'Empty URL',
    t_mute: 'Mute', t_testsound: 'Test sound', t_check: 'Check now', t_settings: 'Settings',
    n_resolved: 'Resolved', n_recovered: 'problem recovered', n_click: 'click to open',
    n_test_title: '[TEST] sample-host', n_test_msg: 'Sample problem (test alert)', n_test_ctx: 'test notification',
    ack_msg: 'Acknowledged by NOC.',
    nsev0: 'Not classified', nsev1: 'Info', nsev2: 'Warning', nsev3: 'Average', nsev4: 'High', nsev5: 'Disaster',
    failed: 'failed', open_settings: 'Open settings',
    ack_do: 'Acknowledge (ack)', ack_ph: 'ack message (optional) - Enter to confirm',
    confirm: 'Confirm', cancel: 'Cancel', open_problem: 'Click to open in Zabbix',
    snz_do: 'Snooze', snz_wake: 'Wake',
    inst_label: 'Label', inst_label_ph: 'E.g.: PRD, STG, Branch',
    inst_url: 'Zabbix URL', inst_token: 'API token (optional)',
    inst_enabled: 'Enabled', inst_add: 'Add instance', inst_remove: 'Remove',
    inst_section: 'Zabbix Instances', inst_desc: 'Configure up to 4 independent instances. Each can use browser session or token.',
    inst_test: 'Test', inst_empty: 'No instances configured.'
  },
  es: {
    conn: 'Conexión', zurl: 'URL de Zabbix', zurl_ph: 'https://zabbix.tuempresa.com',
    zurl_desc: 'Solo la dirección base (sin /zabbix.php). Tú la defines; nada está fijo en código.',
    token: 'Token de API (opcional)', token_ph: 'dejar vacío para usar la sesión abierta',
    token_desc: 'Vacío = usa la cookie de la sesión del navegador (sin token).',
    test: 'Probar conexión', mon: 'Monitoreo', interval: 'Intervalo de chequeo (seg)',
    interval_desc: 'Cada cuántos segundos consulta Zabbix (mín 5s).',
    minsev: 'Severidad mínima', minsev_desc: 'Solo alerta desde este nivel hacia arriba.',
    sev0: 'No clasificada+', sev1: 'Información+', sev2: 'Aviso (warning)+', sev3: 'Media (average)+', sev4: 'Alta (high)+', sev5: 'Desastre (disaster)',
    ign_sup: 'Ignorar problemas suprimidos', ign_maint: 'Ignorar problemas en mantenimiento', tag_maint: 'En mantenimiento', ign_ack: 'Ignorar problemas ya reconocidos (ack)',
    exclude: 'Excluir (nombre o host contiene)', exclude_ph: '[ANTIGUO], Desmovilizado, Unavailable by ICMP', exclude_desc: 'Oculta problemas cuyo nombre O host contiene cualquiera de estos textos (coma o línea; sin distinción de mayúsculas).',
    maxage: 'Edad máxima (días, como "Age less than" de Zabbix)', maxage_desc: '0 = mostrar todos. Usa el mismo valor del filtro de tu Zabbix (ej.: 14). Oculta los crónicos antiguos.',
    alerts: 'Alertas', snd_on: 'Reproducir sonido en problema nuevo', notif_on: 'Mostrar notificación del navegador',
    notif_res: 'Notificar cuando un problema se resuelva (recuperado)',
    badge_unseen: 'El badge cuenta solo problemas nuevos (se reinicia al abrir)',
    repeat: 'Re-alarmar mientras haya problema (hasta ack o silencio)',
    nag_notify: 'Re-notificar en la re-alarma (además del sonido)',
    repeat_int: 'Intervalo de re-alarma (seg)', repeat_desc: 'Cada cuánto repite el sonido mientras haya un problema no reconocido.',
    volume: 'Volumen', snd5: 'Sonido - Desastre', snd4: 'Sonido - Alta (high)', snd3: 'Sonido - Media (average)', snd2: 'Sonido - Aviso (warning)', snd1: 'Sonido - Información (info)',
    test_btn: 'Probar', save: 'Guardar', reset: 'Restaurar valores', lang: 'Idioma',
    saved: 'Configuración guardada.', reset_done: 'Valores restaurados.', reset_confirm: '¿Restaurar todo a los valores por defecto?',
    backup: 'Backup', backup_desc: 'Exporta/importa la configuración en JSON (el token de API no se exporta).', export_btn: 'Exportar', import_btn: 'Importar', import_ok: 'Configuración importada.', import_err: 'Archivo inválido.',
    loading: 'Cargando...', checking: 'Comprobando...', sending: 'enviando ack...',
    cfg_url: 'Configura la URL de Zabbix en opciones (engranaje).',
    no_session: 'Sin sesión de Zabbix - inicia sesión (o usa un token en opciones).',
    none: 'Sin problemas en el filtro actual.', nodata: 'Sin datos aún.',
    filter_ph: 'Filtrar host o problema', no_match: 'Sin resultados para el filtro.', filter_sev: 'Filtrar por severidad',
    sort_by: 'Ordenar', sort_sev: 'Severidad', sort_age: 'Edad', sort_host: 'Host',
    active: 'activos', via_session: 'sesión', via_token: 'token', err: 'Error', conn_ok: 'Conexión OK', testing: 'Probando...', ago_now: 'ahora', e_nocred: 'Sin credencial (sesión/token)', e_nourl: 'URL vacía',
    t_mute: 'Silencio', t_testsound: 'Probar sonido', t_check: 'Comprobar ahora', t_settings: 'Configuración',
    n_resolved: 'Resuelto', n_recovered: 'problema recuperado', n_click: 'clic para abrir',
    n_test_title: '[PRUEBA] host-ejemplo', n_test_msg: 'Problema de ejemplo (alerta de prueba)', n_test_ctx: 'notificación de prueba',
    ack_msg: 'Reconocido por NOC.',
    nsev0: 'No clasif.', nsev1: 'Info', nsev2: 'Aviso', nsev3: 'Media', nsev4: 'Alta', nsev5: 'Desastre',
    failed: 'fallo', open_settings: 'Abrir configuración',
    ack_do: 'Reconocer (ack)', ack_ph: 'mensaje del ack (opcional) - Enter para confirmar',
    confirm: 'Confirmar', cancel: 'Cancelar', open_problem: 'Clic para abrir en Zabbix',
    snz_do: 'Posponer (snooze)', snz_wake: 'Despertar',
    inst_label: 'Etiqueta', inst_label_ph: 'Ej.: PRD, HML, Sucursal',
    inst_url: 'URL de Zabbix', inst_token: 'Token de API (opcional)',
    inst_enabled: 'Activa', inst_add: 'Agregar instancia', inst_remove: 'Eliminar',
    inst_section: 'Instancias de Zabbix', inst_desc: 'Configure hasta 4 instancias independientes. Cada una puede usar sesión del navegador o token.',
    inst_test: 'Probar', inst_empty: 'Sin instancias configuradas.'
  }
};

// Nome de cada idioma (mostrado no seletor). Adicione aqui ao criar um idioma novo.
const LANG_NAMES = { pt: 'Português', en: 'English', es: 'Español' };

// Tag BCP47 por idioma (atributo <html lang>). Adicione ao criar um idioma novo.
const LANG_TAGS = { pt: 'pt-br', en: 'en', es: 'es' };

function resolveLang(cfgLang) {
  if (cfgLang && I18N[cfgLang]) return cfgLang;
  const n = (typeof navigator !== 'undefined' ? (navigator.language || 'pt') : 'pt').slice(0, 2).toLowerCase();
  return I18N[n] ? n : 'pt';
}

function t(key, lang) { return (I18N[lang] || I18N.pt)[key] ?? key; }

function applyI18n(lang) {
  const dict = I18N[lang] || I18N.pt;
  // <html lang> acompanha o idioma (leitores de tela / corretor ortografico)
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = LANG_TAGS[lang] || lang;
  }
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (dict[k] != null) el.textContent = dict[k]; });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { const k = el.getAttribute('data-i18n-ph'); if (dict[k] != null) el.setAttribute('placeholder', dict[k]); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { const k = el.getAttribute('data-i18n-title'); if (dict[k] != null) el.setAttribute('title', dict[k]); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { const k = el.getAttribute('data-i18n-aria'); if (dict[k] != null) el.setAttribute('aria-label', dict[k]); });
}

// Preenche um <select> de idioma a partir dos idiomas disponiveis (auto-extensivel).
function populateLangSelect(el) {
  if (!el) return;
  el.innerHTML = Object.keys(I18N).map(code => `<option value="${code}">${LANG_NAMES[code] || code}</option>`).join('');
}

// URL que abre o evento EXATO no Zabbix. Funcao pura compartilhada (background + popup):
// tr_events.php cai no evento exato (ignora janela de tempo/show/severidade);
// fallback robusto trigger -> host -> nome. Mantida aqui para nao divergir entre as copias.
function problemUrl(base, p) {
  if (p && p.objectid && p.eventid) {
    return base + '/tr_events.php?triggerid=' + encodeURIComponent(p.objectid) + '&eventid=' + encodeURIComponent(p.eventid);
  }
  const u = base + '/zabbix.php?action=problem.view&filter_set=1&show=1&show_suppressed=1';
  if (p && p.objectid) return u + '&triggerids[]=' + encodeURIComponent(p.objectid);
  if (p && p.hostid) return u + '&hostids[]=' + encodeURIComponent(p.hostid);
  if (p && p.name) return u + '&name=' + encodeURIComponent(p.name);
  return u;
}
