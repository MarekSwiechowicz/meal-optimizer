#!/usr/bin/env node
// Ustawia konkretne dania po fragmencie nazwy, bez pytania AI.
//   node set.js <provider> fixes.json          (podgląd)
//   node set.js <provider> fixes.json --apply  (zapis)
// fixes.json: [{ "date": "2026-09-23", "meal": "Śniadanie", "dish": "fragment nazwy dania" }, ...]
// --env=plik pozwala trzymać kilka konfiguracji (np. dwa zamówienia na jednym koncie), domyślnie .env
const envFlag = process.argv.find((a) => a.startsWith('--env='));
require('dotenv').config(envFlag ? { path: envFlag.slice(6) } : {});
const fs = require('fs');
const { parseArgs } = require('./lib/cli');
const { loadProvider } = require('./providers');
const { norm, sleep } = require('./lib/util');

const { flags, positional } = parseArgs(process.argv.slice(2));
const [providerName, file] = positional;
const APPLY = !!flags.apply;
if (!providerName || !file) {
  console.error('Użycie: node set.js <provider> fixes.json [--apply] [--order=ID]');
  process.exit(1);
}
const fixes = JSON.parse(fs.readFileSync(file, 'utf8'));

async function main() {
  console.log(APPLY ? 'TRYB: zapis (--apply)' : 'TRYB: podgląd');
  const provider = loadProvider(providerName, process.env, flags);
  await provider.login();
  const orders = await provider.listOrders();
  const wanted = flags.order || provider.defaultOrder;
  const order = wanted ? orders.find((o) => o.id === String(wanted)) : orders[0];
  if (!order) throw new Error(`Brak zamówienia${wanted ? ` #${wanted}` : ''}. Aktywne: ${orders.map((o) => `#${o.id}`).join(', ') || 'brak'}`);
  const deliveries = await provider.listDeliveries(order);

  let done = 0;
  for (const fix of fixes) {
    const label = `${fix.date} ${fix.meal}:`;
    const delivery = deliveries.find((d) => d.date === fix.date);
    if (!delivery) { console.log(`${label} brak modyfikowalnej dostawy tego dnia`); continue; }
    const slots = await provider.getSlots(delivery);
    const slot = slots.find((s) => norm(s.name) === norm(fix.meal));
    if (!slot) { console.log(`${label} brak takiego posiłku (są: ${slots.map((s) => s.name).join(', ')})`); continue; }
    if (norm(slot.current.name).includes(norm(fix.dish))) { console.log(`${label} już ustawione "${slot.current.name}"`); continue; }
    const target = slot.options.find((o) => norm(o.dish.name).includes(norm(fix.dish)));
    if (!target) {
      console.log(`${label} nie znalazłem "${fix.dish}" wśród opcji:`);
      slot.options.forEach((o) => console.log(`    - ${o.dish.name}`));
      continue;
    }
    console.log(`${label} "${slot.current.name}" -> "${target.dish.name}"`);
    if (APPLY) {
      await provider.applySwap(delivery, slot, target);
      console.log('    zapisano');
      done++;
      await sleep(300);
    }
  }
  console.log(`\nRazem ${APPLY ? 'zapisano' : 'do zmiany'}: ${APPLY ? done : fixes.length}`);
}

main().catch((err) => {
  console.error('Błąd:', err.message);
  process.exitCode = 1;
});
