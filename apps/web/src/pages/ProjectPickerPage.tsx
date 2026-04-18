import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStorage } from '../services/storage';
import type { ProjectSummary } from '@interrobang/storage';

export function ProjectPickerPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState('Untitled');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getStorage()
      .then((s) => s.listProjects())
      .then(setProjects)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function create() {
    try {
      const s = await getStorage();
      const id = await s.createProject(name);
      await navigate({ to: '/project/$projectId', params: { projectId: id } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error === 'SINGLE_TAB') {
    return (
      <div className="p-6">
        <h2 className="text-xl">Already open in another tab</h2>
        <p className="text-muted-foreground mt-2">Switch to that tab to continue editing.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-3xl font-medium">Interrobang</h1>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
        <Button onClick={create}>New project</Button>
      </div>
      {error && error !== 'SINGLE_TAB' && (
        <div className="text-destructive">{error}</div>
      )}
      <div className="space-y-2">
        {projects === null && <div className="text-muted-foreground">Loading…</div>}
        {projects?.length === 0 && <div className="text-muted-foreground">No projects yet.</div>}
        {projects?.map((p) => (
          <Link
            key={p.id}
            to="/project/$projectId"
            params={{ projectId: p.id }}
            className="block rounded-md border border-border p-3 hover:bg-accent"
          >
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-muted-foreground">
              Updated {new Date(p.updatedAt).toLocaleString()} · rev {p.revision}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
