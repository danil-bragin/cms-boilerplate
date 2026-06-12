'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Renders `placeholder` until the element is near the viewport or the browser is
 * idle, then mounts `children`. Island JS never competes with the LCP paint.
 */
export function LazyHydrate({ children, placeholder }: { children: ReactNode; placeholder: ReactNode }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reveal = () => setShow(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          reveal();
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const idle = ric(reveal);
    return () => {
      io.disconnect();
      if (window.cancelIdleCallback && typeof idle === 'number') window.cancelIdleCallback(idle);
    };
  }, []);

  return <div ref={ref}>{show ? children : placeholder}</div>;
}
