# Profile

Profil to zwykły plik tekstowy z instrukcją dla modelu, jak wybierać posiłki. Skrypt dokleja do niego listę opcji dnia (nazwa, porcja, makro, alergeny, pełny skład) i prosi o numer najlepszej.

- `zdrowo.txt` (domyślny): ogólnie zdrowo, dużo białka, mało cukru i przetworzonego jedzenia.
- `wzjg.txt`: wrzodziejące zapalenie jelita grubego w remisji, bez ostrych przypraw i przetworzonego mięsa, lekkostrawnie.

Własny profil: skopiuj `zdrowo.txt` do np. `cukrzyca.txt`, opisz kryteria po ludzku w kolejności ważności i uruchom z `--profile=cukrzyca` albo wpisz `PROFILE=cukrzyca` do `.env`. Wpisuj też preferencje smakowe ("nie lubię ryb"), model je uwzględni. Sprawdź `--show-prompt`, żeby zobaczyć, co dokładnie dostaje model.
