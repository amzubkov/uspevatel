import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { Project } from '../types';
import { getDb } from '../db/database';

interface ProjectState {
  projects: Project[];
  loaded: boolean;

  load: () => Promise<void>;
  addProject: (name: string, isCurrent?: boolean) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleCurrent: (id: string) => void;
  getCurrentProjects: () => Project[];
  getFutureProjects: () => Project[];
}

function rowToProject(r: any): Project {
  return { id: r.id, name: r.name, isCurrent: !!r.is_current, notes: r.notes };
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM projects');
    set({ projects: rows.map(rowToProject), loaded: true });
  },

  addProject: async (name, isCurrent = true) => {
    const project: Project = { id: Crypto.randomUUID(), name: name.toUpperCase(), isCurrent, notes: '' };
    set((s) => ({ projects: [...s.projects, project] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO projects (id, name, is_current, notes) VALUES (?, ?, ?, ?)',
      [project.id, project.name, isCurrent ? 1 : 0, '']);
  },

  updateProject: async (id, updates) => {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, ...updates, name: updates.name ? updates.name.toUpperCase() : p.name } : p
      ),
    }));
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    const db = await getDb();
    await db.runAsync('UPDATE projects SET name=?, is_current=?, notes=? WHERE id=?',
      [project.name, project.isCurrent ? 1 : 0, project.notes, id]);
  },

  deleteProject: async (id) => {
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM projects WHERE id = ?', [id]);
  },

  toggleCurrent: async (id) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === id ? { ...p, isCurrent: !p.isCurrent } : p),
    }));
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    const db = await getDb();
    await db.runAsync('UPDATE projects SET is_current = ? WHERE id = ?', [project.isCurrent ? 1 : 0, id]);
  },

  getCurrentProjects: () => get().projects.filter((p) => p.isCurrent),
  getFutureProjects: () => get().projects.filter((p) => !p.isCurrent),
}));
