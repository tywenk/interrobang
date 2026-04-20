import { useEffect } from 'react';
import { useProjectStore } from '../stores/project-store';
import { useEditorStore } from '../stores/editor-store';

export function useEditorKeyboardShortcuts(projectId: string): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().undo(projectId);
      } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useProjectStore.getState().redo(projectId);
      } else if (e.key === 'v' || e.key === 'V') {
        useEditorStore.getState().setTool('select');
      } else if (e.key === 'p' || e.key === 'P') {
        useEditorStore.getState().setTool('pen');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectId]);
}
