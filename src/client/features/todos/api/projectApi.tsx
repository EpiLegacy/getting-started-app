import type { Project } from '../../../../types';

import { request } from '../../../lib/http';

export const projectsApi = {
  getAll: (signal?: AbortSignal) =>
    request<Project[]>('/projects', { signal }),

  create: (name: string) =>
    request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  update: (project: Project) =>
    request<Project>(
      `/projects/${encodeURIComponent(project.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: project.name,
        }),
      },
    ),

  remove: (id: string) =>
    request<void>(
      `/projects/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    ),
};