const fs = require('fs');
const path = require('path');

// Twarde wykluczenia preferencyjne: profiles/<profil>.exclude.txt, jeden wzorzec na linię,
// # to komentarz. Wzorzec dopasowujemy do nazwy dania i do listy składników, bez znaków
// diakrytycznych i bez wielkości liter, więc "kapusta" łapie też "kapuście" tylko gdy
// wzorzec jest rdzeniem (patrz plik z wzorcami).
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
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => (l.startsWith('name:')
      ? { raw: l, needle: norm(l.slice(5)), nameOnly: true }
      : { raw: l, needle: norm(l) }));
}

// Zwraca pierwszy pasujący wzorzec albo null.
function matchExclusion(dish, exclusions) {
  const name = norm(dish.name);
  const full = `${name} || ${norm(dish.ingredients)}`;
  const hit = exclusions.find((e) => (e.nameOnly ? name : full).includes(e.needle));
  return hit ? hit.raw : null;
}

module.exports = { loadExclusions, matchExclusion, norm };
