import { createRoute } from '@tanstack/react-router';
import { EditorPage } from '@/pages/EditorPage';
import { rootRoute } from './root';

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: EditorPage,
});
