const fs = require('fs');
const path = require('path');

// Twarde wykluczenia preferencyjne: profiles/<profil>.exclude.txt, jeden wzorzec na linię,
// # to komentarz. Wzorzec dopasowujemy do nazwy dania i do listy składników, bez znaków
// diakrytycznych i bez wielkości liter.
// Prefiks "name:" zawęża dopasowanie do samej nazwy dania (istotny składnik, nie ślad w składzie).
// Linia zaczynająca się od "-" to wyjątek: ta fraza znika z tekstu przed szukaniem wzorców,
// więc "-fasolka szparagowa" sprawia, że wzorzec "fasol" nie łapie fasolki szparagowej.
function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[ąĄ]/g, 'a').replace(/[ćĆ]/g, 'c').replace(/[ęĘ]/g, 'e').replace(/[łŁ]/g, 'l')
    .replace(/[ńŃ]/g, 'n').replace(/[óÓ]/g, 'o').replace(/[śŚ]/g, 's').replace(/[żźŻŹ]/g, 'z')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
}

function loadExclusions(profileName) {
  const file = path.join(__dirname, '..', 'profiles', `${profileName}.exclude.txt`);
  if (!fs.existsSync(file)) {
    const empty = [];
    empty.exceptions = [];
    return empty;
  }
  const lines = fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const list = lines
    .filter((l) => !l.startsWith('-'))
    .map((l) => (l.startsWith('name:')
      ? { raw: l, needle: norm(l.slice(5)), nameOnly: true }
      : { raw: l, needle: norm(l) }));
  list.exceptions = lines.filter((l) => l.startsWith('-')).map((l) => norm(l.slice(1)));
  return list;
}

// Wycina frazy-wyjątki z tekstu, żeby szerszy wzorzec ich nie złapał.
function strip(text, exceptions) {
  return (exceptions || []).reduce((acc, e) => (e ? acc.split(e).join(' ') : acc), text);
}

// Zwraca pierwszy pasujący wzorzec albo null.
function matchExclusion(dish, exclusions) {
  const ex = exclusions.exceptions;
  const name = strip(norm(dish.name), ex);
  const full = `${name} || ${strip(norm(dish.ingredients), ex)}`;
  const hit = exclusions.find((e) => (e.nameOnly ? name : full).includes(e.needle));
  return hit ? hit.raw : null;
}

module.exports = { loadExclusions, matchExclusion, norm };
