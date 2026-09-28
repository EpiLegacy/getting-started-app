import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { getDb } from '../../infrastructure/db/drizzle';
import { projects } from '../../infrastructure/db/schema';

import type { Project } from '../../types';
import type { ProjectInput, ProjectRepository } from './types';

export function projectRepository(): ProjectRepository {
  return {
    async list(): Promise<Project[]> {
      const rows = await getDb().query.projects.findMany({
        with: {
          user: true,
          items: true,
        },
      });
    
      return rows;
    },

    async getById(
      id: string,
    ): Promise<Project | undefined> {
      const rows = await getDb()
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);

      const project = rows[0];

      if (!project) {
        return undefined;
      }
      return {
        id: project.id,
        name: project.name,
        user: {
          userid: project.userId ?? '',
          email: '',
        },
        items: [],
      };
    },

    async create(
      input: ProjectInput,
    ): Promise<Project> {
      const id = randomUUID();

      await getDb()
        .insert(projects)
        .values({
          id,
          name: input.name,
          // userId,
          itemsTodoId: [],
          createdAt: new Date(),
        });

      const project = await this.getById(id);

      if (!project) {
        throw new Error('project_creation_failed');
      }

      return project;
    },

    async update(
      id: string,
      userId: string,
      input: Partial<ProjectInput>,
    ): Promise<Project | undefined> {
      // TODO
      return undefined;
    },

    async remove(
      id: string,
      userId: string,
    ): Promise<boolean> {
      // TODO
      return false;
    },
  };
}