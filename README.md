# meal-optimizer

Automatyczny wybór posiłków w cateringach dietetycznych z opcją "wybór menu". Skrypt loguje się do panelu klienta, pobiera na każdy dzień wszystkie dostępne zamienniki każdego posiłku (nazwa, pełny skład, makro, alergeny), pyta model językowy, który wybór najlepiej pasuje do Twojego profilu, i zapisuje zamiany na koncie.

## Obsługiwane cateringi

| provider | dla kogo | konto |
|---|---|---|
| `maczfit` | Maczfit (maczfit.pl, "Moje diety") | konto z maczfit.pl |
| `vikinga` | Kuchnia Vikinga (panel.kuchniavikinga.pl) | konto z panelu Vikingi |
| `zdrowycatering` | Zdrowy Catering (zamowienie.zdrowycatering.pl) | konto z tego panelu |
| `dietly` | każdy catering na platformie Dietly: Robin Food, Pyszna Fabryka, Chefbox, Dziki Box, Afterfit, Tytka Fit, Twoje Menu, U Hrabiego i około 30 innych | konto z dietly.pl (wspólny panel panel.dietly.pl) albo z własnego panelu cateringu |

Wybór robi model przez Groq (darmowy klucz z console.groq.com). Kryteria są w zwykłym pliku tekstowym w `profiles/`, domyślnie `zdrowo` (dużo białka, mało cukru i przetworzonego jedzenia). Własny profil, np. dla cukrzycy, refluksu albo redukcji, to nowy plik tekstowy, patrz `profiles/README.md`.

## Szybki start

```bash
npm install
node setup.js
```

Kreator pyta o catering, e-mail, hasło, klucz Groq i profil, sprawdza logowanie, pokazuje aktywne zamówienia i zapisuje `.env`. Potem:

```bash
# podgląd propozycji na zakres dat (nic nie zapisuje, plan trafia do plans/<provider>.json)
node optimize.js maczfit 2026-10-13 2026-10-19

# zapis dokładnie tego, co było w podglądzie (bez ponownego pytania AI)
node optimize.js maczfit 2026-10-13 2026-10-19 --apply

# catering na Dietly
node optimize.js dietly --company=robinfood 2026-10-13 2026-10-19
```

Bez dat skrypt bierze wszystkie dostawy, które da się jeszcze zmienić. Menu jest publikowane około 2 tygodnie naprzód, dalsze dni wypisują "brak opcji". Darmowy Groq ma limity, więc duży zakres lepiej robić partiami po tygodniu.

## Flagi

- `--apply` zapisuje zmiany. Jeśli w `plans/` jest plan z podglądu dla tego samego zamówienia i zakresu, zapisuje go jeden do jednego i pomija posiłki, które w międzyczasie zmieniłeś ręcznie na stronie. Bez planu pyta AI i zapisuje od razu.
- `--replan` przy `--apply` ignoruje zapisany plan i pyta AI od nowa.
- `--show-prompt` wypisuje pełny prompt wysyłany do modelu.
- `--order=ID` albo `--order=all`, gdy na koncie jest kilka aktywnych zamówień (domyślnie `MACZFIT_ORDER_ID` itd. z `.env`).
- `--profile=nazwa` wybiera plik z `profiles/`.
- `--env=plik` bierze konfigurację z innego pliku niż `.env`. Przydatne, gdy z jednego komputera korzysta kilka osób albo jedno konto cateringu ma kilka zamówień (np. `zona.env` z innym `MACZFIT_ORDER_ID` i profilem). Kreator też to przyjmuje: `node setup.js --env=zona.env`. Plany są zapisywane osobno per zamówienie.
- `--company=<company-id>` i `--host=<panel>` tylko dla providera `dietly`. Listę company-id wspólnego panelu pokazuje `node setup.js`; catering z własnym panelem ma je w `https://<host>/config.js`.

Ustawienie konkretnych dań po nazwie, bez AI:

```bash
node set.js maczfit fixes.json --apply
# fixes.json: [{ "date": "2026-10-14", "meal": "Obiad", "dish": "mintaj" }]
```

## Jak to działa

`optimize.js` jest wspólny. Każdy plik w `providers/` implementuje ten sam interfejs: `login()`, `listOrders()`, `listDeliveries(order)`, `getSlots(delivery)` (posiłki dnia z obecnym daniem i listą zamienników w jednym formacie) i `applySwap(delivery, slot, option)`. Maczfit i Vikinga stoją na tej samej platformie Dietly, ale Maczfit ma własną wersję API, stąd osobny provider. Dodanie cateringu spoza Dietly to nowy plik w `providers/` i wpis w `providers/index.js`.

`lib/scoring.js` to prosta punktacja po makro i słowach kluczowych. Służy tylko jako informacja w logu i awaryjny fallback, gdy model nie zwróci numeru opcji.

## Zanim użyjesz

- Hasło do cateringu leży jawnym tekstem w `.env` na Twoim dysku. Plik jest w `.gitignore`, nie wrzucaj go nigdzie.
- Skład i makro dań (bez Twoich danych) lecą do Groq, czyli na serwery w USA.
- API cateringów są nieoficjalne, odtworzone z paneli klienta. Mogą się zmienić bez zapowiedzi, a regulamin cateringu może nie przewidywać automatów. Używasz na własnym koncie i na własne ryzyko.
- Przed `--apply` zawsze przejrzyj podgląd. Provider `dietly` był sprawdzony na tej samej API co Vikinga, ale nie na koncie z dietly.pl. Jeśli coś nie działa, zgłoś z wynikiem `--show-prompt` i komunikatem błędu.
