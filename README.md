# meal-optimizer

Automatyczny wybór posiłków w cateringach dietetycznych z opcją "wybór menu". Skrypt loguje się do panelu klienta, pobiera na każdy dzień wszystkie dostępne zamienniki każdego posiłku (nazwa, pełny skład, makro, alergeny), pyta model językowy, który wybór najlepiej pasuje do Twojego profilu zdrowotnego, i zapisuje zamiany na koncie.

Obsługiwane cateringi (providery):

| provider | panel | logowanie |
|---|---|---|
| `maczfit` | maczfit.pl, "Moje diety" | e-mail i hasło |
| `vikinga` | panel.kuchniavikinga.pl | e-mail i hasło |
| `zdrowycatering` | zamowienie.zdrowycatering.pl | e-mail i hasło |

Wybór robi model `openai/gpt-oss-120b` przez Groq (darmowy klucz z console.groq.com). Kryteria wyboru są w zwykłym pliku tekstowym w `profiles/`, domyślny profil `wzjg` (wrzodziejące zapalenie jelita grubego w remisji: bez ostrych przypraw i przetworzonego mięsa, dużo białka, mało nasyconych i cukrów, lekkostrawnie). Własny profil to nowy plik `profiles/moj.txt` i `--profile=moj`.

## Instalacja

```bash
npm install
cp .env.example .env   # uzupełnij dane logowania i GROQ_API_KEY
```

## Użycie

```bash
# podgląd propozycji na zakres dat (nic nie zapisuje, plan trafia do plans/maczfit.json)
node optimize.js maczfit 2026-10-13 2026-10-31

# zapis dokładnie tego, co było w podglądzie (bez ponownego pytania AI)
node optimize.js maczfit 2026-10-13 2026-10-31 --apply

# bez dat: wszystkie dostawy, które da się jeszcze zmienić
node optimize.js zdrowycatering
```

Flagi:

- `--apply` zapisuje zmiany. Jeśli w `plans/` jest plan z podglądu dla tego samego zamówienia i zakresu, zapisuje go jeden do jednego i pomija posiłki, które w międzyczasie zmieniłeś ręcznie na stronie. Bez planu pyta AI i zapisuje od razu.
- `--replan` przy `--apply` ignoruje zapisany plan i pyta AI od nowa.
- `--show-prompt` wypisuje pełny prompt wysyłany do modelu.
- `--order=ID` albo `--order=all`, gdy na koncie jest kilka aktywnych zamówień (domyślnie `MACZFIT_ORDER_ID` itd. z `.env`).
- `--profile=nazwa` wybiera plik z `profiles/`.

Ustawienie konkretnych dań po nazwie, bez AI:

```bash
node set.js maczfit fixes.json --apply
# fixes.json: [{ "date": "2026-10-14", "meal": "Obiad", "dish": "mintaj" }]
```

## Jak to działa

`optimize.js` jest wspólny dla wszystkich cateringów. Każdy plik w `providers/` implementuje ten sam interfejs: `login()`, `listOrders()`, `listDeliveries(order)`, `getSlots(delivery)` (posiłki dnia z obecnym daniem i listą zamienników w jednym formacie) i `applySwap(delivery, slot, option)`. Dodanie nowego cateringu to nowy plik w `providers/` i wpis w `providers/index.js`.

`lib/scoring.js` to prosta punktacja po makro i słowach kluczowych. Służy tylko jako informacja w logu i awaryjny fallback, gdy model nie zwróci numeru opcji. Decyzję podejmuje AI.

## Ograniczenia

- Każdy catering ma deadline zmian: Maczfit około 2 dni przed dostawą (API podaje ile zostało), Vikinga i Zdrowy Catering około 3 dni. Skrypt pomija dostawy po deadlinie.
- Menu jest publikowane około 2 tygodnie naprzód. Dalsze dni mają 0 zamienników i skrypt to wypisuje.
- Darmowy tier Groq ma limit tokenów na minutę, przy pełnym składzie dań to kilka pytań na minutę. Skrypt czeka i ponawia sam, ale duży zakres dat lepiej robić partiami po tygodniu.
- API cateringów są nieoficjalne (odtworzone z panelu klienta). Mogą się zmienić bez zapowiedzi. Używasz na własne ryzyko i na własnym koncie.
- Przed `--apply` zawsze przejrzyj podgląd. Model bywa nieomylny tylko w reklamach.
