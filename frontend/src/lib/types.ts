/* Umumiy turlar. Barcha o'lchamlar mm da. */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w
export type Vec2 = [number, number];

/** Detalning semantik turi (F8, F9). */
export type PartKind = 'panel' | 'profile' | 'hardware' | 'ignore';

/** Detal geometriyasi qanday saqlangani. */
export type GeomKind = 'mesh' | 'contour' | 'box' | 'none';

export type SourceFormat = 'b3d' | 'dae' | 'obj' | 'json';

/** Mesh ichidagi material bo'lagi (bitta detal bir necha materialdan iborat bo'lishi mumkin). */
export interface MatGroup {
  material: string;
  color: string;
  texName: string;
  start: number; // uchlar (vertex) indeksi
  count: number; // uchlar soni
}

export interface EdgeBand {
  elem: number;
  mat: string;
  sign: string;
  thick: number;
  width: number;
}

export interface CutInfo {
  loop: Vec2[];
  depth: number;
  top: boolean;
}

/** Yo'naltirilgan gabarit qutisi: o'qlar dunyo koordinatasida, size shu o'qlar bo'yicha. */
export interface OBB {
  center: Vec3;
  axes: [Vec3, Vec3, Vec3];
  size: Vec3;
}

/** Import natijasidagi bitta detal (bitta nusxa). */
export interface Part {
  id: string;
  name: string;
  baseName: string;
  material: string;
  kind: PartKind;
  geom: GeomKind;
  group: string;
  color: string;
  note: string;

  /* mesh geometriya (dunyo koordinatasi, mm) */
  positions?: Float32Array;
  uvs?: Float32Array | null;
  matGroups?: MatGroup[];
  tris?: number;

  /* Bazis kontur paneli */
  loops?: Vec2[][];
  lineLoops?: number;
  circles?: { c: Vec2; r: number }[];
  cuts?: CutInfo[];
  thick?: number;
  zShift?: number;
  bb2?: Vec2; // kontur chap-past burchagi
  edges?: EdgeBand[];
  arcCount?: number;

  /* quti (furnitura yoki Bazis skripti JSON) */
  boxMin?: Vec3;
  boxMax?: Vec3;

  /* joylashuv (kontur va quti uchun) */
  pos?: Vec3;
  quat?: Quat;

  /* hisoblangan qiymatlar */
  bbox: { min: Vec3; max: Vec3 } | null; // dunyo AABB
  obb: OBB | null;
  /** Jadval uchun: uzunlik >= eni >= qalinlik. null = noma'lum. */
  dims: { L: number | null; W: number | null; T: number | null };
  /** Yuza maydoni (kontur bo'yicha, mm2) yoki null */
  area: number | null;
  /** Hajm mm3 yoki null */
  volume: number | null;

  artPos?: string;
  des?: string;
  edgeText?: string; // kromka matni; bo'sh bo'lsa "noma'lum"
  bent?: boolean;
  product?: string;
}

export interface ImportOptions {
  unit: 'auto' | 'mm' | 'cm' | 'm';
  upAxis: 'auto' | 'Y' | 'Z';
  /** DAE: detal darajasi. top = yuqori daraja elementlari (TZ F6), mesh = har bir mesh tuguni */
  daeLevel: 'top' | 'mesh';
}

export const DEFAULT_IMPORT: ImportOptions = { unit: 'auto', upAxis: 'auto', daeLevel: 'top' };

export interface ImportResult {
  name: string;
  format: SourceFormat;
  source: string;
  unit: 'mm';
  parts: Part[];
  warnings: string[];
  notes: string[];
  gabarit: Vec3 | null; // eni x balandlik x chuqurlik
  thumb?: Uint8Array | null;
  stats: Record<string, number | string>;
}

export class ProtectedFileError extends Error {
  constructor(public modelName: string) {
    super('protected');
  }
}

/* ---------- Laboratoriya hujjati (saqlanadigan holat) ---------- */

export interface PartEdit {
  name?: string;
  L?: number;
  W?: number;
  T?: number;
  material?: string;
  kind?: PartKind;
  weight?: number; // kg, qo'lda
}

/** Birlashgan qator (F14, F15). */
export interface Row {
  id: string;
  members: string[]; // part id lar
  manual: boolean;
  qty?: number; // qo'lda o'zgartirilgan soni
}

/** Yelimlash bog'lanishi: asosiy detal va unga biriktirilgan detallar (geometriya o'zgarmaydi). */
export interface GlueLink {
  main: string; // asosiy detal id
  attached: string[]; // yelimlangan detal id lar
}

export interface CompositeMember {
  partId: string;
  matrix: number[]; // 4x4 column-major; yelimlashda doim birlik (detal joyida qoladi)
  fromRow: string | null;
}

export interface Composite {
  id: string;
  name: string;
  mainId: string; // asosiy detal
  members: CompositeMember[];
  links: GlueLink[];
}

export interface LabDoc {
  version: number;
  edits: Record<string, PartEdit>;
  rows: Row[];
  composites: Composite[];
  mergeKey: { kromka: boolean; cuts: boolean };
}

export interface SceneState {
  camera: { pos: Vec3; target: Vec3 } | null;
  hidden: string[];
  mode: LabMode;
}

export type LabMode = 'view' | 'merge' | 'glue';

/* ---------- Materiallar ---------- */
export interface Material {
  id?: number;
  name: string;
  density: number | null; // kg/m3
  sheetL: number | null;
  sheetW: number | null;
  sheetWeight: number | null;
  method: 'density' | 'sheet' | 'manual';
}

/* ---------- Upokovka ---------- */
export interface PackSettings {
  maxWeight: number;
  sizeMode: 'auto' | 'manual';
  maxL: number;
  maxW: number;
  maxH: number;
  boxL: number;
  boxW: number;
  boxH: number;
  padding: number;
  wall: number;
  includeHardware: boolean;
  boxLimits: Record<string, number>;
}

export interface PackItemPlaced {
  uid: string;
  refKind: 'row' | 'composite';
  refUid: string;
  name: string;
  material: string;
  color?: string;
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  rotated: boolean;
  layer: number;
  weight: number;
}

export interface PackBox {
  no: number;
  l: number;
  w: number;
  h: number;
  innerL: number;
  innerW: number;
  innerH: number;
  weight: number;
  maxWeight: number;
  fill: number;
  items: PackItemPlaced[];
}

export interface PackWarning {
  code: 'unfit' | 'unknown_weight' | 'unknown_size' | 'hardware_no_size' | 'overweight_item';
  name: string;
  refUid: string;
  size?: string;
  reason: string;
}

export interface PackResult {
  boxes: PackBox[];
  warnings: PackWarning[];
  unplaced: { refUid: string; name: string; qty: number; reason: string }[];
  stale: boolean;
  computedAt: string;
}
