import { randomUUID } from 'node:crypto';
import type { Credentials } from './credentials';
import { hashPassword, verifyPassword } from './password';
import { hashSessionToken, newSessionToken } from './tokens';
import type { AuthRepository, User } from './types';

/** Seven days, then the user signs in again. Not extended on use. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PasswordHasher {
    hash(password: string): Promise<string>;
    verify(password: string, stored: string): Promise<boolean>;
}

export interface AuthDependencies {
    hasher: PasswordHasher;
    now: () => Date;
    newUserId: () => string;
    newToken: () => string;
}

const defaults: AuthDependencies = {
    hasher: { hash: password => hashPassword(password), verify: verifyPassword },
    now: () => new Date(),
    newUserId: randomUUID,
    newToken: newSessionToken,
};

/** A new session. `token` goes in the cookie and nowhere else. */
export interface SignedIn {
    user: User;
    token: string;
    expiresAt: Date;
}

export type RegisterResult = ({ kind: 'created' } & SignedIn) | { kind: 'email_taken' };
export type LoginResult = ({ kind: 'signed_in' } & SignedIn) | { kind: 'invalid_credentials' };

export interface AuthService {
    register(credentials: Credentials): Promise<RegisterResult>;
    login(credentials: Credentials): Promise<LoginResult>;
    logout(token: string): Promise<void>;
    /** The user a cookie token belongs to, if its session is still valid. */
    authenticate(token: string): Promise<User | undefined>;
    /** Deletes the sessions nobody can use any more. Returns how many. */
    purgeExpiredSessions(): Promise<number>;
}

export function createAuthService(repository: AuthRepository, overrides: Partial<AuthDependencies> = {}): AuthService {
    const deps = { ...defaults, ...overrides };

    function newSession(userId: string) {
        const token = deps.newToken();
        const createdAt = deps.now();
        const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
        return { token, record: { id: hashSessionToken(token), userId, createdAt, expiresAt } };
    }

    // Hashed once, on the first login attempt for an unknown email, then reused.
    let decoy: Promise<string> | undefined;

    return {
        async register({ email, password }) {
            const id = deps.newUserId();
            const passwordHash = await deps.hasher.hash(password);
            const session = newSession(id);

            const outcome = await repository.createUserWithSession(
                { id, email, passwordHash, createdAt: session.record.createdAt },
                session.record,
            );
            if (outcome === 'email_taken') return { kind: 'email_taken' };

            return { kind: 'created', user: { id, email }, token: session.token, expiresAt: session.record.expiresAt };
        },

        async login({ email, password }) {
            const user = await repository.findUserByEmail(email);
            if (!user) {
                // Hash anyway. Answering an unknown email in a millisecond and a
                // wrong password in a hundred would tell anyone which addresses
                // have an account.
                decoy ??= deps.hasher.hash(deps.newToken());
                await deps.hasher.verify(password, await decoy);
                return { kind: 'invalid_credentials' };
            }

            if (!(await deps.hasher.verify(password, user.passwordHash))) {
                return { kind: 'invalid_credentials' };
            }

            const session = newSession(user.id);
            await repository.createSession(session.record);
            return {
                kind: 'signed_in',
                user: { id: user.id, email: user.email },
                token: session.token,
                expiresAt: session.record.expiresAt,
            };
        },

        async logout(token) {
            await repository.deleteSession(hashSessionToken(token));
        },

        async authenticate(token) {
            return repository.findUserBySession(hashSessionToken(token), deps.now());
        },

        async purgeExpiredSessions() {
            return repository.deleteExpiredSessions(deps.now());
        },
    };
}
