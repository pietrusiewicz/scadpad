#!/usr/bin/env bash
# Wgrywa build scadpad do strony Beginner3D.
#
#   ./integration/beginner3d/install.sh          # build + kopiowanie + collectstatic
#   SITE=~/inny-serwis ./integration/beginner3d/install.sh
#
# Nie restartuje kontenera i nie dotyka bazy — statyki i jeden widok nie wymagają
# restartu, o ile collectstatic poszedł po kopiowaniu.
set -euo pipefail

SITE="${SITE:-/opt/beginner3d}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DEST="$SITE/static/scadpad"

if [ ! -d "$SITE" ]; then
  echo "Nie ma katalogu $SITE — ustaw SITE=/ścieżka/do/serwisu" >&2
  exit 1
fi

echo "== build w $REPO"
cd "$REPO"
npm run build

echo "== kopiowanie do $DEST"
mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$REPO/dist/" "$DEST/"
else
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -a "$REPO/dist/." "$DEST/"
fi

echo "== collectstatic"
cd "$SITE"
if [ -x .venv/bin/python ]; then
  .venv/bin/python manage.py collectstatic --noinput
else
  python3 manage.py collectstatic --noinput
fi

echo "Gotowe. Sprawdź: /edytor/ (widok musi być podpięty w finder/urls.py)."
