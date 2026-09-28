import { connect, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { closePool, ensureEventSchema } from '../../infrastructure/db/mysql';
import { init as initDrizzlePool, teardown as teardownDrizzlePool } from '../../infrastructure/db/drizzle';
import { rabbitmqUrl } from '../../infrastructure/messaging/rabbitmqPublisher';
import { assertTopology, NOTIFICATIONS_QUEUE } from '../../infrastructure/messaging/topology';
import { resolvePersistenceDriver } from '../../shared/persistenceDriver';
import { handleTaskEvent } from './handler';
import { handleTaskEvent as handleTaskEventDrizzle } from './handler.drizzle';
import { createWorkerMetrics } from './metrics';
import { createMessageProcessor } from './consumer';

const PREFETCH = 10;
// A separate process from the API: it validates PERSISTENCE_DRIVER on its
// own instead of relying on src/persistence/index.ts having run first.
const useDrizzle = resolvePersistenceDriver() === 'drizzle';
const runHandleTaskEvent = useDrizzle ? handleTaskEventDrizzle : handleTaskEvent;
const metrics = createWorkerMetrics();
const onMessage = createMessageProcessor(runHandleTaskEvent, metrics);

/**
 * Standalone consumer process. Same image as the API, different command: the
 * two share the event schemas, so their contract cannot drift.
 */
async function main(): Promise<void> {
    // Private in Compose: never published on a host port.
    const metricsServer = metrics.app.listen(9000);
    metricsServer.on('error', (error: Error) => {
        console.error('[worker] metrics server failed', error);
        process.exit(1);
    });
    await ensureEventSchema();
    if (useDrizzle) await initDrizzlePool();

    // The whole consumer setup lives in the recovery hook, which amqplib runs
    // after EVERY successful connection. A channel belongs to the connection
    // that created it, so a broker restart would otherwise leave this process
    // alive but subscribed to nothing - a silent zombie, worse than a crash.
    const model = await connect(rabbitmqUrl(), {
        recovery: {
            // Matches the publisher: recovery close to the broker's restart
            // time rather than amqplib's 30s default ceiling.
            maxDelay: 5_000,
            setup: async (connected: ChannelModel) => {
                const channel = await connected.createChannel();
                channel.on('close', () => metrics.setConsuming(false));
                channel.on('error', () => metrics.setConsuming(false));
                await assertTopology(channel);

                // Bounded in-flight work: without it a single consumer would
                // pull the whole queue into memory and lose it all on a crash.
                await channel.prefetch(PREFETCH);

                await channel.consume(NOTIFICATIONS_QUEUE, (message: ConsumeMessage | null) => {
                    if (!message) {
                        metrics.setConsuming(false);
                        return;
                    }
                    void onMessage(channel, message).catch((error: unknown) => {
                        // An acknowledgement on a closed channel can throw.
                        // The broker requeues unacknowledged deliveries.
                        console.error('[worker] delivery interrupted', error);
                    });
                });
                metrics.setConsuming(true);
                console.log(`[worker] consuming ${NOTIFICATIONS_QUEUE}`);
            },
        },
    });

    model.on('connect', () => console.log('[worker] connected to rabbitmq'));
    model.on('disconnect', (error: Error) => {
        metrics.setConsuming(false);
        console.error(`[worker] disconnected from rabbitmq: ${error.message}`);
    });
    model.on('error', (error: Error) => console.error(`[worker] rabbitmq: ${error.message}`));

    const shutdown = async (): Promise<void> => {
        metrics.setConsuming(false);
        metricsServer.close();
        try {
            await model.close();
            await closePool();
            if (useDrizzle) await teardownDrizzlePool();
        } finally {
            process.exit(0);
        }
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
    console.error('[worker] fatal', error);
    process.exit(1);
});
