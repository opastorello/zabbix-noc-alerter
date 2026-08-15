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

console.log(bad ? ('LINT: ' + bad + ' problema(s)') : 'LINT: ok (' + files.length + ' arquivos)');
process.exit(bad ? 1 : 0);
