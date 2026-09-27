#!/usr/bin/env node
// Użycie: node optimize.js <provider> [dateFrom] [dateTo] [--apply] [--replan] [--show-prompt] [--order=ID|all] [--profile=nazwa]
//   bez --apply: podgląd, wybory AI trafiają do plans/<provider>.json
//   --apply:     odtwarza plan z pliku dla tego samego zakresu (bez pytania AI), pomija sloty zmienione ręcznie w międzyczasie
//   --replan:    przy --apply pyta AI od nowa zamiast czytać plan
require('dotenv').config();
const { parseArgs } = require('./lib/cli');
const { loadProvider, providerNames } = require('./providers');
const { createPicker } = require('./lib/ai');
const { score } = require('./lib/scoring');
const { savePlan, loadPlan } = require('./lib/plan');
const { sleep } = require('./lib/util');

const { flags, positional } = parseArgs(process.argv.slice(2));
const [providerName, dateFrom, dateTo] = positional;
const APPLY = !!flags.apply;

if (!providerName) {
  console.error(`Podaj provider: ${providerNames.join(' | ')}\nnp. node optimize.js maczfit 2026-10-13 2026-10-31`);
  process.exit(1);
}

function inRange(d) {
  return (!dateFrom || d.date >= dateFrom) && (!dateTo || d.date <= dateTo);
}

async function pickOrders(provider) {
  const orders = await provider.listOrders();
  const wanted = flags.order || provider.defaultOrder;
  if (wanted === 'all') return orders;
  if (wanted) {
    const found = orders.filter((o) => o.id === String(wanted));
    if (!found.length) throw new Error(`Zamówienie #${wanted} nie jest aktywne. Aktywne: ${orders.map((o) => `#${o.id} ${o.label}`).join(', ') || 'brak'}`);
    return found;
  }
  if (orders.length === 1) return orders;
  if (!orders.length) throw new Error('Brak aktywnych zamówień z wyborem menu');
  throw new Error(`Kilka aktywnych zamówień, wybierz --order=ID albo --order=all:\n${orders.map((o) => `  #${o.id} ${o.label}`).join('\n')}`);
}

async function planDelivery(provider, pick, delivery) {
  const slots = await provider.getSlots(delivery);
  if (slots.length && slots.every((s) => s.options.length === 0)) {
    console.log(`  [${delivery.date}] brak opcji zamiany w żadnym posiłku (menu jeszcze nieopublikowane?)`);
    return [];
  }
  const changes = [];
  for (const slot of slots) {
    if (slot.options.length <= 1) continue;
    process.stdout.write(`  [${delivery.date}] ${slot.name}: pytam AI (${slot.options.length} opcje)... `);
    const { idx, reason } = await pick(slot.options.map((o) => o.dish));
    const best = slot.options[idx];
    console.log(`-> ${best.dish.name}${reason ? ` (${reason})` : ''}`);
    if (best.id === slot.currentId) continue;
    changes.push({
      deliveryId: delivery.id,
      deliveryDate: delivery.date,
      orderId: delivery.orderId,
      slotId: slot.id,
      slotName: slot.name,
      reason,
      from: { name: slot.current.name, score: score(slot.current) },
      to: { name: best.dish.name, id: best.id, ref: best.ref, score: score(best.dish) },
    });
    await sleep(150);
  }
  return changes;
}

async function applyFromPlan(provider, plan, orders) {
  console.log(`Zapisuję ${plan.changes.length} zmian z ${plan.file} (podgląd z ${plan.createdAt})`);
  const deliveries = new Map();
  for (const order of orders) for (const d of await provider.listDeliveries(order)) deliveries.set(d.id, d);
  const slotCache = new Map();
  let total = 0;
  for (const c of plan.changes) {
    const label = `  ${c.deliveryDate} ${c.slotName}:`;
    const delivery = deliveries.get(c.deliveryId);
    if (!delivery) { console.log(`${label} dostawa już niemodyfikowalna albo nie istnieje, pomijam`); continue; }
    if (!slotCache.has(c.deliveryId)) slotCache.set(c.deliveryId, await provider.getSlots(delivery));
    const slot = slotCache.get(c.deliveryId).find((s) => s.id === c.slotId);
    if (!slot) { console.log(`${label} brak posiłku w menu, pomijam`); continue; }
    if (slot.current.name === c.to.name) { console.log(`${label} już jest "${c.to.name}"`); continue; }
    if (slot.current.name !== c.from.name) { console.log(`${label} zmienione ręcznie na "${slot.current.name}" (plan miał "${c.from.name}"), pomijam`); continue; }
    const option = slot.options.find((o) => o.id === c.to.id);
    if (!option) { console.log(`${label} opcji "${c.to.name}" już nie ma wśród zamian, pomijam`); continue; }
    console.log(`${label} "${c.from.name}" -> "${c.to.name}"`);
    await provider.applySwap(delivery, slot, option);
    console.log('    zapisano');
    total++;
    await sleep(300);
  }
  console.log(`\nRazem zmieniono: ${total}`);
}

async function main() {
  console.log(APPLY ? 'TRYB: zapis zmian (--apply)' : 'TRYB: podgląd (dry-run), dodaj --apply żeby zapisać');
  const provider = loadProvider(providerName, process.env);
  await provider.login();
  const orders = await pickOrders(provider);
  const planMeta = { orderId: orders.length === 1 ? orders[0].id : 'all', dateFrom: dateFrom || null, dateTo: dateTo || null };

  if (APPLY && !flags.replan) {
    const plan = loadPlan(providerName, planMeta);
    if (plan) return applyFromPlan(provider, plan, orders);
    console.log('Brak pasującego planu, pytam AI i zapisuję od razu');
  }

  const pick = createPicker({
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL,
    profileName: flags.profile || process.env.PROFILE || 'wzjg',
    showPrompt: !!flags['show-prompt'],
  });

  let total = 0;
  const planned = [];
  for (const order of orders) {
    const deliveries = (await provider.listDeliveries(order)).filter(inRange);
    console.log(`\n=== Zamówienie #${order.id} (${order.label}), dostaw do sprawdzenia: ${deliveries.length}`);
    for (const delivery of deliveries) {
      const changes = await planDelivery(provider, pick, delivery);
      if (!changes.length) continue;
      console.log(`\n${delivery.date}${delivery.note ? ` (${delivery.note})` : ''}:`);
      for (const c of changes) {
        console.log(`  ${c.slotName}: "${c.from.name}" (score ${c.from.score.toFixed(1)}) -> "${c.to.name}" (score ${c.to.score.toFixed(1)})`);
        if (c.reason) console.log(`    AI: ${c.reason}`);
        if (APPLY) {
          const slots = await provider.getSlots(delivery);
          const slot = slots.find((s) => s.id === c.slotId);
          await provider.applySwap(delivery, slot, slot.options.find((o) => o.id === c.to.id));
          console.log('    zapisano');
          await sleep(300);
        }
      }
      total += changes.length;
      planned.push(...changes);
    }
  }
  console.log(`\nRazem ${APPLY ? 'zmieniono' : 'proponowanych zmian'}: ${total}`);

  if (!APPLY) {
    const file = savePlan(providerName, planMeta, planned);
    console.log(`Plan zapisany do ${file}. Zapis: node optimize.js ${providerName} ${dateFrom || ''} ${dateTo || ''} --apply`);
  }
}

main().catch((err) => {
  console.error('Błąd:', err.message);
  process.exit(1);
});
