import type { Font } from '@interrobang/core';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  revision: number;
}

export interface StorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<string>;
  loadFont(projectId: string): Promise<Font>;
  saveFont(projectId: string, font: Font): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  readBlob(projectId: string, key: string): Promise<Uint8Array | null>;
  writeBlob(projectId: string, key: string, bytes: Uint8Array): Promise<void>;
}
