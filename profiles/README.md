# Profile

Profil to zwykły plik tekstowy z instrukcją dla modelu, jak wybierać posiłki. Skrypt dokleja do niego listę opcji dnia (nazwa, porcja, makro, alergeny, pełny skład) i prosi o numer najlepszej.

- `zdrowo.txt` (domyślny): ogólnie zdrowo, dużo białka, mało cukru i przetworzonego jedzenia.
- `wzjg.txt`: wrzodziejące zapalenie jelita grubego w remisji, bez ostrych przypraw i przetworzonego mięsa, lekkostrawnie.

Własny profil: skopiuj `zdrowo.txt` do np. `cukrzyca.txt`, opisz kryteria po ludzku w kolejności ważności i uruchom z `--profile=cukrzyca` albo wpisz `PROFILE=cukrzyca` do `.env`. Wpisuj też preferencje smakowe ("nie lubię ryb"), model je uwzględni. Sprawdź `--show-prompt`, żeby zobaczyć, co dokładnie dostaje model.

## Twarde listy obok profilu

Model czasem ignoruje zapis w profilu, dlatego obok profilu mogą leżeć dwie opcjonalne listy wzorców. Obie są zwykłymi plikami tekstowymi i mają tę samą składnię: jedna linia to jeden wzorzec, `#` zaczyna komentarz, dopasowanie jest bez polskich znaków i bez wielkości liter, więc wpisuj rdzeń słowa (`kapust` łapie kapustę i kapuśniak). Prefiks `name:` zawęża dopasowanie do nazwy dania, a linia z `-` to wyjątek wycinany z tekstu przed dopasowaniem (`-fasolka szparagowa` sprawia, że wzorzec `fasol` jej nie łapie).

- `<profil>.exclude.txt`: dania wycinane z listy opcji, zanim zapyta się model. Jeśli po filtrach zostanie jedna opcja, skrypt bierze ją bez pytania, a jeśli nie zostanie żadna, wraca do pełnej listy i pisze o tym w logu.
- `<profil>.keep.txt`: dania lubiane. Jeśli aktualnie wybrane danie pasuje do wzorca i nie wpadło na listę wykluczeń, skrypt zostawia je i nie pyta modelu o zamianę. Przydaje się, gdy smak ma wygrywać z makrami, bo model potrafi zamienić ulubione kopytka na danie z większą ilością białka.
