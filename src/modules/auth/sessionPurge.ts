/**
 * Expired sessions are useless to everyone, yet each one still ties a user id
 * to the times they signed in. Keeping personal data with no purpose is what
 * the GDPR's storage limitation principle forbids, so they are deleted.
 */
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export interface RunningPurge {
    stop(): void;
}

/** Deletes the expired sessions and says how many it deleted. */
export type Purge = () => Promise<number>;

/**
 * Purges once now, then every interval. A failed run is logged and the next
 * one tries again: a purge must never bring the API down. It fails loudly
 * every hour if migration 0001 was never applied, which is the point.
 *
 * Takes a function rather than the AuthService, so that adding the purge
 * does not change an interface other modules implement in their tests.
 */
export function startSessionPurge(purge: Purge, intervalMs = PURGE_INTERVAL_MS): RunningPurge {
    const run = async () => {
        try {
            const purged = await purge();
            if (purged > 0) console.log(`Purged ${purged} expired session(s)`);
        } catch (error) {
            console.error('Expired session purge failed:', error);
        }
    };

    void run();
    const timer = setInterval(() => void run(), intervalMs);
    // Never the reason the process stays alive.
    timer.unref();

    return { stop: () => clearInterval(timer) };
}
