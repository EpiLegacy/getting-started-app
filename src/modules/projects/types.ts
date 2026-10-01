import type { Priority } from '../../types';

export interface StoredProject {
    id: string;
    ownerId: string;
    name: string;
    createdAt: Date;
}

export interface ProjectDto {
    id: string;
    ownerId: string;
    name: string;
    createdAt: string;
}

export interface ProjectMemberDto {
    id: string;
    email: string;
}

export interface ProjectItemDto {
    taskKey: number;
    id: string | null;
    userId: string | null;
    name: string | null;
    completed: boolean | null;
    deadline: string | null;
    priorisation: Priority | null;
}

export interface ProjectDetailDto extends ProjectDto {
    members: ProjectMemberDto[];
    items: ProjectItemDto[];
}

export interface ProjectListDto extends ProjectDto {
    members: ProjectMemberDto[];
}

export interface ProjectRepository {
    createWithOwner(project: StoredProject): Promise<void>;
    listForUser(userId: string): Promise<StoredProject[]>;
    findForMember(projectId: string, userId: string): Promise<StoredProject | undefined>;
    listMembers(projectId: string): Promise<ProjectMemberDto[]>;
    listItems(projectId: string): Promise<ProjectItemDto[]>;
    rename(projectId: string, name: string): Promise<void>;
    delete(projectId: string): Promise<void>;
    findUserIdByEmail(email: string): Promise<string | undefined>;
    addMember(projectId: string, userId: string): Promise<'added' | 'already_member' | 'missing'>;
    removeMember(projectId: string, userId: string): Promise<void>;
    isItemOwnedBy(taskKey: number, userId: string): Promise<boolean>;
    addItem(projectId: string, taskKey: number, assigneeId: string): Promise<'added' | 'already_in_project' | 'missing'>;
    removeItem(projectId: string, taskKey: number): Promise<void>;
}
