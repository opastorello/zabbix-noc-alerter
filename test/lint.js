// Lint leve: checa a sintaxe de cada .js do projeto (node puro, sem dependencias).
// Nao substitui um ESLint completo, mas pega erro de sintaxe antes de empacotar. Rode: npm run lint
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).sort();

let bad = 0;
for (const f of files) {
  try {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
    console.log('  ✓ ' + f);
  } catch (e) {
    bad++;
    console.log('  ✗ ' + f + ': ' + e.message);
  }
}
// PRIVACY.md e o documento voltado a loja: toda permissao do manifest tem que estar
// documentada la, ou o proximo review da Web Store aponta a divergencia por nos.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const privacy = fs.readFileSync(path.join(ROOT, 'PRIVACY.md'), 'utf8');
const missing = (manifest.permissions || []).filter(p => !privacy.includes('**' + p + '**'));
if (missing.length) {
  bad++;
  console.log('  ✗ PRIVACY.md nao documenta a(s) permissao(oes): ' + missing.join(', '));
} else {
  console.log('  ✓ PRIVACY.md cobre todas as permissoes do manifest.json');
}

// i18n completeness: toda chave tem que existir nos 3 idiomas, toda chave usada no codigo tem que
// estar definida, e chave definida mas nunca usada e sinal de sobra (ex.: a limpeza de conn/zurl/
// token da tela pre-multi-instancia). Chaves montadas dinamicamente (t('nsev'+sev, ...) etc.) nao
// da pra achar por regex, entao as familias conhecidas entram numa lista fixa abaixo.
const i18nSrc = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
const i18nSandbox = {};
vm.createContext(i18nSandbox);
vm.runInContext(i18nSrc + '\n;globalThis.__I18N = I18N;', i18nSandbox, { filename: 'i18n.js' });
const I18N = i18nSandbox.__I18N;
const langs = Object.keys(I18N);
const keysByLang = {};
langs.forEach(l => keysByLang[l] = new Set(Object.keys(I18N[l])));
const allDefined = new Set();
langs.forEach(l => keysByLang[l].forEach(k => allDefined.add(k)));

const incomplete = [...allDefined].filter(k => langs.some(l => !keysByLang[l].has(k)));
if (incomplete.length) {
  bad++;
  console.log('  ✗ chave(s) faltando em algum idioma: ' + incomplete.map(k => k + ' (falta em ' + langs.filter(l => !keysByLang[l].has(k)).join(',') + ')').join('; '));
} else {
  console.log('  ✓ i18n: ' + allDefined.size + ' chaves presentes nos ' + langs.length + ' idiomas (' + langs.join('/') + ')');
}

// chaves montadas dinamicamente (prefixo + variavel): confirmadas na auditoria de 2026-08-15.
const DYNAMIC_KEYS = [
  'nsev0', 'nsev1', 'nsev2', 'nsev3', 'nsev4', 'nsev5',
  'via_session', 'via_token', 'via_password',
  'auth_session_d', 'auth_token_d', 'auth_password_d',
];
// prefixos de chave dinamica (t('nsev' + sev, ...) etc.): o regex abaixo casa a string literal
// isolada como se fosse a chave inteira. Nao sao chaves de verdade, sao artefato da concatenacao.
const DYNAMIC_PREFIXES = new Set(['nsev', 'via_', 'auth_']);
const used = new Set(DYNAMIC_KEYS);
const CODE_FILES = ['background.js', 'popup.js', 'options.js', 'offscreen.js', 'popup.html', 'options.html'];
for (const f of CODE_FILES) {
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of txt.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) { if (!DYNAMIC_PREFIXES.has(m[1])) used.add(m[1]); }
  for (const m of txt.matchAll(/data-i18n(?:-title|-ph|-aria)?="([a-zA-Z0-9_]+)"/g)) used.add(m[1]);
}
const usedNotDefined = [...used].filter(k => !allDefined.has(k));
if (usedNotDefined.length) {
  bad++;
  console.log('  ✗ chave(s) usada(s) no codigo mas nao definida(s) em i18n.js: ' + usedNotDefined.join(', '));
}
const definedNotUsed = [...allDefined].filter(k => !used.has(k));
if (definedNotUsed.length) {
  bad++;
  console.log('  ✗ chave(s) definida(s) mas nunca usada(s) (sobra - remover ou checar DYNAMIC_KEYS em test/lint.js): ' + definedNotUsed.join(', '));
} else if (!usedNotDefined.length) {
  console.log('  ✓ i18n: toda chave usada esta definida, e toda chave definida esta em uso');
}

console.log(bad ? ('LINT: ' + bad + ' problema(s)') : 'LINT: ok (' + files.length + ' arquivos)');
process.exit(bad ? 1 : 0);
