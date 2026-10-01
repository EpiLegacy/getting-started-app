// src/workers/notifications/emailRelay.ts
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { transaction, type DrizzleTx } from '../../infrastructure/db/drizzle';
import { notifications, users } from '../../infrastructure/db/schema';
import { sendEmail } from '../../infrastructure/email/mailer';

export const EMAIL_SUBJECT = 'New Notification Todo App';

export interface PendingEmail {
    notificationId: string;
    email: string;
    body: string;
}

/** Storage side of the relay, so its logic can be tested without a database. */
export interface EmailOutbox {
    /** Locks up to `limit` unsent notifications for the current transaction. */
    claimPending(limit: number): Promise<PendingEmail[]>;
    markSent(ids: string[], sentAt: Date): Promise<void>;
}

export type Mailer = (to: string, subject: string, text: string) => Promise<void>;
export type OutboxTransaction = <T>(fn: (outbox: EmailOutbox) => Promise<T>) => Promise<T>;

export interface EmailRelayOptions {
    intervalMs?: number;
    batchSize?: number;
    send?: Mailer;
    runInTransaction?: OutboxTransaction;
    now?: () => Date;
}

export function drizzleOutbox(tx: DrizzleTx): EmailOutbox {
    return {
        claimPending: limit =>
            tx
                .select({
                    notificationId: notifications.id,
                    body: notifications.body,
                    email: users.email,
                })
                .from(notifications)
                .innerJoin(users, eq(users.id, notifications.recipientId))
                .where(isNull(notifications.sentAt))
                .orderBy(notifications.createdAt)
                .limit(limit)
                .for('update', { skipLocked: true }),
        markSent: async (ids, sentAt) => {
            await tx
                .update(notifications)
                .set({ sentAt })
                .where(and(inArray(notifications.id, ids), isNull(notifications.sentAt)));
        },
    };
}

const drizzleTransaction: OutboxTransaction = fn => transaction(tx => fn(drizzleOutbox(tx)));

/**
 * Sends one batch of pending notifications. A failed send leaves its row
 * unsent for the next run; the others are still marked as sent.
 * Returns the number of emails sent.
 */
export async function relayBatch(
    outbox: EmailOutbox,
    send: Mailer,
    batchSize: number,
    now: () => Date = () => new Date(),
): Promise<number> {
    const pending = await outbox.claimPending(batchSize);
    const sentIds: string[] = [];

    for (const row of pending) {
        try {
            await send(row.email, EMAIL_SUBJECT, row.body);
            sentIds.push(row.notificationId);
        } catch (err) {
            console.error(`[email-relay] failed to send notification ${row.notificationId}`, err);
        }
    }

    if (sentIds.length > 0) {
        await outbox.markSent(sentIds, now());
        console.log(`[email-relay] ${sentIds.length} email(s) sent.`);
    }
    return sentIds.length;
}

/** SMTP is optional: without SMTP_HOST the stack runs without sending mail. */
export function isEmailRelayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(env.SMTP_HOST);
}

export function startEmailRelay(options: EmailRelayOptions = {}) {
    const intervalMs = options.intervalMs ?? 5000;
    const batchSize = options.batchSize ?? 10;
    const send = options.send ?? sendEmail;
    const runInTransaction = options.runInTransaction ?? drizzleTransaction;
    const now = options.now ?? (() => new Date());
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;

    const tick = async (): Promise<void> => {
        try {
            await runInTransaction(outbox => relayBatch(outbox, send, batchSize, now));
        } catch (error) {
            console.error('[email-relay] run failed', error);
        } finally {
            if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
        }
    };

    void tick();

    return {
        stop(): void {
            stopped = true;
            if (timer) clearTimeout(timer);
        },
    };
}
