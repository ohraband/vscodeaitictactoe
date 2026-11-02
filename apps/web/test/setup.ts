import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, vi } from 'vitest';

vi.mock('motion/react', async () => {
  const React = await import('react');

  const make =
    (tag: string) =>
    ({
      initial: _initial,
      animate: _animate,
      transition: _transition,
      children,
      ...props
    }: Record<string, unknown>) =>
      React.createElement(tag, props, children as ReactNode);

  return {
    motion: {
      circle: make('circle'),
      line: make('line'),
      path: make('path'),
      span: make('span'),
    },
    useReducedMotion: () => false,
  };
});

vi.mock('lucide-react', () => {
  const Icon = () => null;

  return {
    ArrowLeft: Icon,
    ArrowRight: Icon,
    Check: Icon,
    CircleDot: Icon,
    Clock3: Icon,
    Copy: Icon,
    Keyboard: Icon,
    LogOut: Icon,
    Radio: Icon,
    RotateCcw: Icon,
    Sparkles: Icon,
    Users: Icon,
    WifiOff: Icon,
  };
});

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
