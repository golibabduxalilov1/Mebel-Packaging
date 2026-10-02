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
