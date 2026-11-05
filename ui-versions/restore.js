// Switches the client to a saved UI version: node ui-versions/restore.js UI1
// The version being replaced is saved first as ui-versions/backup-<time>, so nothing is lost.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'client');
const ITEMS = ['src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'DESIGN.md'];

const version = process.argv[2];
const source = version && path.join(__dirname, version);
if (!version || !fs.existsSync(path.join(source, 'src'))) {
  const saved = fs.readdirSync(__dirname).filter((d) => fs.existsSync(path.join(__dirname, d, 'src')));
  console.error(`Usage: node ui-versions/restore.js <version>\nSaved versions: ${saved.join(', ')}`);
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const backup = path.join(__dirname, `backup-${stamp}`);
for (const item of ITEMS) {
  const from = path.join(CLIENT, item);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(backup, item), { recursive: true });
}

// Only src and public are removed, so files a version does not carry (such as DESIGN.md in UI1) stay put
for (const item of ['src', 'public']) fs.rmSync(path.join(CLIENT, item), { recursive: true, force: true });
for (const item of ITEMS) {
  const from = path.join(source, item);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(CLIENT, item), { recursive: true });
}

console.log(`Client is now ${version}. Previous version saved in ui-versions/${path.basename(backup)}.`);
console.log('Run "npm install" in client if the app reports a missing package.');
