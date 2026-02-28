import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';
import { Project } from '../types';
import { zustandStorage } from '../utils/storage';

interface ProjectState {
  projects: Project[];

  addProject: (name: string, isCurrent?: boolean) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleCurrent: (id: string) => void;
  getCurrentProjects: () => Project[];
  getFutureProjects: () => Project[];
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],

      addProject: (name, isCurrent = true) => {
        const project: Project = {
          id: Crypto.randomUUID(),
          name: name.toUpperCase(),
          isCurrent,
          notes: '',
        };
        set((state) => ({ projects: [...state.projects, project] }));
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id
              ? { ...p, ...updates, name: updates.name ? updates.name.toUpperCase() : p.name }
              : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
      },

      toggleCurrent: (id) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, isCurrent: !p.isCurrent } : p
          ),
        }));
      },

      getCurrentProjects: () => get().projects.filter((p) => p.isCurrent),
      getFutureProjects: () => get().projects.filter((p) => !p.isCurrent),
    }),
    {
      name: 'project-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
