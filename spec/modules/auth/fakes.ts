import type { PasswordHasher } from '../../../src/modules/auth/service';
import type { AuthRepository, SessionRecord, StoredUser, User } from '../../../src/modules/auth/types';

/** In-memory AuthRepository, with the same semantics as the MySQL one. */
export class FakeRepository implements AuthRepository {
    users: StoredUser[] = [];
    sessions: SessionRecord[] = [];

    async createUserWithSession(user: StoredUser, session: SessionRecord) {
        if (this.users.some(u => u.email === user.email)) return 'email_taken' as const;
        this.users.push(user);
        this.sessions.push(session);
        return 'created' as const;
    }

    async findUserByEmail(email: string) {
        return this.users.find(u => u.email === email);
    }

    async createSession(session: SessionRecord) {
        this.sessions.push(session);
    }

    async findUserBySession(sessionId: string, now: Date): Promise<User | undefined> {
        const session = this.sessions.find(s => s.id === sessionId && s.expiresAt > now);
        const user = session && this.users.find(u => u.id === session.userId);
        return user && { id: user.id, email: user.email };
    }

    async deleteSession(sessionId: string) {
        this.sessions = this.sessions.filter(s => s.id !== sessionId);
    }
}

/** Reversible and instant, so tests can see what was hashed. */
export const fakeHasher: PasswordHasher & { verify: jest.Mock } = {
    hash: async password => `hashed:${password}`,
    verify: jest.fn(async (password: string, stored: string) => stored === `hashed:${password}`),
};
