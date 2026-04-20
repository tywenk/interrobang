import { useCallback, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Glyph } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { drawLayer } from './render.js';

const INITIAL_SIZE = { width: 800, height: 600 };

export interface UseCanvasSizeOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  glyph: Glyph;
  /**
   * Called on every rAF tick to draw onto the canvas. The hook resets the
   * transform to DPR-scaled CSS pixels, clears, and then invokes the callback.
   */
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface UseCanvasSizeResult {
  viewport: Viewport;
  scheduleDraw: () => void;
  fitToGlyph: () => void;
}

/**
 * Owns the Viewport instance, ResizeObserver, DPR-aware bitmap sizing, and the
 * rAF-gated scheduleDraw pump. Kept intentionally framework-light — it mirrors
 * the latest glyph via a ref so event handlers don't need to re-subscribe.
 */
export function useCanvasSize({
  containerRef,
  canvasRef,
  glyph,
  draw,
}: UseCanvasSizeOptions): UseCanvasSizeResult {
  const glyphRef = useRef(glyph);
  const drawRef = useRef(draw);

  useLayoutEffect(() => {
    glyphRef.current = glyph;
  }, [glyph]);

  useLayoutEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  const viewportRef = useRef<Viewport | null>(null);
  if (viewportRef.current === null) {
    viewportRef.current = new Viewport({
      canvasWidth: INITIAL_SIZE.width,
      canvasHeight: INITIAL_SIZE.height,
    });
  }
  const viewport = viewportRef.current;

  const sizeRef = useRef({ ...INITIAL_SIZE, dpr: 1 });
  const fittedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !canvas) return;
      const { dpr } = sizeRef.current;
      // Reset transform, clear backing store in bitmap pixels, then scale so
      // downstream draw code works in CSS pixels.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx);
    });
  }, [canvasRef]);

  const fitToGlyph = useCallback(() => {
    viewport.fitToGlyph(glyphRef.current);
    scheduleDraw();
  }, [viewport, scheduleDraw]);

  const applySize = useCallback(
    (cssWidth: number, cssHeight: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const bitmapW = Math.max(1, Math.round(cssWidth * dpr));
      const bitmapH = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== bitmapW) canvas.width = bitmapW;
      if (canvas.height !== bitmapH) canvas.height = bitmapH;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const prev = sizeRef.current;
      sizeRef.current = { width: cssWidth, height: cssHeight, dpr };
      viewport.resize(cssWidth, cssHeight);
      // Refit on the first sizing and whenever the container grows/shrinks
      // substantially — typical when the first measurement landed during a
      // layout transition and the real size arrived via ResizeObserver.
      const grew =
        fittedRef.current &&
        (cssWidth > prev.width * 1.5 ||
          cssHeight > prev.height * 1.5 ||
          cssWidth * 1.5 < prev.width ||
          cssHeight * 1.5 < prev.height);
      if (!fittedRef.current || grew) {
        viewport.fitToGlyph(glyphRef.current);
        fittedRef.current = true;
      }
      scheduleDraw();
    },
    [canvasRef, viewport, scheduleDraw],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    applySize(rect.width || INITIAL_SIZE.width, rect.height || INITIAL_SIZE.height);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      applySize(cr.width, cr.height);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, applySize]);

  return { viewport, scheduleDraw, fitToGlyph };
}

// Re-export drawLayer so consumers of this hook don't need a second import
// path when they only want to draw a layer into the context the hook manages.
export { drawLayer };
