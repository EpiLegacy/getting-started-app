import {
    EMAIL_SUBJECT,
    isEmailRelayConfigured,
    relayBatch,
    startEmailRelay,
    type EmailOutbox,
    type OutboxTransaction,
    type PendingEmail,
} from '../../src/workers/notifications/emailRelay';

const SENT_AT = new Date('2026-09-30T08:00:00.000Z');
const now = () => SENT_AT;
const pending = (id: string): PendingEmail => ({ notificationId: id, email: `${id}@example.test`, body: `body ${id}` });

/** In-memory outbox: `sent` records what markSent received. */
function fakeOutbox(rows: PendingEmail[]) {
    const sent = new Map<string, Date>();
    const outbox: EmailOutbox = {
        claimPending: jest.fn(async (limit: number) => rows.filter(r => !sent.has(r.notificationId)).slice(0, limit)),
        markSent: jest.fn(async (ids: string[], sentAt: Date) => {
            ids.forEach(id => sent.set(id, sentAt));
        }),
    };
    return { outbox, sent };
}

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('relayBatch', () => {
    test('sends each pending notification and marks them as sent, not deleted', async () => {
        const { outbox, sent } = fakeOutbox([pending('a'), pending('b')]);
        const send = jest.fn().mockResolvedValue(undefined);

        await expect(relayBatch(outbox, send, 10, now)).resolves.toBe(2);

        expect(send).toHaveBeenCalledWith('a@example.test', EMAIL_SUBJECT, 'body a');
        expect(send).toHaveBeenCalledWith('b@example.test', EMAIL_SUBJECT, 'body b');
        expect(outbox.markSent).toHaveBeenCalledTimes(1);
        expect(sent).toEqual(new Map([['a', SENT_AT], ['b', SENT_AT]]));
    });

    test('claims at most batchSize notifications', async () => {
        const { outbox } = fakeOutbox([pending('a'), pending('b'), pending('c')]);
        const send = jest.fn().mockResolvedValue(undefined);

        await expect(relayBatch(outbox, send, 2, now)).resolves.toBe(2);
        expect(outbox.claimPending).toHaveBeenCalledWith(2);
    });

    test('a failed send leaves only that notification pending for the next run', async () => {
        const { outbox, sent } = fakeOutbox([pending('a'), pending('b'), pending('c')]);
        const send = jest.fn(async (to: string) => {
            if (to === 'b@example.test') throw new Error('SMTP down');
        });

        await expect(relayBatch(outbox, send, 10, now)).resolves.toBe(2);
        expect([...sent.keys()]).toEqual(['a', 'c']);

        // Next run: only the failed one is retried.
        send.mockClear();
        send.mockResolvedValue(undefined);
        await expect(relayBatch(outbox, send, 10, now)).resolves.toBe(1);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith('b@example.test', EMAIL_SUBJECT, 'body b');
        expect([...sent.keys()]).toEqual(['a', 'c', 'b']);
    });

    test('does not write anything when every send fails or nothing is pending', async () => {
        const failing = fakeOutbox([pending('a')]);
        await expect(relayBatch(failing.outbox, jest.fn().mockRejectedValue(new Error('x')), 10, now)).resolves.toBe(0);
        expect(failing.outbox.markSent).not.toHaveBeenCalled();

        const empty = fakeOutbox([]);
        const send = jest.fn();
        await expect(relayBatch(empty.outbox, send, 10, now)).resolves.toBe(0);
        expect(send).not.toHaveBeenCalled();
        expect(empty.outbox.markSent).not.toHaveBeenCalled();
    });
});

describe('isEmailRelayConfigured', () => {
    test('requires SMTP_HOST', () => {
        expect(isEmailRelayConfigured({})).toBe(false);
        expect(isEmailRelayConfigured({ SMTP_HOST: '' })).toBe(false);
        expect(isEmailRelayConfigured({ SMTP_HOST: 'smtp.example.test' })).toBe(true);
    });
});

describe('startEmailRelay', () => {
    const flush = () => new Promise(resolve => jest.requireActual<typeof import('timers')>('timers').setImmediate(resolve));

    test('runs a batch in a transaction on start, then every interval until stopped', async () => {
        jest.useFakeTimers();
        const { outbox } = fakeOutbox([pending('a')]);
        const runInTransaction = jest.fn((fn => fn(outbox)) as OutboxTransaction) as unknown as OutboxTransaction;
        const send = jest.fn().mockResolvedValue(undefined);

        const relay = startEmailRelay({ intervalMs: 1000, batchSize: 5, send, runInTransaction, now });
        await flush();
        expect(runInTransaction).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(1000);
        expect(runInTransaction).toHaveBeenCalledTimes(2);
        // Already sent: not mailed twice.
        expect(send).toHaveBeenCalledTimes(1);

        relay.stop();
        await jest.advanceTimersByTimeAsync(5000);
        expect(runInTransaction).toHaveBeenCalledTimes(2);
    });

    test('keeps running after a failed transaction', async () => {
        jest.useFakeTimers();
        const runInTransaction = jest.fn().mockRejectedValue(new Error('db down')) as unknown as OutboxTransaction;

        const relay = startEmailRelay({ intervalMs: 1000, send: jest.fn(), runInTransaction });
        await flush();
        await jest.advanceTimersByTimeAsync(1000);

        expect(runInTransaction).toHaveBeenCalledTimes(2);
        expect(console.error).toHaveBeenCalledWith('[email-relay] run failed', expect.any(Error));
        relay.stop();
    });
});
