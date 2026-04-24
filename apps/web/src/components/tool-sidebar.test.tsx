import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { useEditorStore } from '../stores/editor-store';
import { ToolSidebar } from './tool-sidebar';

afterEach(() => {
  cleanup();
  useEditorStore.setState({ tool: 'select' });
});

describe('ToolSidebar', () => {
  test('renders one button per tool with accessible labels', () => {
    render(<ToolSidebar />);
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add point' })).toBeTruthy();
  });

  test('the current tool button is aria-pressed; others are not', () => {
    useEditorStore.setState({ tool: 'pen' });
    render(<ToolSidebar />);
    expect(screen.getByRole('button', { name: 'Pen' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Add point' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  test('clicking a tool button sets the active tool in the store', () => {
    render(<ToolSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Add point' }));
    expect(useEditorStore.getState().tool).toBe('add-point');
  });

  test('nav has an accessible label so screen readers announce the region', () => {
    render(<ToolSidebar />);
    expect(screen.getByRole('navigation', { name: 'Editor tools' })).toBeTruthy();
  });
});
