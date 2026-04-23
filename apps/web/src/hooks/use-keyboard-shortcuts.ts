import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { EditorCanvasHandle } from '@interrobang/editor';
import { useProjectStore } from '../stores/project-store';
import { useEditorStore } from '../stores/editor-store';
import { useAppServices } from '../app-context';
import { exportOTF } from '../services/export-otf';

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

      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        useProjectStore.getState().undo(projectId);
        return;
      }
      if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        useProjectStore.getState().redo(projectId);
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        const proj = useProjectStore.getState().openProjects[projectId];
        if (proj) void exportOTF(fontIo, proj.font);
        return;
      }
      if (mod && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        const { openOrder } = useProjectStore.getState();
        useProjectStore.getState().closeProject(projectId);
        const next = openOrder.filter((x) => x !== projectId).pop();
        if (next) void nav({ to: '/project/$projectId', params: { projectId: next } });
        else void nav({ to: '/' });
        return;
      }
      if (mod && !e.shiftKey && e.key === '0') {
        e.preventDefault();
        canvasRef.current?.fitToView();
        return;
      }
      if (mod && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        const input = window.prompt('Character for the new glyph:');
        if (input === null) return;
        const char = input.trim();
        if (!char) return;
        useProjectStore.getState().addGlyph(projectId, char);
        return;
      }
      if (!mod && (e.key === 'v' || e.key === 'V')) {
        useEditorStore.getState().setTool('select');
        return;
      }
      if (!mod && (e.key === 'p' || e.key === 'P')) {
        useEditorStore.getState().setTool('pen');
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectId, canvasRef, fontIo, nav]);
}
