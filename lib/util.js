function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(v) {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function stripHtml(html) {
  return (html || '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Wspólny format dania, który dostaje AI i scoring. Każdy provider mapuje na to swoje pola.
// nutrition: calories, weight (g), protein, fat, saturatedFat, carbs, sugar, fiber, salt (wszystko w g, może brakować)
function dish({ name, ingredients, allergens, nutrition }) {
  return {
    name: name || '(bez nazwy)',
    ingredients: ingredients || '',
    allergens: (allergens || []).map((a) => String(a).trim()).filter(Boolean),
    nutrition: nutrition || {},
  };
}

module.exports = { sleep, num, stripHtml, norm, todayPlus, dish };
