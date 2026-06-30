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
console.log(bad ? ('LINT: ' + bad + ' arquivo(s) com erro de sintaxe') : 'LINT: ok (' + files.length + ' arquivos)');
process.exit(bad ? 1 : 0);
