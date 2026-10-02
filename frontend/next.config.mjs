/** @type {import('next').NextConfig} */
// Ikki rejim:
//  - ishlab chiqish: `npm run dev`, /api so'rovlari Go backendga (API_URL, standart :8080) proksi qilinadi;
//  - ishlab chiqarish: `npm run build:static` statik fayllar (out/) yaratadi, ularni Go server o'zi tarqatadi (bitta port, internet kerak emas).
const isExport = process.env.NEXT_OUTPUT === 'export';
const api = process.env.API_URL || 'http://localhost:8080';

const config = {
  // StrictMode dev rejimida effektlarni ikki marta chaqiradi va katta modelni ikki marta import qiladi
  reactStrictMode: false,
  poweredByHeader: false,
  images: { unoptimized: true },
  ...(isExport
    ? { output: 'export' }
    : { async rewrites() { return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]; } }),
};

export default config;
