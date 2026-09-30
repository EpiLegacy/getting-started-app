import { and, asc, eq, gt, inArray, lte, ne } from 'drizzle-orm';
import { getDb, transaction, unwrapErrors } from '../../infrastructure/db/drizzle';
import { projectItems, projectMembers, projects, sessions, todoItems, users } from '../../infrastructure/db/schema';
import type { AuthRepository } from './types';

/**
 * MySQL through the shared Drizzle pool, which src/index.ts initialises
 * whenever MYSQL_HOST is set. The tables come from migration 0001, never from
 * this code.
 */
export const drizzleAuthRepository: AuthRepository = {
    async createUserWithSession(user, session) {
        try {
            await transaction(async tx => {
                await tx.insert(users).values(user);
                await tx.insert(sessions).values(session);
            });
            return 'created';
        } catch (error) {
            // The unique key on the email is the only check that holds when two
            // requests register the same address at the same moment.
            const { code, sqlMessage } = error as { code?: string; sqlMessage?: string };
            if (code === 'ER_DUP_ENTRY' && sqlMessage?.includes('uq_users_email')) return 'email_taken';
            throw error;
        }
    },

    async findUserById(id) {
        const [user] = await unwrapErrors(() => getDb().select().from(users).where(eq(users.id, id)).limit(1));
        return user;
    },

    async deleteAccount(id) {
        await transaction(async tx => {
            // Lock the parent first. Concurrent task creations/claims and new
            // sessions must finish before this lock or fail their foreign key
            // after deletion; they cannot leave an owned row behind.
            const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).for('update');
            if (!user) return;

            // 1. Projects owned by the user: hand over to the longest-standing
            //    other member, or delete the project when nobody else is in it.
            const owned = await tx.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, id));
            for (const { id: projectId } of owned) {
                const [next] = await tx
                    .select({ userId: projectMembers.userId })
                    .from(projectMembers)
                    .where(and(eq(projectMembers.projectId, projectId), ne(projectMembers.userId, id)))
                    .orderBy(asc(projectMembers.joinedAt))
                    .limit(1);
                if (next) {
                    await tx.update(projects).set({ ownerId: next.userId }).where(eq(projects.id, projectId));
                } else {
                    await tx.delete(projects).where(eq(projects.id, projectId)); // its links cascade
                }
            }

            // 2. Every task of the user that is in a project survives, without
            //    an author, whether or not the user owned that project.
            const inProject = tx.select({ taskKey: projectItems.taskKey }).from(projectItems);
            await tx
                .update(todoItems)
                .set({ userId: null })
                .where(and(eq(todoItems.userId, id), inArray(todoItems.taskKey, inProject)));

            // 3. Everything else the user still owns is deleted, as before.
            await tx.delete(todoItems).where(eq(todoItems.userId, id));
            await tx.delete(users).where(eq(users.id, id));
            // Sessions and project memberships go with the ON DELETE CASCADE FKs.
        });
    },

    async findUserByEmail(email) {
        const rows = await unwrapErrors(() => getDb().select().from(users).where(eq(users.email, email)).limit(1));
        return rows[0];
    },

    async createSession(session) {
        await unwrapErrors(() => getDb().insert(sessions).values(session));
    },

    async findUserBySession(sessionId, now) {
        const rows = await unwrapErrors(() =>
            getDb()
                .select({ id: users.id, email: users.email })
                .from(sessions)
                .innerJoin(users, eq(users.id, sessions.userId))
                .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
                .limit(1),
        );
        return rows[0];
    },

    async deleteSession(sessionId) {
        await unwrapErrors(() => getDb().delete(sessions).where(eq(sessions.id, sessionId)));
    },

    // "Expired" is the complement of findUserBySession's expires_at > now.
    async deleteExpiredSessions(now) {
        const [result] = await unwrapErrors(() => getDb().delete(sessions).where(lte(sessions.expiresAt, now)));
        return result.affectedRows;
    },
};
