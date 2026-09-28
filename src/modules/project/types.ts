import type { Project } from '../../types';

export type ProjectInput = Pick<Project, 'name'>;

export interface ProjectRepository {
  getById(
    id: string,
  ): Promise<Project | undefined>;

  create(
    input: ProjectInput,
  ): Promise<Project>;
  
  list(): Promise<Project[]>;
  
  update(
    id: string,
    userId: string,
    input: Partial<ProjectInput>,
  ): Promise<Project | undefined>;

  remove(
    id: string,
    userId: string,
  ): Promise<boolean>;
}