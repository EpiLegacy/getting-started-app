export interface Gate {
    promise: Promise<void>;
    open(): void;
}

/** A promise that resolves when `open` is called. */
export function gate(): Gate {
    let open!: () => void;
    const promise = new Promise<void>(resolve => {
        open = resolve;
    });
    return { promise, open };
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * How `promise` stands after `ms`: still "pending" means it was blocked for
 * at least that long. The caller still awaits the promise itself afterwards.
 */
export async function stateAfter(
    promise: Promise<unknown>,
    ms: number,
): Promise<'fulfilled' | 'rejected' | 'pending'> {
    let timer: NodeJS.Timeout | undefined;
    const pending = new Promise<'pending'>(resolve => {
        timer = setTimeout(() => resolve('pending'), ms);
    });
    try {
        return await Promise.race([
            promise.then(
                () => 'fulfilled' as const,
                () => 'rejected' as const,
            ),
            pending,
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
        await sleep(20);
    }
}
