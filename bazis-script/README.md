# BazisPackExport.js (TZ 3.5, S1-S11)

Bazis-Mebelshchik ichida ishlaydigan skript: ochiq modeldagi har bir detalni alohida (birlashtirmasdan) JSON faylga yozadi. Fayl veb-tizimda "Yangi buyurtma" orqali `.json` sifatida import qilinadi (F7a).

> **Holat:** skript Bazis tashqarisida yozilgan. U Node.js ichida soxta Bazis obyektlari bilan sinalgan (`frontend/tests/bazis_mock.mjs`), lekin **Bazis ichida hali ishga tushirilmagan**. Bazis skript API nomlari versiyaga qarab farq qiladi, shuning uchun skript har bir xususiyatni mavjudligini tekshirib o'qiydi; topilmagani `null` bo'ladi.

## O'rnatish va ishga tushirish (S1)

1. `BazisPackExport.js` ni Bazis skriptlari papkasiga nusxalang.
2. Bazisda loyihani oching, skriptni ishga tushiring.
3. Bazis `Action.Properties` panel API sini qo'llasa, panelda ikkita belgi va "Экспортировать" tugmasi chiqadi. Sozlamalar `BazisPackExport.prop` fayliga saqlanadi va keyingi safar tiklanadi. Panel API topilmasa, eksport darhol bajariladi.
4. Saqlash oynasida fayl nomini tanlang; fayl mavjud bo'lsa qayta yozish so'raladi.

Sozlamalar: "Yashirin detallarni ham chiqarish" (standart: yo'q, S6), "3D joylashuvni (GMin/GMax) yozish" (standart: ha, S8).

## Nima o'qiladi (S2, S3)

Agar `Model.forEach` mavjud bo'lsa, u ishlatiladi; aks holda `Model.Count`/`Model.Objects[i]` orqali bloklar ichiga rekursiv kiriladi. Tur `AsPanel`, `AsFastener`, `AsExtrusion`/`AsProfile`, `AsBlock` xususiyatlari yoki sinf nomi (`TFurnPanel`, `TFastener`, `TFurnAsm`, `TAsmKit`, `TExtrusionBody`, `TFurnBlock`) bo'yicha aniqlanadi. Noma'lum tugun logga yoziladi va eksportni to'xtatmaydi (S9).

| Maydon | Manba | Izoh |
|---|---|---|
| `name` | `Name` | |
| `artPos` | `ArtPos` | |
| `designation` | `Designation` | |
| `material` | `MaterialName` | veb-tizimdagi materiallar jadvali bilan nom bo'yicha bog'lanadi |
| `length`, `width` | panel: `GSize.x/y` (yoki `ContourWidth/Height`); boshqalar: `GMax - GMin` | mm, `length >= width` |
| `thickness` | panel: `Thickness`; boshqalar: gabaritning eng kichik o'lchami | mm |
| `type` | `panel`, `hardware`, `profile` | |
| `product` | yuqori darajadagi blok nomi (`Owner` zanjiri) | jadvalda "Guruh" |
| `butts` | `Butts[i]`: `Material`, `Thickness`, `Sign` | kromka |
| `bent` | `Bent` | egilgan panel tashlab ketilmaydi (S5) |
| `hidden` | `Visible === false` (o'zi yoki ota bloki) | |
| `pos` | `GMin`, `GMax` | global gabarit, mm (S8) |

Sarlavha (S7, S10): `schemaVersion: 1`, `scriptVersion`, `bazisApiVersion` (`system.apiVersion`), `model`, `unit: "mm"`, `date`.

## Bazis ichida tekshirish ro'yxati (A31-A36)

1. Skript yuklanadimi, panel va "Экспортировать" tugmasi chiqadimi, sozlamalar qayta ochilganda tiklanadimi. Bazis va API versiyasini yozib qo'ying.
2. Модель_004 eksport qilinganda 53 panel va 16 furnitura chiqishi kerak (A32). Farq bo'lsa, qaysi detallar (egilgan, yashirin) ekanini yozing.
3. Egilgan panel `bent: true` bilan chiqadimi va `GSize` o'lchami to'g'rimi (A33).
4. Fayl UTF-8, kirill nomlar to'g'ri ko'rinadimi (A34).
5. Veb-tizimda import qilinganda jadval `.b3d` importi bilan bir xil ustunlarda chiqadimi (A35).
6. `GMin/GMax` global koordinatami (detal 3D da o'z joyida turadimi). Natijani "bor/yo'q" deb hujjatga yozing (A36). Agar koordinatalar lokal bo'lsa, `ToGlobal` qo'llash kerak bo'ladi: bu joy `vec(get(o, 'GMin'...))` qatorida.

Xato chiqsa: Bazis xabarini va skript logini (konsol) yuboring. Eng ehtimolli tuzatish joylari: `children()` (obyektlar ro'yxati), `asType()` (tur aniqlash), `exportJson()` ichidagi fayl yozish funksiyasi nomi (`system.writeTextFile`).

## Kengaytirish (S11)

Teshik, kontur, paz, frezerovka kabi ma'lumotlar keyingi bosqichda `addPart()` ichiga yangi maydon sifatida qo'shiladi; `schemaVersion` oshiriladi, veb-tizimdagi `bazisJson.ts` eski sxemani ham o'qishda davom etadi.
