// @vitest-environment happy-dom
import './setup';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Mark } from '../src/components/game/mark';

function styleValue(element: Element, property: string): string {
  return (element as SVGElement).style.getPropertyValue(property);
}

describe('Mark', () => {
  it('draws both X strokes using the normalized path length', () => {
    const { container } = render(<Mark symbol="X" animate />);
    const paths = Array.from(container.querySelectorAll('path'));

    expect(paths).toHaveLength(2);

    for (const path of paths) {
      expect(path).toHaveAttribute('pathLength', '1');
      expect(Number.parseFloat(styleValue(path, 'stroke-dasharray'))).toBe(1);
      expect(Number.parseFloat(styleValue(path, 'stroke-dashoffset'))).toBe(0);
      expect(styleValue(path, 'animation')).toContain('mark-draw');
      expect(styleValue(path, 'animation')).toContain('backwards');
    }
  });

  it('draws O using the normalized circumference', () => {
    const { container } = render(<Mark symbol="O" animate />);
    const circle = container.querySelector('circle');

    expect(circle).not.toBeNull();
    expect(circle).toHaveAttribute('pathLength', '1');
    expect(Number.parseFloat(styleValue(circle!, 'stroke-dasharray'))).toBe(1);
    expect(Number.parseFloat(styleValue(circle!, 'stroke-dashoffset'))).toBe(0);
    expect(styleValue(circle!, 'animation')).toContain('mark-draw');
  });

  it('renders static marks without draw styles', () => {
    const { container } = render(<Mark symbol="O" />);
    const circle = container.querySelector('circle');

    expect(circle).not.toBeNull();
    expect(styleValue(circle!, 'stroke-dasharray')).toBe('');
    expect(styleValue(circle!, 'animation')).toBe('');
  });
});
