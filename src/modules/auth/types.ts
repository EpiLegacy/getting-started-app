/** What the rest of the application may know about a signed-in user. */
export interface User {
    id: string;
    email: string;
}

export interface StoredUser extends User {
    passwordHash: string;
    createdAt: Date;
}

export interface SessionRecord {
    /** SHA-256 of the cookie token, never the token itself. */
    id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
}

/** Storage behind the auth service. See repository.drizzle.ts. */
export interface AuthRepository {
    /** One transaction: an account never exists without its first session. */
    createUserWithSession(user: StoredUser, session: SessionRecord): Promise<'created' | 'email_taken'>;
    findUserByEmail(email: string): Promise<StoredUser | undefined>;
    createSession(session: SessionRecord): Promise<void>;
    /** The session's user, or undefined when it does not exist or has expired at `now`. */
    findUserBySession(sessionId: string, now: Date): Promise<User | undefined>;
    deleteSession(sessionId: string): Promise<void>;
    /** Deletes every session expired at `now`, and says how many. */
    deleteExpiredSessions(now: Date): Promise<number>;
}
