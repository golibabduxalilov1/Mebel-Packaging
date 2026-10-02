# Arxitektura

## Umumiy oqim

1. **Buyurtma yaratish** (`/orders`): foydalanuvchi faylni tanlaydi, brauzer uni Web Worker ichida import qilib tekshiradi (detal soni, gabarit), keyin manba fayl va import sozlamalari serverga yuklanadi (`POST /api/orders`, multipart).
2. **Laboratoriya** (`/lab?id=`): manba fayl serverdan yuklab olinadi va xuddi shu sozlamalar bilan qayta import qilinadi. Import deterministik: detal identifikatorlari har safar bir xil, shuning uchun saqlangan laboratoriya hujjati (tahrirlar, qatorlar, kompozitlar) shu detallarga qo'llanadi. O'zgarishlar avtomatik saqlanadi (`PUT /api/orders/:id/lab`).
3. **Upokovka** (`/pack?id=`): laboratoriya saqlagan "upokovka elementlari" (qatorlar va kompozitlar: o'lcham, og'irlik, soni) serverda algoritmga beriladi. Natija bazada (`boxes`, `box_items`), 3D da alohida sahnada ko'rsatiladi.
4. **Eksport**: Excel/PDF hisobot va A6 yorliqlar serverda yaratiladi.

Geometriya serverda saqlanmaydi va qayta ishlanmaydi: bu katta modellarda (200 MB gacha) serverni yengil qiladi va bitta import kodini (TypeScript) saqlaydi. Server faqat jadval xulosalarini (`parts`, `part_merges`, `composites`, `glue_links`) hisobot va qidiruv uchun yuritadi.

**Eskirgan natija (A38):** laboratoriya har saqlashda upokovka elementlaridan imzo (`signature`) hisoblaydi. Upokovka natijasi o'sha imzo bilan saqlanadi; farq bo'lsa natija "eskirgan" deb belgilanadi, hisobotga ogohlantirish yoziladi.

## Frontend (`frontend/src`)

| Papka | Vazifa |
|---|---|
| `lib/import/` | `.b3d` (BZ85), `.dae`, `.obj`+`.mtl`, Bazis JSON o'quvchilari; `finalize.ts` (gabarit, OBB, o'lcham, birlik va yuqori o'q); `import.worker.ts` |
| `lib/model/` | `labdoc.ts` (hujjat: tahrirlar, avto/qo'lda qatorlar, kompozitlar, og'irlik, upokovka elementlari), `mat4.ts` |
| `lib/lab/` | `LabEngine.ts` (three.js sahna: tanlash, ramka, o'lchash, yoyish, rentgen, qirralar, asosiy/yelimlanadigan detallarni bo'yash), `store.ts` (holat, undo/redo, avtosaqlash) |
| `lib/pack/` | `PackEngine.ts` (kartonlar, qopqoq, qatlam filtri, yuqoridan 2D, boshqa qutiga sudrash) |
| `components/` | laboratoriya panellari, upokovka ish joyi, umumiy UI (modal, toast, ikonalar, sarlavha) |
| `app/` | sahifalar: `login`, `orders`, `lab`, `pack`, `materials`, `admin/users`, `admin/roles`, `profile`, `viewer` (serverga yuklamasdan ko'rish) |
| `lib/i18n/` | UZ/RU lug'atlari (kalitlar to'liqligi `npm run check:i18n` bilan tekshiriladi) |

Statik eksport (`npm run build:static`) `out/` papkasini yaratadi; sahifalar `?id=` parametri bilan ishlaydi, shuning uchun dinamik yo'l kerak emas.

## Backend (`backend/`)

| Paket | Vazifa |
|---|---|
| `internal/platform` | konfiguratsiya, GORM modellari (TZ 7-bo'lim jadvallari), migratsiya va boshlang'ich ma'lumot, JWT, ruxsat middleware |
| `internal/auth` | kirish (urinishlar cheklovi bilan), joriy foydalanuvchi, parol, til, profil |
| `internal/admin` | foydalanuvchilar va rollar (o'zini bloklash/o'chirish va tizim rolidan P10 ni olishdan himoya) |
| `internal/materials` | materiallar, standart upokovka sozlamalari |
| `internal/tarix` | buyurtmalar: yaratish (fayl saqlash), qidiruv/filtr, nusxa, o'chirish, fayl yuklab berish |
| `internal/model` | laboratoriya hujjati va sahna holati; ruxsatlar o'zgarish turiga qarab: tahrir P2, qatorlar P3, kompozitlar P4 |
| `internal/upokovka` | algoritm (`algorithm.go`), sinovlar, API |
| `internal/eksport` | Excel (excelize), PDF hisobot va yorliq (fpdf, DejaVu shrifti, kirill/lotin) |
| `internal/web` | `frontend/out` statik fayllarini tarqatish |

### Upokovka algoritmi

- Har bir element `qty` marta birlikka ajratiladi; o'lchamlar tartiblanadi (L ≥ W ≥ T), detal yotqizib qo'yiladi (balandlik = T).
- Chiqarib tashlanadi va ogohlantiriladi: o'lchami noma'lum, og'irligi noma'lum, bitta o'zi limitdan og'ir, hech bir qutiga sig'maydi. Furnitura standart holatda qadoqlanmaydi.
- Quti ichida qatlamlar: qatlam balandligi birinchi detal qalinligi; qatlam ichida MaxRects (Best Short Side Fit), 90° burish bilan. Yangi detal avval mavjud qatlamlarga (eng kam vertikal isrof), keyin yangi qatlamga.
- Guruhlar (bir xil qator yoki kompozit) katta asosdan kichigiga: butun guruh mavjud qutiga, bo'lmasa yangi qutiga, bo'lmasa birma-bir.
- Oxirida oxirgi qutini boshqalarga taqsimlab qutilar sonini kamaytirishga urinadi.
- Avto rejimda quti tarkibga moslab kichraytiriladi (bo'shliq va karton qalinligi qo'shiladi), qo'lda rejimda o'lcham o'zgarmaydi.
- Og'irlik limiti qat'iy: na hisoblashda, na qo'lda ko'chirishda oshmaydi.

Bu evristik usul: natija har doim to'g'ri (kesishuvsiz, limit ichida), lekin qutilar soni nazariy minimum bo'lishi kafolatlanmaydi.

## API

Barcha so'rovlar `Authorization: Bearer <token>` bilan (kirishdan tashqari). Xato javobi: `{"error": "...", "code": "..."}`.

| Metod va yo'l | Ruxsat | Vazifa |
|---|---|---|
| `POST /api/auth/login` | ochiq | `{login, password}` → `{token, user}` |
| `GET /api/auth/me` | kirgan | joriy foydalanuvchi |
| `POST /api/auth/password` | kirgan | `{oldPassword, newPassword}` |
| `PUT /api/auth/lang`, `PUT /api/auth/profile` | kirgan | til, F.I.Sh. |
| `GET/POST /api/users`, `PUT/DELETE /api/users/:id` | P10 | foydalanuvchilar |
| `GET/POST /api/roles`, `PUT/DELETE /api/roles/:id`, `GET /api/permissions` | P10 | rollar |
| `GET /api/materials` | kirgan | materiallar |
| `POST/PUT/DELETE /api/materials[/:id]` | P6 yoki P10 | material tahriri |
| `GET /api/settings/packing`, `PUT` | kirgan / P6 | standart upokovka sozlamalari |
| `GET /api/orders?search=&status=&from=&to=` | P9 yoki P1 | ro'yxat |
| `POST /api/orders` | P1 | multipart: `file`, `extra[]`, `name`, `client`, `note`, `importOptions`, `partsCount`, `gabarit` |
| `GET/PUT/DELETE /api/orders/:id`, `POST /api/orders/:id/duplicate` | P9/P1 | buyurtma |
| `GET /api/orders/:id/files/:fid` | P9 yoki P1 | manba fayl |
| `GET /api/orders/:id/lab` | P9 yoki P1 | `{order, doc, scene, files}` |
| `PUT /api/orders/:id/lab` | P2/P3/P4 (o'zgarishga qarab) | `{doc, scene, items, signature, summary}` → `{packStale}` |
| `GET /api/orders/:id/pack` | P9 yoki P5 | `{settings, result, itemsCount}` |
| `PUT /api/orders/:id/pack/settings` | P6 | buyurtma sozlamalari |
| `POST /api/orders/:id/pack/run` | P5 | hisoblash |
| `POST /api/orders/:id/pack/move` | P7 | `{itemUid, toBox}`; 409 `over_limit` yoki `no_fit` |
| `PUT /api/orders/:id/pack/box/:no` | P7 | `{maxWeight}` (null = umumiy limit) |
| `GET /api/orders/:id/export/report.xlsx`, `.../report.pdf`, `.../labels.pdf`, parametr `lang=uz` yoki `ru` | P8 | eksport |

## Ma'lumotlar bazasi

GORM `AutoMigrate` ishga tushganda jadvallarni yaratadi: `roles`, `role_permissions`, `users`, `materials`, `orders`, `order_files`, `lab_docs`, `scene_states`, `parts`, `part_merges`, `composites`, `glue_links`, `packing_settings`, `app_settings`, `boxes`, `box_items`, `pack_runs`. Manba fayllar `STORAGE_DIR/<buyurtma id>/` da.
