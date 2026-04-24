import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Link, useNavigate } from '@tanstack/react-router';

import { useProjectStore } from '../stores/project-store';

export function TabBar({ activeId }: { activeId: string }) {
  const order = useProjectStore((s) => s.openOrder);
  const projects = useProjectStore((s) => s.openProjects);
  const closeProject = useProjectStore((s) => s.closeProject);
  const nav = useNavigate();

  return (
    <div className="flex items-center border-b border-border bg-card h-9">
      <div className="flex w-[39px] shrink-0 items-center justify-center">
        <SidebarTrigger className="size-8" />
      </div>
      <Separator orientation="vertical" className="mr-1" />
      {order.map((id) => {
        const p = projects[id];
        if (!p) return null;
        const active = id === activeId;
        return (
          <div
            key={id}
            className={`flex items-center gap-1 rounded-t px-2 h-8 text-sm cursor-pointer ${
              active
                ? 'bg-background border-x border-t border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link to="/project/$projectId" params={{ projectId: id }}>
              {p.name}
              {p.dirty ? ' •' : ''}
            </Link>
            <button
              type="button"
              className="text-xs opacity-60 hover:opacity-100"
              onClick={() => {
                closeProject(id);
                if (active) {
                  const next = order.filter((x) => x !== id).pop();
                  if (next) {
                    void nav({ to: '/project/$projectId', params: { projectId: next } });
                  } else {
                    void nav({ to: '/' });
                  }
                }
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
