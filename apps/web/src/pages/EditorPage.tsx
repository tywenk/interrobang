import { useEffect, useState } from 'react';
import { projectRoute } from '../routes/project';
import { getStorage } from '../services/storage';
import { useProjectStore } from '../stores/project-store';
import { EditorShell } from '../components/EditorShell';
import { TabBar } from '../components/TabBar';
import { useEditorKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { scheduleSave } from '../services/save-loop';
import { newId } from '@interrobang/core';
import type { Font } from '@interrobang/core';

export function EditorPage() {
  const { projectId } = projectRoute.useParams();
  const addOpenProject = useProjectStore((s) => s.addOpenProject);
  const open = useProjectStore((s) => s.openProjects[projectId]);
  const [error, setError] = useState<string | null>(null);

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
      const detail = (e as CustomEvent<{ projectId: string }>).detail;
      if (detail.projectId !== projectId) return;
      const current = useProjectStore.getState().openProjects[projectId];
      if (!current) return;
      const masterId = current.font.masters[0]?.id;
      if (!masterId) return;
      const layerId = newId();
      const contourId = newId();
      const glyphId = newId();
      const next: Font = {
        ...current.font,
        glyphs: {
          ...current.font.glyphs,
          [glyphId]: {
            id: glyphId,
            name: 'A',
            advanceWidth: 500,
            unicodeCodepoint: 65,
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
        const existing = s.openProjects[projectId];
        if (!existing) return s;
        return {
          openProjects: {
            ...s.openProjects,
            [projectId]: { ...existing, font: next, dirty: true },
          },
        };
      });
    }
    document.addEventListener('interrobang:add-starter', handler);
    return () => document.removeEventListener('interrobang:add-starter', handler);
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
    <div className="h-screen w-screen flex flex-col">
      <TabBar activeId={projectId} />
      <div className="flex-1 relative">
        <EditorShell projectId={projectId} />
      </div>
    </div>
  );
}
