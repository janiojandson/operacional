import { useState, useEffect } from 'react';

export type Breakpoint = 'desktop-wide' | 'laptop' | 'tablet' | 'mobile';

export function getBreakpoint(width: number): Breakpoint {
  if (width >= 1600) return 'desktop-wide';
  if (width >= 1280) return 'laptop';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

export function useBreakpoint() {
  const [width, setWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1920
  );

  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const breakpoint = getBreakpoint(width);

  return {
    width,
    breakpoint,
    isWideDesktop: breakpoint === 'desktop-wide',
    isLaptop: breakpoint === 'laptop',
    isTablet: breakpoint === 'tablet',
    isMobile: breakpoint === 'mobile',
    canExecuteOrders: width >= 1280
  };
}
