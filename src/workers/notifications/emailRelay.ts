// src/workers/notifications/emailRelay.ts
import { inArray, eq } from 'drizzle-orm';
import { transaction } from '../../infrastructure/db/drizzle';
import { notifications, users } from '../../infrastructure/db/schema';
import { sendEmail } from '../../infrastructure/email/mailer';

export interface EmailRelayOptions {
    intervalMs?: number;
    batchSize?: number;
}

export function startEmailRelay(options: EmailRelayOptions = {}) {
    const intervalMs = options.intervalMs ?? 5000;
    const batchSize = options.batchSize ?? 10;
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;

    const tick = async (): Promise<void> => {
        try {
            await transaction(async tx => {
                const pending = await tx
                    .select({
                        notificationId: notifications.id,
                        body: notifications.body,
                        email: users.email,
                    })
                    .from(notifications)
                    .innerJoin(users, eq(users.id, notifications.recipientId))
                    .limit(batchSize)
                    .for('update', { skipLocked: true });

                if (pending.length === 0) return;

                const processedIds: string[] = [];

                for (const row of pending) {
                    try {
                        await sendEmail(row.email, 'New Notification Todo App', row.body);
                        processedIds.push(row.notificationId);
                    } catch (err) {
                        console.error(`[email-relay] Fail to send on ${row.email}`, err);
                    }
                }

                if (processedIds.length > 0) {
                    await tx.delete(notifications).where(inArray(notifications.id, processedIds));
                    console.log(`[email-relay] ${processedIds.length} email sended and deleted.`);
                }
            });
        } catch (error) {
            console.error(`[email-relay] Fail :`, error);
        } finally {
            if (!stopped) timer = setTimeout(tick, intervalMs);
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