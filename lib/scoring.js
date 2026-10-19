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
  // Gdy API nie zwraca cukru osobno, węglowodany jako słabe przybliżenie.
  // Smak jest ważniejszy niż makro (decyzja Marka 2026-10-19), więc kara za cukier jest łagodna.
  const sugarPenalty = n.sugar != null ? n.sugar * 0.6 : (n.carbs || 0) * 0.12;
  let s = protein * 3 - fat * 2 - sugarPenalty;

  const name = d.name.toLowerCase();
  const text = `${name} ${d.ingredients}`.toLowerCase();

  if (/mintaj|ryb[ya]|łosoś|dorsz|miruna|makrel|tuńczyk|pstrąg|krewet|owoce morza/.test(text)) s -= 15;
  // Lubiane grupy (punkt 3 profilu wzjg): maja wygrywac z lepszymi makrami.
  if (/twaroż|serek|serem|mozzarell|naleśnik|pancak|placki|racuch|pieróg|pierogi|kluski|kopytka|leniwe|knedl|makaron|jajecznic|omlet|frittat|jaj[ok]|owsiank|deser|ciast|budyn|mus /.test(name)) s += 25;
  if (/kurczak|indyk|drobiow/.test(text)) s += 5;
  if (/sos pomidorowy|pomidorow/.test(text)) s -= 10;
  if (/boczek|pepperoni|kiełbas|salami|mortadel|chorizo|kabanos|parówk|szynka konserwow/.test(text)) s -= 10;
  if (/musztard|chrzan|wędzon/.test(text)) s -= 5;
  if (/śmietan|carbonara/.test(text)) s -= 10;
  if (/cebul/.test(name)) s -= 15;
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
