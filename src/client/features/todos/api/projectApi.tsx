import { ProjectInput } from '../../../../modules/project/types';
import type { Project } from '../../../../types';

import { request } from '../../../lib/http';

export const projectsApi = {
  getAll: (signal?: AbortSignal) =>
    request<Project[]>('/projects', { signal }),

  create: (name: string, usersEmail: string[]) =>
    request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        usersEmail,
      }),
    }),

  update: (id: string, input: Partial<ProjectInput>) =>
    request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  remove: (id: string) =>
    request<void>(`/projects/${id}`, {
      method: 'DELETE',
    }),

  addUser: (projectId: string, email: string) =>
    request<Project>(`/projects/${projectId}/users`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  removeUser: (projectId: string, email: string) =>
    request<Project>(`/projects/${projectId}/users`, {
      method: 'DELETE',
      body: JSON.stringify({ email }),
    }),
};