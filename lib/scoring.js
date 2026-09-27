// Punktacja pod WZJG na znormalizowanym daniu (lib/util.js dish()). Działa jako informacja w logu
// i awaryjny fallback, gdy AI nie zwróci numeru. Decyzję podejmuje AI z profilem z profiles/.
const HARD_AVOID_RE = /curry|hariss|chili|pikant|papryczka ostra|cayenne|tabasco|sriracha|tom yum/;

function isHardAvoid(d) {
  return HARD_AVOID_RE.test(`${d.name} ${d.ingredients}`.toLowerCase());
}

function score(d) {
  const n = d.nutrition || {};
  const protein = n.protein || 0;
  const fat = n.fat || 0;
  // Gdy API nie zwraca cukru osobno, węglowodany jako słabe przybliżenie
  const sugarPenalty = n.sugar != null ? n.sugar * 1.5 : (n.carbs || 0) * 0.3;
  let s = protein * 3 - fat * 2 - sugarPenalty;

  const name = d.name.toLowerCase();
  const text = `${name} ${d.ingredients}`.toLowerCase();

  if (/mintaj|ryba|łosoś|dorsz|tuńczyk|pstrąg|krewet/.test(text)) s += 20;
  if (/kurczak|indyk|drobiow/.test(text)) s += 5;
  if (/sos pomidorowy|pomidorow/.test(text)) s -= 10;
  if (/boczek|pepperoni|kiełbas|salami|mortadel|chorizo|kabanos|parówk|szynka konserwow/.test(text)) s -= 10;
  if (/musztard|chrzan|wędzon/.test(text)) s -= 5;
  if (/surow[ay] kapust|kapusta świeża/.test(text)) s -= 5;
  if (/sałat/.test(name)) s -= 12;
  if ((d.allergens || []).length >= 5) s -= 5;
  return s;
}

function bestByScore(dishes) {
  const safe = dishes.map((d, i) => ({ d, i })).filter((x) => !isHardAvoid(x.d));
  const pool = safe.length ? safe : dishes.map((d, i) => ({ d, i }));
  return pool.reduce((b, x) => (score(x.d) > score(b.d) ? x : b), pool[0]).i;
}

module.exports = { score, isHardAvoid, bestByScore };
