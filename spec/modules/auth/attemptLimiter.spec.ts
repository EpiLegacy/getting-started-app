import { createAttemptLimiter } from '../../../src/modules/auth/attemptLimiter';

let now: number;
const limiter = (sweepAbove?: number) =>
    createAttemptLimiter({ limit: 3, windowMs: 1000, now: () => now, sweepAbove });

beforeEach(() => {
    now = 1_000_000;
});

test('allows attempts up to the limit, then refuses', () => {
    const l = limiter();

    for (let i = 0; i < 3; i++) {
        expect(l.retryAfterMs('k')).toBe(0);
        l.record('k');
    }

    expect(l.retryAfterMs('k')).toBe(1000);
});

test('allows again once the oldest counted attempt leaves the window', () => {
    const l = limiter();
    l.record('k');
    now += 400;
    l.record('k');
    l.record('k');

    now += 599;
    expect(l.retryAfterMs('k')).toBe(1);

    now += 1;
    expect(l.retryAfterMs('k')).toBe(0);
});

test('keys are counted separately', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.record('a');

    expect(l.retryAfterMs('b')).toBe(0);
});

test('reset forgets every attempt of a key', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.record('k');

    l.reset('k');

    expect(l.retryAfterMs('k')).toBe(0);
    expect(l.size()).toBe(0);
});

test('release withdraws only the most recent attempt', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.record('k');

    l.release('k');
    expect(l.retryAfterMs('k')).toBe(0);

    l.record('k');
    expect(l.retryAfterMs('k')).toBeGreaterThan(0);
});

test('release on a key with a single attempt, or none, leaves nothing behind', () => {
    const l = limiter();
    l.record('k');

    l.release('k');
    l.release('never-seen');

    expect(l.size()).toBe(0);
});

test('expired keys are dropped when read', () => {
    const l = limiter();
    l.record('k');

    now += 1000;

    expect(l.retryAfterMs('k')).toBe(0);
    expect(l.size()).toBe(0);
});

test('past the sweep threshold, expired keys are dropped before a new one is added', () => {
    const l = limiter(2);
    l.record('old-1');
    l.record('old-2');

    now += 1000;
    l.record('new');

    expect(l.size()).toBe(1);
});
