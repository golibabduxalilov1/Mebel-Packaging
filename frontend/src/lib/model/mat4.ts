/* 4x4 matritsa (ustun bo'yicha, THREE.Matrix4.elements bilan bir xil tartib). */
import type { Vec3 } from '../types';

export type M4 = number[];

export const ident = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function isIdent(m: M4, eps = 1e-9): boolean {
  const I = ident();
  for (let i = 0; i < 16; i++) if (Math.abs(m[i] - I[i]) > eps) return false;
  return true;
}

export function mul(a: M4, b: M4): M4 {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
    r[c * 4 + rr] = s;
  }
  return r;
}

export const translation = (t: Vec3): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];

/** O'q atrofida burish (o'q birlik vektor, burchak radianda). */
export function rotation(axis: Vec3, ang: number): M4 {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}

export function point(m: M4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

export function dir(m: M4, d: Vec3): Vec3 {
  return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export function normalize(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** u ni v ga eng qisqa burish. */
export function rotateOnto(u: Vec3, v: Vec3): M4 {
  const a = normalize(u), b = normalize(v);
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  if (d > 1 - 1e-9) return ident();
  if (d < -1 + 1e-9) {
    const helper: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return rotation(normalize(cross(a, helper)), Math.PI);
  }
  return rotation(normalize(cross(a, b)), Math.acos(d));
}

/** Nuqta atrofida burish. */
export function rotationAbout(p: Vec3, axis: Vec3, ang: number): M4 {
  return mul(translation(p), mul(rotation(axis, ang), translation([-p[0], -p[1], -p[2]])));
}
