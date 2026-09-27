#!/usr/bin/env node
// Kreator konfiguracji: pyta o catering, dane logowania i klucz Groq, sprawdza logowanie, zapisuje .env.
// Istniejące wpisy w .env zostają, nadpisywane są tylko te, o które kreator zapytał.
//   node setup.js            (zapisuje do .env w katalogu projektu)
//   node setup.js --env=inny/plik.env
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseArgs } = require('./lib/cli');
const { loadProvider } = require('./providers');
const { KNOWN_COMPANIES, DEFAULT_HOST } = require('./providers/dietly');

const { flags } = parseArgs(process.argv.slice(2));
const ENV_FILE = path.resolve(flags.env || path.join(__dirname, '.env'));

// Kolejka linii zamiast rl.question: działa i z terminala, i z potoku (readline z potoku zamyka się zanim padną pytania)
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const queue = [];
let waiting = null;
let ended = false;
rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else queue.push(l); });
rl.on('close', () => { ended = true; if (waiting) { const w = waiting; waiting = null; w(''); } });
function ask(q, def) {
  process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `);
  return new Promise((res) => {
    const handle = (l) => { if (!process.stdin.isTTY) process.stdout.write('\n'); res(l.trim() || def || ''); };
    if (queue.length) handle(queue.shift());
    else if (ended) handle('');
    else waiting = handle;
  });
}

const PROVIDERS = {
  maczfit: { label: 'Maczfit (maczfit.pl)', prefix: 'MACZFIT' },
  vikinga: { label: 'Kuchnia Vikinga (panel.kuchniavikinga.pl)', prefix: 'VIKINGA' },
  zdrowycatering: { label: 'Zdrowy Catering (zamowienie.zdrowycatering.pl)', prefix: 'ZDROWY' },
  dietly: { label: 'Inny catering na Dietly (konto z dietly.pl albo własny panel cateringu)', prefix: 'DIETLY' },
};

function readEnv() {
  const out = {};
  if (!fs.existsSync(ENV_FILE)) return out;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function writeEnv(updates) {
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : [];
  const seen = new Set();
  const result = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] in updates) { seen.add(m[1]); return `${m[1]}=${updates[m[1]]}`; }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) if (!seen.has(k)) result.push(`${k}=${v}`);
  fs.writeFileSync(ENV_FILE, result.join('\n').replace(/\n*$/, '\n'));
}

async function main() {
  console.log(`Konfiguracja meal-optimizer, zapis do ${ENV_FILE}\n`);
  const existing = readEnv();
  const keys = Object.keys(PROVIDERS);
  keys.forEach((k, i) => console.log(`  ${i + 1}. ${PROVIDERS[k].label}`));
  const name = keys[parseInt(await ask('Który catering (numer)', '1'), 10) - 1];
  if (!name) throw new Error('Nie ma takiej opcji');
  const { prefix } = PROVIDERS[name];
  const updates = {};

  if (name === 'dietly') {
    console.log(`\nCateringi we wspólnym panelu ${DEFAULT_HOST}: ${KNOWN_COMPANIES.join(', ')}`);
    console.log('Jeśli catering ma własny panel (np. panel.nazwa.pl), podaj jego host; company-id znajdziesz w https://<host>/config.js');
    updates.DIETLY_COMPANY = await ask('company-id cateringu', existing.DIETLY_COMPANY);
    updates.DIETLY_HOST = await ask('host panelu', existing.DIETLY_HOST || DEFAULT_HOST);
  }
  updates[`${prefix}_EMAIL`] = await ask('E-mail do panelu cateringu', existing[`${prefix}_EMAIL`]);
  updates[`${prefix}_PASSWORD`] = await ask('Hasło (zapisane jawnym tekstem w .env)', existing[`${prefix}_PASSWORD`]);
  updates.GROQ_API_KEY = await ask('Klucz Groq (console.groq.com, darmowy)', existing.GROQ_API_KEY);
  updates.GROQ_MODEL = await ask('Model Groq', existing.GROQ_MODEL || 'openai/gpt-oss-20b');
  const profiles = fs.readdirSync(path.join(__dirname, 'profiles')).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, ''));
  updates.PROFILE = await ask(`Profil (${profiles.join(', ')})`, existing.PROFILE || 'zdrowo');

  process.stdout.write('\nSprawdzam logowanie... ');
  const env = { ...existing, ...updates };
  const provider = loadProvider(name, env, { company: env.DIETLY_COMPANY, host: env.DIETLY_HOST });
  await provider.login();
  const orders = await provider.listOrders();
  console.log('OK');
  if (!orders.length) console.log('Brak aktywnych zamówień z wyborem menu. Konfigurację i tak zapisuję, uruchom optimize.js po zakupie diety.');
  else {
    orders.forEach((o) => console.log(`  #${o.id} ${o.label}`));
    if (orders.length > 1) updates[`${prefix}_ORDER_ID`] = await ask('Które zamówienie optymalizować (numer po #)', existing[`${prefix}_ORDER_ID`] || orders[0].id);
  }
  writeEnv(updates);
  console.log(`\nZapisane. Podgląd propozycji: node optimize.js ${name} <data od> <data do>, zapis z --apply.`);
}

main().catch((err) => { console.error('\nBłąd:', err.message); process.exitCode = 1; }).finally(() => rl.close());
