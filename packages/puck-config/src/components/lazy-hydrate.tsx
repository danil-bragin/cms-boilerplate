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
    let done = false;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) reveal(); },
      { rootMargin: '200px' },
    );
    const reveal = () => { if (done) return; done = true; io.disconnect(); setShow(true); };
    io.observe(el);
    const useRic = typeof window.requestIdleCallback === 'function';
    const idle = useRic ? window.requestIdleCallback(reveal) : window.setTimeout(reveal, 1500);
    el.addEventListener('pointerdown', reveal, { once: true });
    el.addEventListener('focusin', reveal, { once: true });
    return () => {
      io.disconnect();
      if (useRic) window.cancelIdleCallback(idle as number);
      else clearTimeout(idle as number);
      el.removeEventListener('pointerdown', reveal);
      el.removeEventListener('focusin', reveal);
    };
  }, []);

  return <div ref={ref}>{show ? children : placeholder}</div>;
}
