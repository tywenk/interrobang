import { projectRoute } from '@/routes/project';

export function EditorPage() {
  const { projectId } = projectRoute.useParams();
  return <div className="p-6">Editor for project {projectId}</div>;
}
