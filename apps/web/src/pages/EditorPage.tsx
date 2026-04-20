import { useEffect, useState } from 'react';
import { projectRoute } from '../router';
import { getStorage } from '../services/storage';
import { useProjectStore } from '../stores/project-store';
import { useEditorStore } from '../stores/editor-store';
import { EditorShell } from '../components/EditorShell';
import { TabBar } from '../components/TabBar';
import { GlyphList } from '../components/GlyphList';
import { CoordinatesPanel } from '../components/CoordinatesPanel';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useEditorKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { scheduleSave } from '../services/save-loop';
import { newId } from '@interrobang/core';
import type { Font } from '@interrobang/core';
import type { EditorCanvasHandle } from '@interrobang/editor';

export function EditorPage() {
  const { projectId } = projectRoute.useParams();
  const addOpenProject = useProjectStore((s) => s.addOpenProject);
  const open = useProjectStore((s) => s.openProjects[projectId]);
  const [error, setError] = useState<string | null>(null);
  const [canvasHandle, setCanvasHandle] = useState<EditorCanvasHandle | null>(null);

  useEditorKeyboardShortcuts(projectId);

  useEffect(() => {
    if (open) return;
    getStorage()
      .then((s) => s.loadFont(projectId))
      .then((font) => addOpenProject({ id: projectId, name: font.meta.familyName, font }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId, open, addOpenProject]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ projectId: string; char?: string }>).detail;
      if (detail.projectId !== projectId) return;
      const current = useProjectStore.getState().openProjects[projectId];
      if (!current) return;
      const masterId = current.font.masters[0]?.id;
      if (!masterId) return;

      const rawChar = (detail.char ?? 'A').trim();
      const char = rawChar.length > 0 ? [...rawChar][0]! : 'A';
      const codepoint = char.codePointAt(0) ?? null;
      const existing = Object.values(current.font.glyphs);
      const existingByCodepoint = codepoint
        ? existing.find((g) => g.unicodeCodepoint === codepoint)
        : undefined;
      if (existingByCodepoint) {
        useEditorStore.getState().setActiveGlyph(projectId, existingByCodepoint.id);
        return;
      }
      const baseName = char;
      let name = baseName;
      for (let i = 1; existing.some((g) => g.name === name); i++) name = `${baseName}.${i}`;

      const layerId = newId();
      const contourId = newId();
      const glyphId = newId();
      const next: Font = {
        ...current.font,
        glyphs: {
          ...current.font.glyphs,
          [glyphId]: {
            id: glyphId,
            name,
            advanceWidth: 500,
            unicodeCodepoint: codepoint,
            revision: 0,
            layers: [
              {
                id: layerId,
                masterId,
                components: [],
                anchors: [],
                contours: [
                  {
                    id: contourId,
                    closed: true,
                    points: [
                      { id: newId(), x: 100, y: 0, type: 'line', smooth: false },
                      { id: newId(), x: 400, y: 0, type: 'line', smooth: false },
                      { id: newId(), x: 250, y: 700, type: 'line', smooth: false },
                    ],
                  },
                ],
              },
            ],
          },
        },
        glyphOrder: [...current.font.glyphOrder, glyphId],
      };
      useProjectStore.setState((s) => {
        const existingProj = s.openProjects[projectId];
        if (!existingProj) return s;
        return {
          openProjects: {
            ...s.openProjects,
            [projectId]: { ...existingProj, font: next, dirty: true },
          },
        };
      });
      useEditorStore.getState().setActiveGlyph(projectId, glyphId);
    }
    document.addEventListener('interrobang:add-starter', handler);
    document.addEventListener('interrobang:add-glyph', handler);
    return () => {
      document.removeEventListener('interrobang:add-starter', handler);
      document.removeEventListener('interrobang:add-glyph', handler);
    };
  }, [projectId]);

  useEffect(() => {
    const unsub = useProjectStore.subscribe((s, prev) => {
      const cur = s.openProjects[projectId];
      const old = prev.openProjects[projectId];
      if (cur && cur.dirty && cur !== old) scheduleSave(projectId);
    });
    return () => unsub();
  }, [projectId]);

  if (error) return <div className="p-6 text-destructive">{error}</div>;
  return (
    <SidebarProvider className="h-screen">
      <GlyphList projectId={projectId} />
      <SidebarInset className="flex min-w-0 flex-col">
        <TabBar activeId={projectId} />
        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 min-w-0 flex-1">
            <EditorShell projectId={projectId} canvasHandleRef={setCanvasHandle} />
          </div>
          <CoordinatesPanel canvas={canvasHandle} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
