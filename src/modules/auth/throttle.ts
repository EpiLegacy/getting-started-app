import { createAttemptLimiter, type AttemptLimiter } from './attemptLimiter';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/**
 * The limits on the endpoints that hash a password. Each hash costs about
 * 128 MiB and a noticeable fraction of a second, so unlimited attempts are
 * both a brute-force channel and a way to exhaust the server.
 *
 * Keyed on the client IP, which is the proxy's own address if the API ever
 * runs behind one without Express's "trust proxy" setting: every client would
 * then share one budget. Set it along with the proxy.
 */
export const LIMITS = {
    /**
     * Guesses at one account from one address. Not per account alone: that
     * would let anyone lock a user out by failing on purpose.
     */
    loginPerAccount: { limit: 5, windowMs: FIFTEEN_MINUTES },
    /**
     * One address trying a common password against many accounts. Loose on
     * purpose, like the registration limit: a school or office network puts
     * dozens of people behind one public address, and they must not share a
     * budget of a handful of mistakes. The per-account limit is the one that
     * stops brute force.
     */
    loginPerIp: { limit: 100, windowMs: FIFTEEN_MINUTES },
    /** Bounds the hashing an address can trigger, about 128 MiB per attempt. */
    registerPerIp: { limit: 50, windowMs: ONE_HOUR },
} as const;

export interface AuthThrottle {
    loginPerAccount: AttemptLimiter;
    loginPerIp: AttemptLimiter;
    registerPerIp: AttemptLimiter;
}

export function createAuthThrottle(now?: () => number): AuthThrottle {
    return {
        loginPerAccount: createAttemptLimiter({ ...LIMITS.loginPerAccount, now }),
        loginPerIp: createAttemptLimiter({ ...LIMITS.loginPerIp, now }),
        registerPerIp: createAttemptLimiter({ ...LIMITS.registerPerIp, now }),
    };
}
