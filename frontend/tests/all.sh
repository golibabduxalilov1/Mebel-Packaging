#!/bin/sh
# Frontend mantiq sinovlari (brauzersiz): import, laboratoriya hujjati, store, Bazis skripti namunasi.
set -e
cd "$(dirname "$0")"
npx tsx run.ts
npx tsx glue.ts
npx tsx store.ts
node bazis_mock.mjs
npx tsx bz.ts
npx tsx colada.ts
npx tsx pack.ts
# Qabul sinovi 1: Colada.dae elementlari Go algoritmiga beriladi (Go o'rnatilgan bo'lsa)
if command -v go >/dev/null 2>&1; then
  OUT="$(mktemp)"
  PACK_ITEMS_OUT="$OUT" npx tsx pack.ts >/dev/null
  if [ -s "$OUT" ]; then (cd ../../backend && PACK_ITEMS="$OUT" go test ./internal/upokovka -run Colada -count=1); fi
fi
