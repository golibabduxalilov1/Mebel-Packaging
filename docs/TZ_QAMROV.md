# TZ v1.3 qamrovi

Holat belgilari:

- **Sinalgan**: kod shu muhitda ishga tushirilib tekshirilgan (brauzersiz sinov, Python nusxa yoki mock).
- **Yozilgan**: kod bor, lekin bu muhitda ishga tushirilmagan (Go kompilyatsiyasi, brauzer, PostgreSQL yoki Bazis kerak).
- **Bazisda**: faqat Bazis ichida tekshirish mumkin.

## Funksiyalar

| Band | Qisqacha | Qayerda | Holat |
|---|---|---|---|
| F1 | Kirish | `auth`, `app/login` | Yozilgan |
| F2 | Foydalanuvchilar | `admin`, `app/admin/users` | Yozilgan |
| F3 | Rollar va ruxsatlar | `admin`, `app/admin/roles`, `platform.Need` | Yozilgan |
| F4 | Til UZ/RU | `lib/i18n`, `PUT /auth/lang`, hisobot `lang` | Lug'atlar Sinalgan, UI Yozilgan |
| F5 | `.b3d` import | `lib/import/b3d.ts` | Noto'g'ri fayl xatosi Sinalgan; haqiqiy `.b3d` fayl bilan sinalmagan |
| F6 | `.dae` import | `lib/import/dae.ts` | Sinalgan (namuna DAE, katta DAE) |
| F7 | `.obj` + `.mtl` | `lib/import/obj.ts` | Sinalgan |
| F7a | Bazis JSON | `lib/import/bazisJson.ts` | Sinalgan (skript mock natijasi) |
| F8 | Import sozlamalari (birlik, yuqori o'q, DAE darajasi) | `ImportPanel`, `finalize.ts` | Sinalgan (mantiq) |
| F9 | Detallar jadvali | `PartsTable` | Yozilgan (ma'lumot qismi Sinalgan) |
| F10 | Sahna boshqaruvi | `LabEngine`, `Viewport` | Yozilgan |
| F11 | 2D ko'rish | `Drawing2D` | Yozilgan |
| F12 | Ma'lumotlar paneli, CSV | `DataPanel` | Yozilgan |
| F13 | Detalni tahrirlash, aslini tiklash | `PropsPanel`, `store.editSelected` | Sinalgan (store) |
| F14 | Avto birlashtirish | `labdoc.autoRows` | Sinalgan |
| F15 | Qo'lda birlashtirish/ajratish, son | `MergePanel`, `store` | Sinalgan (store) |
| F16 | Materiallar jadvali | `materials`, `app/materials` | Yozilgan; og'irlik hisobi Sinalgan |
| F17 | Yelimlash rejimi: asosiy detalni tanlash, yelimlanadigan detallarni tanlash (bosish, Ctrl, ramka, jadval) | `GluePanel`, `store.glueAdd`, `PartsTable`, `LabEngine` | Mantiq Sinalgan, 3D sichqoncha Yozilgan |
| F18 | "Yelimla": tanlanganlar asosiy detalga biriktiriladi, detallar joyida qoladi (siljitish, burish, snap yo'q) | `labdoc.glue`, `store.glueConfirm` | Sinalgan (Colada.dae bilan ham) |
| F19 | Kompozit | `labdoc`, `store.glueConfirm` | Sinalgan |
| F20 | Yelimlashni bekor qilish, ajratish | `store.detachPart/dissolveOf`, undo | Sinalgan |
| F21 | Upokovka sozlamalari, quti limiti | `SettingsForm`, `upokovka` | Algoritm Sinalgan (Python), API Yozilgan |
| F22 | Upokovkani ishga tushirish | `upokovka.Pack` | Sinalgan (Python nusxa), Go testlar Yozilgan |
| F23 | Sig'maslik ogohlantirishi | `upokovka.Expand` | Sinalgan (Python), Go testi Yozilgan |
| F24 | Natijalar | `PackWorkspace` | Yozilgan |
| F25 | Upokovkaga o'tish | `LabWorkspace` → `/pack` | Yozilgan |
| F26 | Upokovka 3D muhiti | `PackEngine` | Yozilgan |
| F27 | Natijani qo'lda tahrirlash | `upokovka.Move/SetLimit`, sudrash | Go testi Yozilgan |
| F28 | Hisobot (Excel, PDF) | `eksport` | Yozilgan |
| F29 | Yorliq (A6 PDF) | `eksport.LabelsPDF` | Yozilgan |
| F30 | Buyurtmalar tarixi | `tarix`, `app/orders` | Yozilgan |
| F31 | Sozlamalarni saqlash | `app_settings`, `app/materials` | Yozilgan |

## Ish muhiti (W1-W9)

W1-W8 laboratoriya sahifasida (`LabWorkspace`, `Chrome.tsx`, `GluePanel`, `store`): bitta sahna, rejimlar sahnani qayta yuklamaydi, kontekst panel rejimga mos, Ctrl va ramka bilan tanlash, yelimlash qadam ko'rsatkichi (3 qadam: asosiy detalni tanla, yelimlanadigan detallarni tanla, "Yelimla"), kontekst menyu va qisqa tugmalar, holat qatori, sahna holatini saqlash. W9 alohida `/pack` sahifasida. Holat: Yozilgan (store mantiqi Sinalgan, brauzerda ko'rilmagan).

## Bazis skripti (S1-S11)

`bazis-script/BazisPackExport.js`. Mock bilan Sinalgan: S2 (ikkala aylanish usuli), S3, S4, S5, S6, S7 sarlavhasi, S8 `pos`, S10. **Bazisda**: S1 (panel va `.prop`), API nomlarining haqiqiy mosligi, S8 koordinatalar global ekanligi, A31-A36.

## Qabul mezonlari bo'yicha eslatmalar

- **A5** (shkaf gabariti 2396 × 2067 × 503 mm): sizning haqiqiy DAE/B3D faylingiz bilan tekshirilishi kerak; bu muhitda o'sha fayl yo'q edi.
- **A30** (testlar): `backend/internal/upokovka/algorithm_test.go` (Go), `frontend/tests/` (TS), `tools/packing_port_test.py`.
- **A32** (53 panel, 16 furnitura): Bazisda Модель_004 bilan.
- **A37** (mustaqillik): kodda GibLab kodidan nusxa yo'q; skript faqat Bazis API ga murojaat qiladi.
- **A38** (eskirgan natija): imzo solishtirish (`lab_docs.signature` va `pack_runs.signature`), hisobotda ogohlantirish.

## Ma'lum cheklovlar

- `.b3d` formati ochiq hujjatlashtirilmagan: o'quvchi faqat shifrlanmagan BZ85 tuzilmasini qo'llaydi; o'qilmasa Bazis skripti (JSON) yoki DAE/OBJ ishlatiladi.
- Upokovka evristik: limit va kesishuvsizlik kafolatlangan, qutilar soni nazariy minimum emas. Detallar faqat yotqizib qo'yiladi (TZ talabi).
- Qo'lda ko'chirilgandan keyin bo'sh qolgan quti o'chiriladi va qutilar qayta raqamlanadi; quti bo'yicha alohida limitlar har bir qutida saqlanadi.
- Yuklangan katta fayl laboratoriya har ochilganda qayta yuklab olinadi va import qilinadi (geometriya serverda keshlanmaydi).
