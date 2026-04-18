import { useProjectStore } from '../stores/project-store';

export function GlyphList({ projectId }: { projectId: string }) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  if (!proj) return null;
  return (
    <div className="w-44 border-r border-border overflow-y-auto p-2">
      <div className="text-xs text-muted-foreground uppercase tracking-wide px-2 py-1">
        Glyphs
      </div>
      {proj.font.glyphOrder.map((id) => {
        const g = proj.font.glyphs[id]!;
        return (
          <div key={id} className="px-2 py-1 text-sm hover:bg-accent rounded">
            {g.name}{' '}
            <span className="text-xs text-muted-foreground">
              {g.unicodeCodepoint ? `U+${g.unicodeCodepoint.toString(16).toUpperCase()}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
