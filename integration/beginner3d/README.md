# Edytor scadpad na stronie Beginner3D (Django)

Cel: zakładka **Edytor** w nawigacji obok „Modele" i „Sklep", pod adresem
`/edytor/`, bez backendu — cały render dzieje się w przeglądarce.

## Co trzeba zrobić (4 pliki + komenda)

1. **Widok** — skopiuj `view_edytor.py` do `finder/view_modules/edytor.py`.

2. **URL** — w `finder/urls.py`, obok pozostałych `ui/*`:

   ```python
   from .view_modules import edytor as edytor_view
   ...
   path("edytor/", edytor_view.edytor, name="ui_edytor"),
   ```

3. **Przycisk w nawigacji** — w `templates/ui/base.html`, zaraz po linku „Apps"
   (linia z `ui/sklep`):

   ```html
   <a class="nav__link" href="/edytor/" {% if page == "edytor" %}aria-current="page"{% endif %}>Edytor</a>
   ```

   Bez `{% translate %}` — tak jak „Portfolio" i „Wygląd" w tym samym menu, żeby
   nie dokładać msgid do `.po`.

4. **Pliki builda** — z katalogu repozytorium scadpad:

   ```bash
   ./integration/beginner3d/install.sh
   ```

   Skrypt robi `npm run build`, kopiuje `dist/` do `static/scadpad/` i uruchamia
   `collectstatic`. Katalog docelowy zmienisz przez `SITE=...`.

## Dlaczego `<base href="/static/scadpad/">`

Build ma względne ścieżki (`./assets/index-abc123.js`), więc leży pod `/static/`,
a adres `/edytor/` serwuje ten sam `index.html` z wstrzykniętym `<base>`. Nie ma
drugiego builda ani przepisywania ścieżek w bundlu.

## CSP

`SecurityHeadersMiddleware` w `finder/middleware.py` już dziś ustawia:

```
script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; …
```

czyli dokładnie to, czego potrzebuje WASM i worker. **Żadnej zmiany w CSP nie
trzeba.** Jeśli ktoś kiedyś zawęzi `script-src` do `'self'` bez
`'wasm-unsafe-eval'`, edytor przestanie się uruchamiać w Chrome — to jedyna
pułapka w tej integracji.

## MIME dla `.wasm`

Python 3.12 zna `application/wasm`, a Django static podaje ten typ. Jeśli statyki
serwuje nginx, warto mieć w konfiguracji:

```nginx
types { application/wasm wasm; }
```

Nie jest to krytyczne (build pobiera plik jako `arrayBuffer`, nie strumieniem),
ale oszczędza ostrzeżenie w konsoli.

## Sprawdzenie

```bash
curl -sI https://beginner3d.duckdns.org/edytor/    # 200, text/html
curl -s  https://beginner3d.duckdns.org/edytor/ | grep -o 'base href="[^"]*"'
```

W przeglądarce: strona ładuje się w ~3–5 s (24 MB WASM), potem każdy render to
40–400 ms. Pomiar: przycisk **Pomiar**, dwa kliknięcia na modelu.

## Wycofanie

Wystarczy usunąć link z `base.html`, wpis z `urls.py` i katalog
`static/scadpad/` (plus `collectstatic`). Baza i kontenery bez zmian.
