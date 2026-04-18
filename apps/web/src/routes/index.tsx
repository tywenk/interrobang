import { createRoute } from '@tanstack/react-router';
import { ProjectPickerPage } from '@/pages/ProjectPickerPage';
import { rootRoute } from './root';

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProjectPickerPage,
});
