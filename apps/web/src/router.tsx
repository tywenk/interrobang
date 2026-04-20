import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ProjectPickerPage } from '@/pages/ProjectPickerPage';
import { EditorPage } from '@/pages/EditorPage';

export const rootRoute = createRootRoute({ component: () => <Outlet /> });

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProjectPickerPage,
});

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: EditorPage,
});

const routeTree = rootRoute.addChildren([indexRoute, projectRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
