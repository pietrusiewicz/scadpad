"""Widok edytora scadpad dla Django — do wklejenia jako finder/view_modules/edytor.py.

Serwuje zbudowany plik static/scadpad/index.html z dwiema podmiankami:

* ``<base href="/static/scadpad/">`` — build leży pod /static/, a podajemy go pod
  krótkim adresem /edytor/; dzięki <base> względne ścieżki do ``assets/`` trafiają
  we właściwe miejsce bez przepisywania całego HTML-a,
* atrybuty ``data-back-*`` na <body> — scadpad sam dokleja wtedy przycisk powrotu
  do serwisu. Robimy to atrybutami, a nie skryptem w linii, bo CSP strony nie
  wpuszcza skryptów inline.
"""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.contrib.staticfiles import finders
from django.http import Http404, HttpRequest, HttpResponse


def _index_html() -> Path:
    znaleziony = finders.find("scadpad/index.html")
    if znaleziony:
        return Path(znaleziony)

    # finders.find() nie widzi plików, gdy STATICFILES_DIRS jest puste i nie ma
    # jeszcze collectstatic — wtedy ratuje nas bezpośrednia ścieżka.
    zapas = Path(settings.BASE_DIR) / "static" / "scadpad" / "index.html"
    if zapas.exists():
        return zapas

    raise Http404("Brak builda scadpad w static/scadpad/. Uruchom: npm run build && ./install.sh")


def edytor(request: HttpRequest) -> HttpResponse:
    html = _index_html().read_text(encoding="utf-8")

    html = html.replace("<head>", '<head>\n    <base href="/static/scadpad/" />', 1)
    html = html.replace(
        "<body>",
        '<body data-back-href="/ui/" data-back-label="Beginner3D">',
        1,
    )

    response = HttpResponse(html, content_type="text/html; charset=utf-8")
    # HTML wskaże na pliki z hashem w nazwie, więc cache'ować go nie warto.
    response["Cache-Control"] = "no-cache"
    return response
