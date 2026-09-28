import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { getDb } from '../../infrastructure/db/drizzle';
import { projects } from '../../infrastructure/db/schema';

import type { Project } from '../../types';
import type { ProjectInput, ProjectRepository } from './types';

export function projectRepository(): ProjectRepository {
  return {
    async list() {
      return await getDb()
        .select()
        .from(projects);
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
      return project;
    },

    async create(
      userId: string,
      input: ProjectInput,
      usersEmail: string[],
    ): Promise<Project> {
      const id = randomUUID();

      await getDb()
        .insert(projects)
        .values({
          id,
          name: input.name,
          userId,
          createdAt: new Date(),
          usersEmail
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
      const db = getDb();
      // Vérifie que le projet appartient à l'utilisateur
      const existingProject = await db.query.projects.findFirst({
        where: eq(projects.id, id),
      });

      if (!existingProject) {
        return undefined;
      }

      // Si tu utilises userId comme propriétaire du projet
      if (existingProject.userId !== userId) {
        return undefined;
      }

      const [updatedProject] = await db
        .update(projects)
        .set({
          ...(input.name !== undefined && {
            name: input.name,
          }),
        })
        .where(eq(projects.id, id));

      if (!updatedProject) {
        return undefined;
      }

      return db.query.projects.findFirst({
        where: eq(projects.id, id),
      });
    },

    async remove(
      id: string,
      userId: string,
    ): Promise<boolean> {
      const db = getDb();
      const existingProject = await db.query.projects.findFirst({
        where: eq(projects.id, id),
      });

      if (!existingProject) {
        return false;
      }

      // Seul le propriétaire peut supprimer le projet
      if (existingProject.userId !== userId) {
        return false;
      }

      await db
        .delete(projects)
        .where(eq(projects.id, id));

      return true;
    },

    async addUser(
      projectId: string,
      userId: string,
      email: string,
    ): Promise<Project | undefined> {
      const db = getDb();
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (!project) {
        return undefined;
      }

      // Seul le propriétaire peut ajouter un utilisateur
      if (project.userId !== userId) {
        return undefined;
      }

      const normalizedEmail = email.trim().toLowerCase();

      const currentEmails = project.usersEmail ?? [];

      // Évite les doublons
      if (
        currentEmails.some(
          (currentEmail) =>
            currentEmail.toLowerCase() === normalizedEmail,
        )
      ) {
        return project;
      }

      const updatedEmails = [
        ...currentEmails,
        normalizedEmail,
      ];

      await db
        .update(projects)
        .set({
          usersEmail: updatedEmails,
        })
        .where(eq(projects.id, projectId));

      return db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
    },

    async removeUser(
      projectId: string,
      userId: string,
      email: string,
    ): Promise<Project | undefined> {
      const db = getDb();
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (!project) {
        return undefined;
      }

      // Seul le propriétaire peut supprimer un utilisateur
      if (project.userId !== userId) {
        return undefined;
      }

      const normalizedEmail = email.trim().toLowerCase();

      const currentEmails = project.usersEmail ?? [];

      const updatedEmails = currentEmails.filter(
        (currentEmail) =>
          currentEmail.toLowerCase() !== normalizedEmail,
      );

      await db
        .update(projects)
        .set({
          usersEmail: updatedEmails,
        })
        .where(eq(projects.id, projectId));

      return db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
    },
  };
}
