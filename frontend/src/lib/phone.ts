// O'zbekiston raqami: "+998 XX XXX XX XX" maskasi. Raqam/+ bilan boshlanmasa (eski oddiy login) o'zgartirmaydi.
export function fmtPhone(v: string): string {
  if (v && !/^[+\d]/.test(v)) return v;
  if (v.startsWith('+') && v.length < 4) return '';
  let d = v.replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  if (!d) return '';
  return ['+998', d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export const isPhone = (v: string) => v.replace(/\D/g, '').replace(/^998/, '').length === 9;
