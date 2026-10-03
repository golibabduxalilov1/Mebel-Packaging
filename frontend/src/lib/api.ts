/* Backend REST API mijozi. Token localStorage da saqlanadi va har so'rovga qo'shiladi. */
import type { LabDoc, Material, PackResult, PackSettings, SceneState, ImportOptions } from './types';
import type { PackItemIn } from './model/labdoc';
import type { PartSummary } from './lab/store';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const TOKEN_KEY = 'bu_token';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = '') { super(message); }
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* bo'sh */ }
}

async function request<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers.Authorization = 'Bearer ' + tok;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Server bilan aloqa yo\'q', 'network');
  }
  if (res.status === 401 && path !== '/api/auth/login') {
    setToken(null);
    if (typeof window !== 'undefined' && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/viewer')) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
    }
  }
  if (!res.ok) {
    let msg = res.statusText, code = '';
    try { const j = await res.json(); msg = j.error || j.message || msg; code = j.code || ''; } catch { /* bo'sh */ }
    throw new ApiError(res.status, msg, code);
  }
  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

/* ---------- turlar ---------- */
export interface User {
  id: number; login: string; fullName: string; roleId: number; roleName: string; lang: 'uz' | 'ru'; active: boolean; permissions: string[]; createdAt?: string;
}
export interface Role { id: number; name: string; description: string; permissions: string[]; system: boolean; users?: number }
export interface Permission { code: string; name: string }
export interface Order {
  id: number; number: string; name: string; client: string; note: string; fileName: string; format: string; fileSize: number;
  status: 'new' | 'lab' | 'packed' | 'done'; partsCount: number; boxesCount: number; packStale: boolean;
  gabarit: string; createdBy: string; createdAt: string; updatedAt: string; importOptions: ImportOptions | null;
}
export interface OrderFile { id: number; name: string; size: number; main: boolean }
export interface LabPayload { order: Order; doc: LabDoc | null; scene: SceneState | null; files: OrderFile[] }

/* ---------- API ---------- */
/** Eski/to'liq bo'lmagan server javobida massivlar tushib qolsa ham interfeys yiqilmasligi uchun. */
export function normPack(r: PackResult | null): PackResult | null {
  if (!r) return r;
  return { ...r, boxes: (r.boxes || []).map((b) => ({ ...b, issues: b.issues || [], items: (b.items || []).map((i) => ({ ...i, cavities: i.cavities || [] })) })),
    summary: r.summary || [], warnings: r.warnings || [], unplaced: r.unplaced || [] };
}
const normP = (p: Promise<PackResult>) => p.then((r) => normPack(r) as PackResult);

export const api = {
  login: (login: string, password: string) => request<{ token: string; user: User }>('POST', '/api/auth/login', { login, password }),
  me: () => request<User>('GET', '/api/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) => request<void>('POST', '/api/auth/password', { oldPassword, newPassword }),
  setLang: (lang: 'uz' | 'ru') => request<void>('PUT', '/api/auth/lang', { lang }),
  updateProfile: (fullName: string) => request<User>('PUT', '/api/auth/profile', { fullName }),

  users: () => request<User[]>('GET', '/api/users'),
  createUser: (u: { login: string; fullName: string; password: string; roleId: number; lang: string; active: boolean }) => request<User>('POST', '/api/users', u),
  updateUser: (id: number, u: Partial<{ login: string; fullName: string; password: string; roleId: number; lang: string; active: boolean }>) => request<User>('PUT', `/api/users/${id}`, u),
  deleteUser: (id: number) => request<void>('DELETE', `/api/users/${id}`),

  roles: () => request<Role[]>('GET', '/api/roles'),
  permissions: () => request<Permission[]>('GET', '/api/permissions'),
  createRole: (r: { name: string; description: string; permissions: string[] }) => request<Role>('POST', '/api/roles', r),
  updateRole: (id: number, r: { name: string; description: string; permissions: string[] }) => request<Role>('PUT', `/api/roles/${id}`, r),
  deleteRole: (id: number) => request<void>('DELETE', `/api/roles/${id}`),

  materials: () => request<Material[]>('GET', '/api/materials'),
  createMaterial: (m: Material) => request<Material>('POST', '/api/materials', m),
  updateMaterial: (id: number, m: Material) => request<Material>('PUT', `/api/materials/${id}`, m),
  deleteMaterial: (id: number) => request<void>('DELETE', `/api/materials/${id}`),

  defaultPackSettings: () => request<PackSettings>('GET', '/api/settings/packing'),
  saveDefaultPackSettings: (s: PackSettings) => request<PackSettings>('PUT', '/api/settings/packing', s),

  orders: (q: { search?: string; status?: string; from?: string; to?: string } = {}) => {
    const p = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => { if (v) p.set(k, v); });
    return request<Order[]>('GET', '/api/orders' + (p.toString() ? '?' + p : ''));
  },
  order: (id: number) => request<Order>('GET', `/api/orders/${id}`),
  createOrder: (fd: FormData) => request<Order>('POST', '/api/orders', fd),
  updateOrder: (id: number, o: Partial<Pick<Order, 'name' | 'client' | 'note' | 'status'>> & { importOptions?: ImportOptions; partsCount?: number; gabarit?: string }) =>
    request<Order>('PUT', `/api/orders/${id}`, o),
  deleteOrder: (id: number) => request<void>('DELETE', `/api/orders/${id}`),
  duplicateOrder: (id: number) => request<Order>('POST', `/api/orders/${id}/duplicate`),
  fileBlob: async (id: number, fid: number): Promise<Blob> => {
    const r = await request<Response>('GET', `/api/orders/${id}/files/${fid}`, undefined, true);
    return r.blob();
  },

  lab: (id: number) => request<LabPayload>('GET', `/api/orders/${id}/lab`),
  saveLab: (id: number, p: { doc: LabDoc; scene: SceneState; items: PackItemIn[]; signature: string; summary: PartSummary[] }) =>
    request<{ packStale: boolean }>('PUT', `/api/orders/${id}/lab`, p),

  pack: (id: number) => request<{ settings: PackSettings; result: PackResult | null; itemsCount: number }>('GET', `/api/orders/${id}/pack`).then((r) => ({ ...r, result: normPack(r.result) })),
  savePackSettings: (id: number, s: PackSettings) => request<PackSettings>('PUT', `/api/orders/${id}/pack/settings`, s),
  runPack: (id: number) => normP(request<PackResult>('POST', `/api/orders/${id}/pack/run`)),
  moveItem: (id: number, body: { itemUid: string; toBox: number }) => normP(request<PackResult>('POST', `/api/orders/${id}/pack/move`, body)),
  markItem: (id: number, itemUid: string, done: boolean) => normP(request<PackResult>('PUT', `/api/orders/${id}/pack/item/done`, { itemUid, done })),
  markReady: (id: number, boxNo: number, ready: boolean) => normP(request<PackResult>('PUT', `/api/orders/${id}/pack/box/${boxNo}/ready`, { ready })),
  setBoxLimit: (id: number, boxNo: number, maxWeight: number | null) => normP(request<PackResult>('PUT', `/api/orders/${id}/pack/box/${boxNo}`, { maxWeight })),

  exportUrl: (id: number, kind: 'report.xlsx' | 'report.pdf' | 'labels.pdf', lang: string) =>
    `${API_BASE}/api/orders/${id}/export/${kind}?lang=${lang}`,
  instructionUrl: (id: number, boxNo: number, lang: string) => `${API_BASE}/api/orders/${id}/export/box/${boxNo}/instruction.pdf?lang=${lang}`,
};

/** Fayl yuklab olish (eksport tugmalari). */
export async function download(url: string, name: string) {
  const res = await fetch(url, { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch { /* bo'sh */ }
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** PDF ni yuklab olib yangi oynada ochadi (chop etish uchun). */
export async function openPdf(url: string) {
  const res = await fetch(url, { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch { /* bo'sh */ }
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const u = URL.createObjectURL(blob);
  const w = window.open(u, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = u; a.download = 'instruction.pdf'; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
