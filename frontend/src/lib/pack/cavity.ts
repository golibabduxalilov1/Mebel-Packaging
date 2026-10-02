/*
 * Detal ichidagi bo'sh hajmlar (o'yiqlar). Koordinatalar detal o'qlarida (L >= W >= T), mm.
 * `closed` — olti yoqdan qaysilari yopiq (o'yiq tashqariga ochilmaydi).
 */
import type { LabDoc, Part } from '../types';

export interface Cavity {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  closed: boolean[];
}

/**
 * TODO: asl geometrik aniqlash fayl bilan birga yo'qolgan. Hozircha o'yiq aniqlanmaydi (bo'sh ro'yxat),
 * ya'ni upokovka detalni to'liq quti sifatida hisoblaydi — natija xavfsiz, lekin ichma-ich joylashtirish ishlamaydi.
 */
export function entityCavities(
  _doc: LabDoc, _parts: Part[], _id: string, _kind: 'row' | 'composite', _members: string[], _dims: [number | null, number | null, number | null],
): Cavity[] {
  return [];
}
