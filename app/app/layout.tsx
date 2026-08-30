import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '百官行述',
  description: '采集、重做、诊断与复习一体的行测错题工具',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <style>{`
          @media (max-width: 1000px) and (min-width: 721px) {
            .sidebar nav button {
              gap: 0;
              font-size: 0 !important;
              justify-content: center;
              overflow: visible;
            }

            .sidebar nav button i {
              display: block !important;
              width: 18px;
              font-size: 16px !important;
              line-height: 1;
            }

            .sidebar nav button .nav-label {
              z-index: 1000;
            }
          }

        `}</style>
        {children}
      </body>
    </html>
  );
}
