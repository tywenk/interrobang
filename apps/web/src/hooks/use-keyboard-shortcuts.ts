import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { match } from 'ts-pattern';
import type { EditorCanvasHandle } from '@interrobang/editor';
import { useProjectStore } from '../stores/project-store';
import { useEditorStore } from '../stores/editor-store';
import { useAppServices } from '../app-context';
import { exportOTF } from '../services/export-otf';
import { SHORTCUTS } from './shortcuts';

interface Options {
  canvasRef: RefObject<EditorCanvasHandle | null>;
}

export function useEditorKeyboardShortcuts(projectId: string, { canvasRef }: Options): void {
  const nav = useNavigate();
  const { fontIo } = useAppServices();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      const hit = SHORTCUTS.find((s) => s.matches(e, mod));
      if (!hit) return;
      if (hit.preventDefault) e.preventDefault();
      match(hit.action)
        .with({ kind: 'undo' }, () => useProjectStore.getState().undo(projectId))
        .with({ kind: 'redo' }, () => useProjectStore.getState().redo(projectId))
        .with({ kind: 'export-otf' }, () => {
          const proj = useProjectStore.getState().openProjects[projectId];
          if (proj) void exportOTF(fontIo, proj.font);
        })
        .with({ kind: 'close-project' }, () => {
          const { openOrder } = useProjectStore.getState();
          useProjectStore.getState().closeProject(projectId);
          const next = openOrder.filter((x) => x !== projectId).pop();
          if (next) void nav({ to: '/project/$projectId', params: { projectId: next } });
          else void nav({ to: '/' });
        })
        .with({ kind: 'fit-to-view' }, () => {
          canvasRef.current?.fitToView();
        })
        .with({ kind: 'add-glyph' }, () => {
          const input = window.prompt('Character for the new glyph:');
          if (input === null) return;
          const char = input.trim();
          if (!char) return;
          useProjectStore.getState().addGlyph(projectId, char);
        })
        .with({ kind: 'set-tool' }, (a) => useEditorStore.getState().setTool(a.tool))
        .exhaustive();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectId, canvasRef, fontIo, nav]);
}
