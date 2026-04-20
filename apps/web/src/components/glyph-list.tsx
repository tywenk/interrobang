import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useProjectStore } from '../stores/project-store';
import { useEditorStore } from '../stores/editor-store';

type Props = { projectId: string } & ComponentProps<typeof Sidebar>;

export function GlyphList({ projectId, ...props }: Props) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  const activeGlyphId = useEditorStore((s) => s.activeGlyphByProject[projectId]);
  const setActiveGlyph = useEditorStore((s) => s.setActiveGlyph);
  if (!proj) return null;

  const effectiveActive = activeGlyphId ?? proj.font.glyphOrder[0];

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="truncate px-2 py-1 text-sm font-medium">{proj.name}</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Glyphs</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {proj.font.glyphOrder.map((id) => {
                const g = proj.font.glyphs[id]!;
                const active = id === effectiveActive;
                return (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => setActiveGlyph(projectId, id)}
                    >
                      <span className="flex-1 truncate">{g.name}</span>
                      {g.unicodeCodepoint ? (
                        <span className="text-xs text-muted-foreground">
                          U+{g.unicodeCodepoint.toString(16).toUpperCase()}
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="outline" size="sm" onClick={() => requestNewGlyph(projectId)}>
          + Add glyph
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function requestNewGlyph(projectId: string): void {
  const input = window.prompt('Character for the new glyph:');
  if (input === null) return;
  const char = input.trim();
  if (!char) return;
  document.dispatchEvent(new CustomEvent('interrobang:add-glyph', { detail: { projectId, char } }));
}
