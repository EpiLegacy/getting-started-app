import { request } from '../../../lib/http';

export interface ProjectMember {
  id: string;
  email: string;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  members: ProjectMember[];
}

export interface ProjectItem {
  taskKey: number;
  id: string | null;
  userId: string | null;
  name: string | null;
  completed: boolean | null;
  deadline: string | null;
  priorisation: string | null;
}

export const projectApi = {
  list: async (
    signal?: AbortSignal,
  ): Promise<Project[]> => {
    const response = await request<{
      projects: Project[];
    }>('/projects', {
      signal,
    });

    return response.projects;
  },

  get: async (
    projectId: string,
    signal?: AbortSignal,
  ) => {
    const response = await request<{
      project: Project & {
        items: ProjectItem[];
      };
    }>(
      `/projects/${encodeURIComponent(projectId)}`,
      {
        signal,
      },
    );

    return response.project;
  },

  create: async (name: string) => {
    const response = await request<{
      project: Project;
    }>('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
      }),
    });

    return response.project;
  },

  rename: async (
    projectId: string,
    name: string,
  ) => {
    const response = await request<{
      project: Project;
    }>(
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          name,
        }),
      },
    );

    return response.project;
  },

  remove: async (
    projectId: string,
  ) => {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'DELETE',
      },
    );
  },

  addMember: async (
    projectId: string,
    email: string,
  ) => {
    const response = await request<{
      members: ProjectMember[];
    }>(
      `/projects/${encodeURIComponent(projectId)}/members`,
      {
        method: 'POST',
        body: JSON.stringify({
          email,
        }),
      },
    );

    return response.members;
  },

  removeMember: async (
    projectId: string,
    userId: string,
  ) => {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
      },
    );
  },

  addItem: async (
    projectId: string,
    taskKey: number,
    assigneeId: string,
  ) => {
    console.log("id: ", assigneeId);

    const response = await request<{
      items: ProjectItem[];
    }>(
      `/projects/${encodeURIComponent(projectId)}/items`,
      {
        method: 'POST',
        body: JSON.stringify({
          taskKey,
          userId: assigneeId,
        }),
      },
    );

    return response.items;
  },

  removeItem: async (
    projectId: string,
    taskKey: number,
  ) => {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(taskKey)}`,
      {
        method: 'DELETE',
      },
    );
  },
};