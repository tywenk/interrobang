import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MousePointer2, PenTool, Plus } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import type { Tool } from '../stores/editor-store';
import { useEditorStore } from '../stores/editor-store';

interface ToolDef {
  readonly tool: Tool;
  readonly label: string;
  readonly shortcut: string;
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TOOLS: readonly ToolDef[] = [
  { tool: 'select', label: 'Select', shortcut: 'V', Icon: MousePointer2 },
  { tool: 'pen', label: 'Pen', shortcut: 'P', Icon: PenTool },
  { tool: 'add-point', label: 'Add point', shortcut: 'A', Icon: Plus },
];

export function ToolSidebar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <TooltipProvider delay={200}>
      <nav
        aria-label="Editor tools"
        className="flex w-10 flex-col items-center gap-1 border-r border-border bg-card py-2"
      >
        {TOOLS.map(({ tool: t, label, shortcut, Icon }) => {
          const active = t === tool;
          return (
            <Tooltip key={t}>
              <TooltipTrigger
                render={
                  <Button
                    variant={active ? 'secondary' : 'ghost'}
                    size="icon"
                    aria-label={label}
                    aria-pressed={active}
                    onClick={() => setTool(t)}
                  >
                    <Icon />
                  </Button>
                }
              />
              <TooltipContent side="right">
                <span>{label}</span>
                <Kbd>{shortcut}</Kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
