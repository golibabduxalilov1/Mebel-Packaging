import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// Shriftlar paket ichida (internet talab qilinmaydi)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Bazis upokovka',
  description: 'Mebel detallarini import qilish, birlashtirish, yelimlash va qadoqlash tizimi',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f8f9ff' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz-Latn">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
