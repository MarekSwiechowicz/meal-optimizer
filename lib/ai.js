const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const { sleep } = require('./util');
const { bestByScore } = require('./scoring');

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

function loadProfile(name) {
  const file = path.join(__dirname, '..', 'profiles', `${name}.txt`);
  if (!fs.existsSync(file)) throw new Error(`Brak profilu ${file}`);
  return fs.readFileSync(file, 'utf8').trim();
}

function fmt(v, unit) {
  return v == null ? '?' : `${v}${unit || 'g'}`;
}

function formatDish(d, i) {
  const n = d.nutrition || {};
  const macro = [
    `białko ${fmt(n.protein)}`,
    `tłuszcz ${fmt(n.fat)}${n.saturatedFat != null ? ` (w tym nasycone ${fmt(n.saturatedFat)})` : ''}`,
    `węglowodany ${fmt(n.carbs)}${n.sugar != null ? ` (w tym cukry ${fmt(n.sugar)})` : ''}`,
    n.fiber != null ? `błonnik ${fmt(n.fiber)}` : null,
    n.salt != null ? `sól ${fmt(n.salt)}` : null,
  ].filter(Boolean).join(', ');
  const portion = [n.weight != null ? `${n.weight}g` : null, n.calories != null ? `${n.calories} kcal` : null].filter(Boolean).join(', ');
  return [
    `${i + 1}. ${d.name}`,
    portion ? `   Porcja: ${portion}` : null,
    `   Makro: ${macro}`,
    `   Alergeny: ${d.allergens.length ? d.allergens.join(', ') : 'brak danych'}`,
    `   Składniki: ${d.ingredients || 'brak danych'}`,
  ].filter(Boolean).join('\n');
}

const ANSWER_FORMAT =
  'Odpowiedz w formacie: numer opcji, potem myślnik, potem jedno krótkie zdanie uzasadnienia po polsku. ' +
  'Przykład: "3 - najwięcej białka, brak ostrych przypraw". Bez żadnego innego tekstu.';

function buildPrompt(profile, dishes) {
  return `${profile}\n${ANSWER_FORMAT}\n\n${dishes.map(formatDish).join('\n\n')}`;
}

function parseAnswer(content, count) {
  const match = (content || '').match(/^\s*(\d+)\s*[-–:.)]?\s*(.*)$/s);
  if (!match) return { idx: -1, reason: '' };
  const idx = parseInt(match[1], 10) - 1;
  return { idx: idx >= 0 && idx < count ? idx : -1, reason: match[2].trim() };
}

function createPicker({ apiKey, model, profileName, showPrompt }) {
  if (!apiKey) throw new Error('Brak GROQ_API_KEY w .env (klucz z console.groq.com)');
  const groq = new Groq({ apiKey });
  const profile = loadProfile(profileName);

  // Zwraca { idx, reason }. Retry na rate limit i brak sieci, fallback na scoring gdy model nie da numeru.
  return async function pick(dishes) {
    const prompt = buildPrompt(profile, dishes);
    if (showPrompt) console.log(`\n----- PROMPT DO AI -----\n${prompt}\n----- KONIEC PROMPTU -----`);
    while (true) {
      try {
        const completion = await groq.chat.completions.create({
          model: model || DEFAULT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
          temperature: 0,
          reasoning_effort: 'low',
          reasoning_format: 'hidden',
        });
        const content = completion.choices[0].message.content;
        const { idx, reason } = parseAnswer(content, dishes.length);
        if (idx >= 0) return { idx, reason };
        console.log(`\n  [AI bez odpowiedzi: ${JSON.stringify(content)}] biorę scoring`);
        return { idx: bestByScore(dishes), reason: 'fallback: scoring' };
      } catch (err) {
        const isRateLimit = err.status === 429;
        const isNetwork = !err.status;
        if (!isRateLimit && !isNetwork) throw err;
        const m = isRateLimit && err.message && err.message.match(/try again in (\d+)m([\d.]+)s/);
        const waitMs = m ? (parseInt(m[1], 10) * 60 + parseFloat(m[2])) * 1000 + 2000 : 30000;
        console.log(`\n  [${isRateLimit ? 'rate limit' : 'brak sieci'}] czekam ${Math.ceil(waitMs / 60000)} min...`);
        await sleep(waitMs);
      }
    }
  };
}

module.exports = { createPicker, buildPrompt, loadProfile };
