import type { RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { EditorCanvasHandle } from '@interrobang/editor';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { useSidebar } from '@/components/ui/sidebar';
import { useProjectStore } from '../stores/project-store';
import { useEditorStore } from '../stores/editor-store';
import { useAppServices } from '../app-context';
import { importFontFile } from '../services/import-font-file';
import { exportOTF } from '../services/export-otf';

interface Props {
  projectId: string;
  canvasRef: RefObject<EditorCanvasHandle | null>;
}

function MacShortcut({ keys }: { keys: readonly string[] }) {
  return (
    <MenubarShortcut>
      <KbdGroup>
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </KbdGroup>
    </MenubarShortcut>
  );
}

export function EditorMenuBar({ projectId, canvasRef }: Props) {
  const nav = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { fontIo, storage } = useAppServices();

  const proj = useProjectStore((s) => s.openProjects[projectId]);
  const openOrder = useProjectStore((s) => s.openOrder);
  const tool = useEditorStore((s) => s.tool);

  const hasProj = proj !== undefined;

  function onUndo() {
    useProjectStore.getState().undo(projectId);
  }
  function onRedo() {
    useProjectStore.getState().redo(projectId);
  }
  function onCloseTab() {
    if (!hasProj) return;
    useProjectStore.getState().closeProject(projectId);
    const next = openOrder.filter((x) => x !== projectId).pop();
    if (next) void nav({ to: '/project/$projectId', params: { projectId: next } });
    else void nav({ to: '/' });
  }
  function onExport() {
    if (!proj) return;
    void exportOTF(fontIo, proj.font);
  }
  function onImport() {
    void importFontFile({ fontIo, storage, nav });
  }
  function onAddGlyph() {
    if (!hasProj) return;
    const input = window.prompt('Character for the new glyph:');
    if (input === null) return;
    const char = input.trim();
    if (!char) return;
    useProjectStore.getState().addGlyph(projectId, char);
  }
  function onFitToView() {
    canvasRef.current?.fitToView();
  }

  return (
    <Menubar className="rounded-none border-0 border-b h-9 bg-card px-2">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => void nav({ to: '/' })}>New project…</MenubarItem>
          <MenubarItem onClick={onImport}>Import OTF/TTF/UFO…</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onCloseTab} disabled={!hasProj}>
            Close tab
            <MacShortcut keys={['⌘', '⇧', 'W']} />
          </MenubarItem>
          <MenubarItem onClick={onExport} disabled={!hasProj}>
            Export OTF
            <MacShortcut keys={['⌘', 'E']} />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onUndo} disabled={!hasProj}>
            Undo
            <MacShortcut keys={['⌘', 'Z']} />
          </MenubarItem>
          <MenubarItem onClick={onRedo} disabled={!hasProj}>
            Redo
            <MacShortcut keys={['⌘', '⇧', 'Z']} />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => toggleSidebar()}>
            Toggle sidebar
            <MacShortcut keys={['⌘', 'B']} />
          </MenubarItem>
          <MenubarItem onClick={onFitToView} disabled={!hasProj}>
            Fit to view
            <MacShortcut keys={['⌘', '0']} />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Tool</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup
            value={tool}
            onValueChange={(v) => useEditorStore.getState().setTool(v as 'select' | 'pen')}
          >
            <MenubarRadioItem value="select">
              Select
              <MacShortcut keys={['V']} />
            </MenubarRadioItem>
            <MenubarRadioItem value="pen">
              Pen
              <MacShortcut keys={['P']} />
            </MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Glyph</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onAddGlyph} disabled={!hasProj}>
            Add glyph…
            <MacShortcut keys={['⌘', '⇧', 'N']} />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
