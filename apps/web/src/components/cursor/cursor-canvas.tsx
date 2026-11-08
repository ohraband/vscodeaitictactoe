import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CursorPoint } from '../../realtime/use-cursor-channel';

function hueFor(playerId: string): number {
  let hash = 0;

  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) % 360;
  }

  return hash;
}

export function CursorCanvas({ dots }: { readonly dots: readonly CursorPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const draw = () => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const context = canvas.getContext('2d');

    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    for (const dot of dots) {
      const x = dot.x * width;
      const y = dot.y * height;
      const hue = hueFor(dot.playerId);

      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fillStyle = `hsla(${hue}, 85%, 62%, 0.18)`;
      context.fill();

      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fillStyle = `hsl(${hue}, 85%, 60%)`;
      context.shadowColor = `hsl(${hue}, 85%, 60%)`;
      context.shadowBlur = 12;
      context.fill();
      context.shadowBlur = 0;

      context.beginPath();
      context.arc(x, y, 1.6, 0, Math.PI * 2);
      context.fillStyle = 'rgba(255, 255, 255, 0.9)';
      context.fill();
    }
  };

  useLayoutEffect(draw, [dots]);

  useEffect(() => {
    const onResize = () => draw();

    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
