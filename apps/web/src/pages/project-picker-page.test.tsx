import type { FontIoClient } from '@interrobang/font-io';
import type { BrowserStorageAdapter } from '@interrobang/storage';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { AppContext, type AppServices } from '../app-context';
import { routeTree } from '../router';

function renderAt(path: string, services: AppServices) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <AppContext value={services}>
      <RouterProvider router={router} />
    </AppContext>,
  );
}

describe('ProjectPickerPage', () => {
  it('renders listed projects', async () => {
    const stubStorage = {
      listProjects: async () => [{ id: 'p1', name: 'Alpha', updatedAt: Date.now(), revision: 3 }],
    } as unknown as BrowserStorageAdapter;

    const services: AppServices = {
      storage: Promise.resolve(stubStorage),
      fontIo: {} as FontIoClient,
      saveLoop: {
        schedule: () => {},
        cancel: () => {},
        flush: async () => {},
      } as unknown as AppServices['saveLoop'],
    };

    renderAt('/', services);
    expect(await screen.findByText('Alpha')).toBeDefined();
  });
});
