const fs = require('fs');
const path = require('path');

// Dry-run zapisuje wybory AI do plans/<provider>.json, a --apply je z niego odtwarza.
// Bez tego AI przy zapisie potrafi wybrać inaczej niż w zaakceptowanym podglądzie, nawet przy temperaturze 0.
function planFile(provider, orderId) {
  return path.join(__dirname, '..', 'plans', `${provider}-${orderId || 'all'}.json`);
}

function savePlan(provider, meta, changes) {
  const file = planFile(provider, meta.orderId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ provider, ...meta, createdAt: new Date().toISOString(), changes }, null, 2));
  return file;
}

function loadPlan(provider, meta) {
  const file = planFile(provider, meta.orderId);
  if (!fs.existsSync(file)) return null;
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  const same = ['orderId', 'dateFrom', 'dateTo'].every((k) => String(plan[k] == null ? '' : plan[k]) === String(meta[k] == null ? '' : meta[k]));
  if (!same) {
    console.log(`${path.basename(file)} jest dla innego zakresu (#${plan.orderId} ${plan.dateFrom}..${plan.dateTo}), pytam AI od nowa`);
    return null;
  }
  return { ...plan, file };
}

module.exports = { savePlan, loadPlan, planFile };
