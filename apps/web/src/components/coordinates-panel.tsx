import { useEffect, useState } from 'react';
import type { EditorCanvasHandle, LiveEditEvent } from '@interrobang/editor';

interface Props {
  canvas: EditorCanvasHandle | null;
}

export function CoordinatesPanel({ canvas }: Props) {
  const [live, setLive] = useState<LiveEditEvent | null>(null);
  useEffect(() => {
    if (!canvas) return;
    return canvas.on('liveEdit', setLive);
  }, [canvas]);

  return (
    <div className="w-56 border-l border-border p-3 text-xs">
      <div className="text-muted-foreground uppercase tracking-wide mb-1">Coordinates</div>
      {live ? (
        <div className="font-mono">
          Δx {live.dx.toFixed(1)}
          <br />
          Δy {live.dy.toFixed(1)}
          <br />
          {live.pointIds.length} point(s)
        </div>
      ) : (
        <div className="text-muted-foreground">Drag a point.</div>
      )}
    </div>
  );
}
