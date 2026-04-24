import type { Tool } from '../stores/editor-store';

export type ShortcutAction =
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'export-otf' }
  | { kind: 'close-project' }
  | { kind: 'fit-to-view' }
  | { kind: 'add-glyph' }
  | { kind: 'set-tool'; tool: Tool };

export interface ShortcutBinding {
  id: string;
  matches: (e: KeyboardEvent, mod: boolean) => boolean;
  action: ShortcutAction;
  preventDefault?: boolean;
}

export const SHORTCUTS: readonly ShortcutBinding[] = [
  {
    id: 'undo',
    matches: (e, mod) => mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z'),
    action: { kind: 'undo' },
    preventDefault: true,
  },
  {
    id: 'redo',
    matches: (e, mod) => mod && e.shiftKey && (e.key === 'z' || e.key === 'Z'),
    action: { kind: 'redo' },
    preventDefault: true,
  },
  {
    id: 'export-otf',
    matches: (e, mod) => mod && !e.shiftKey && (e.key === 'e' || e.key === 'E'),
    action: { kind: 'export-otf' },
    preventDefault: true,
  },
  {
    id: 'close-project',
    matches: (e, mod) => mod && e.shiftKey && (e.key === 'w' || e.key === 'W'),
    action: { kind: 'close-project' },
    preventDefault: true,
  },
  {
    id: 'fit-to-view',
    matches: (e, mod) => mod && !e.shiftKey && e.key === '0',
    action: { kind: 'fit-to-view' },
    preventDefault: true,
  },
  {
    id: 'add-glyph',
    matches: (e, mod) => mod && e.shiftKey && (e.key === 'n' || e.key === 'N'),
    action: { kind: 'add-glyph' },
    preventDefault: true,
  },
  {
    id: 'tool-select',
    matches: (e, mod) => !mod && (e.key === 'v' || e.key === 'V'),
    action: { kind: 'set-tool', tool: 'select' },
  },
  {
    id: 'tool-pen',
    matches: (e, mod) => !mod && (e.key === 'p' || e.key === 'P'),
    action: { kind: 'set-tool', tool: 'pen' },
  },
  {
    id: 'tool-add-point',
    matches: (e, mod) => !mod && (e.key === 'a' || e.key === 'A'),
    action: { kind: 'set-tool', tool: 'add-point' },
  },
];
