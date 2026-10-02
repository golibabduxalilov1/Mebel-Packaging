# Bazis upokovka

Bazis-Mebelshchik modelidan mebel detallarini qadoqlash tizimi (TZ v1.3): fayl import, 3D laboratoriya (ko'rish, tahrirlash, birlashtirish, yelimlash), og'irlik limiti bo'yicha qutilarga upokovka, hisobot va quti yorliqlari.

| Qism | Texnologiya | Papka |
|---|---|---|
| Frontend | Next.js 14 (statik eksport), TypeScript, three.js | `frontend/` |
| Backend | Go 1.22, Fiber v2, GORM, PostgreSQL | `backend/` |
| Bazis skripti | Bazis JS skripti, JSON eksport | `bazis-script/` |
| Hujjatlar | arxitektura, API, TZ qamrovi | `docs/` |

Import (`.b3d`, `.dae`, `.obj` + `.mtl`, Bazis skripti `.json`) brauzerda Web Worker ichida bajariladi. Server manba faylni saqlaydi, laboratoriya hujjatini (tahrirlar, qatorlar, kompozitlar) va upokovka natijasini yuritadi, hisobot va yorliqlarni yaratadi. Ishlab chiqarishda bitta Go jarayoni ham API, ham sahifalarni bitta portda tarqatadi; internet talab qilinmaydi (shriftlar va kutubxonalar loyiha ichida).

## Tez ishga tushirish (Docker)

```bash
docker compose --profile full up --build
# http://localhost:8080  login: admin  parol: admin123 (darhol o'zgartiring)
```

`JWT_SECRET` va `ADMIN_PASSWORD` ni muhit o'zgaruvchisi orqali bering. `ADMIN_PASSWORD` faqat baza bo'sh bo'lganda (birinchi ishga tushirishda) ishlatiladi.

## Qo'lda ishga tushirish

Talablar: Node.js 20+, Go 1.22+, PostgreSQL 14+.

```bash
# 1) baza (faqat Postgres)
docker compose up -d db

# 2) frontend: statik fayllarni yig'ish (frontend/out)
cd frontend
npm install
npm run build:static

# 3) backend
cd ../backend
go mod tidy          # go.sum yaratiladi (birinchi marta internet kerak)
go test ./...        # upokovka algoritmi sinovlari
export DATABASE_URL="postgres://bazis:bazis@localhost:5432/bazis_upokovka?sslmode=disable"
export JWT_SECRET="uzun-tasodifiy-satr"
go run ./cmd/server  # http://localhost:8080
```

Backend `.env` faylni o'zi o'qimaydi: o'zgaruvchilarni `export` qiling yoki `backend/.env.example` dan nusxa olib, `set -a; . ./.env; set +a` bilan yuklang.

### Ishlab chiqish rejimi

```bash
cd backend && go run ./cmd/server          # :8080
cd frontend && npm run dev                 # :3000, /api so'rovlari :8080 ga proksi
```

## Muhit o'zgaruvchilari (backend)

| O'zgaruvchi | Standart | Izoh |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `DATABASE_URL` | `postgres://bazis:bazis@localhost:5432/bazis_upokovka?sslmode=disable` | PostgreSQL |
| `JWT_SECRET` | `dev-secret-ozgartiring` | ishlab chiqarishda albatta o'zgartiring |
| `JWT_HOURS` | `12` | sessiya muddati |
| `STORAGE_DIR` | `./data/files` | yuklangan manba fayllar |
| `STATIC_DIR` | `../frontend/out` | frontend statik fayllari |
| `FONTS_DIR` | `./assets/fonts` | PDF uchun DejaVu shriftlari |
| `ADMIN_PASSWORD` | `admin123` | birinchi admin paroli |
| `MAX_UPLOAD_MB` | `210` | yuklash chegarasi |

## Rollar va ruxsatlar

Boshlang'ich rollar: Administrator (P1-P10, tizim roli), Texnolog (P1-P5, P8, P9), Qadoqlovchi (P5-P9), Kuzatuvchi (P9). Rollar va ruxsatlar "Boshqaruv" sahifasida o'zgartiriladi; ruxsatlar har so'rovda bazadan o'qiladi, ya'ni o'zgarish darhol kuchga kiradi.

## Materiallar

Boshlang'ich materiallar (ЛДСП 16/18/25, МДФ, ХДФ, ДВП, shisha) **taxminiy** zichlik yoki list og'irligi bilan yaratiladi. Ishlab chiqarishdan oldin ularni haqiqiy qiymatlar bilan almashtiring. Material nomi fayldagi nom bilan mos kelishi kerak (katta-kichik harf farqlanmaydi); mos kelmasa detal og'irligi "noma'lum" bo'ladi va upokovkadan ogohlantirish bilan chiqariladi.

## Sinovlar

```bash
cd frontend && npm test        # import, laboratoriya hujjati, store, Bazis skripti namunasi (brauzersiz)
cd frontend && npm run check:i18n
cd backend && go test ./...    # upokovka algoritmi
python3 tools/packing_port_test.py   # algoritmning Python nusxasida tasodifiy sinovlar
```

## Holat: nima tekshirilgan, nima yo'q

Ishlab chiqish muhitida internet va Go kompilyatori yo'q edi, shuning uchun quyidagilar **sinab ko'rilgan**:

- frontend import (DAE, OBJ+MTL, Bazis JSON, himoyalangan/buzilgan `.b3d` xatosi), laboratoriya hujjati va yelimlash (asosiy + yelimlanadigan detallar, 3 qadam, geometriya o'zgarmasligi, Colada.dae qabul sinovi), `LabStore` mantiqi (tahrir, undo/redo, birlashtirish/ajratish, yelimlash, kompozitni ajratish, saqlash yuklamasi): `tsx` bilan, brauzersiz;
- frontend tiplari: haqiqiy React/three.js tiplari o'rniga soddalashtirilgan "stub" tiplar bilan `tsc` (JSX xususiyatlari to'liq tekshirilmagan);
- UZ/RU lug'atlari to'liqligi (`check:i18n`);
- upokovka algoritmi: Go kodining qatorma-qator Python nusxasida 300 ta tasodifiy holat (hamma detal joylanadi, kesishuv yo'q, quti ichida, limit oshmaydi);
- Bazis skripti: Node.js ichida soxta (mock) Bazis obyektlari bilan, natija frontend importida o'qildi.

**Sinab ko'rilmagan** (birinchi navbatda siz tekshirishingiz kerak):

- Go kodi kompilyatsiyasi va `go test` (kod qo'lda tekshirilgan, lekin kompilyator ishlatilmagan);
- `next build` va brauzerda 3D ko'rinish, sichqoncha bilan ishlash;
- PostgreSQL bilan haqiqiy ishlash, Excel/PDF fayllar ko'rinishi;
- `BazisPackExport.js` Bazis-Mebelshchik ichida (API nomlari versiyaga qarab farq qilishi mumkin);
- haqiqiy `.b3d` fayllar: format hujjatlashtirilmagan, o'quvchi faqat ochiq (shifrlanmagan) BZ85 tuzilmasi uchun.

Kompilyatsiyada xato chiqsa, xabarni yuboring: tuzatish odatda bir necha qator.

Batafsil: `docs/ARCHITECTURE.md` (tuzilma, API), `docs/TZ_QAMROV.md` (TZ bandlari bo'yicha holat), `bazis-script/README.md`.
