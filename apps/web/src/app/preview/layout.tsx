import type { ReactNode } from 'react';

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
