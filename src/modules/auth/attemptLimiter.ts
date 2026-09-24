/**
 * Counts attempts per key over a sliding window, in this process's memory.
 *
 * In memory on purpose, for now: the API runs as a single process, and a
 * restart only gives an attacker back a few guesses. The day a second API
 * replica exists, each replica would count on its own and the limits would
 * multiply: this then moves to MySQL or Redis behind the same interface.
 */
export interface AttemptLimiterOptions {
    /** Attempts allowed within the window. The next one is refused. */
    limit: number;
    windowMs: number;
    now?: () => number;
    /** Above this many keys, expired ones are swept before adding another. */
    sweepAbove?: number;
}

export interface AttemptLimiter {
    /** Milliseconds until the key may try again, or 0 if it may now. */
    retryAfterMs(key: string): number;
    record(key: string): void;
    /** Withdraws the most recent attempt, for one that turned out legitimate. */
    release(key: string): void;
    reset(key: string): void;
    /** Number of keys held, for tests and monitoring. */
    size(): number;
}

export function createAttemptLimiter(options: AttemptLimiterOptions): AttemptLimiter {
    const { limit, windowMs } = options;
    const now = options.now ?? Date.now;
    const sweepAbove = options.sweepAbove ?? 10_000;
    // Timestamps of the attempts still inside the window, oldest first.
    const attempts = new Map<string, number[]>();

    function recent(key: string): number[] {
        const cutoff = now() - windowMs;
        const kept = (attempts.get(key) ?? []).filter(time => time > cutoff);
        if (kept.length === 0) attempts.delete(key);
        else attempts.set(key, kept);
        return kept;
    }

    function sweep(): void {
        for (const key of [...attempts.keys()]) recent(key);
    }

    return {
        retryAfterMs(key) {
            const kept = recent(key);
            if (kept.length < limit) return 0;
            // Allowed again once the oldest attempt that still counts leaves the window.
            return kept[kept.length - limit] + windowMs - now();
        },

        record(key) {
            // Bounds the memory an attacker can make this hold by trying many
            // different emails: expired keys are dropped before a new one is added.
            if (!attempts.has(key) && attempts.size >= sweepAbove) sweep();
            attempts.set(key, [...recent(key), now()]);
        },

        release(key) {
            const kept = recent(key);
            if (kept.length <= 1) attempts.delete(key);
            else attempts.set(key, kept.slice(0, -1));
        },

        reset(key) {
            attempts.delete(key);
        },

        size() {
            return attempts.size;
        },
    };
}
