import { PURGE_INTERVAL_MS, startSessionPurge } from '../../../src/modules/auth/sessionPurge';

let purge: jest.Mock<Promise<number>, []>;
let log: jest.SpyInstance;
let errors: jest.SpyInstance;

beforeEach(() => {
    jest.useFakeTimers();
    purge = jest.fn(async () => 0);
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.useRealTimers();
    log.mockRestore();
    errors.mockRestore();
});

test('purges once at start, then every hour', async () => {
    const running = startSessionPurge(purge);
    expect(purge).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(PURGE_INTERVAL_MS);
    expect(purge).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(PURGE_INTERVAL_MS);
    expect(purge).toHaveBeenCalledTimes(3);

    running.stop();
});

test('the interval is one hour', () => {
    expect(PURGE_INTERVAL_MS).toBe(3_600_000);
});

test('stops when asked', async () => {
    const running = startSessionPurge(purge, 1000);
    running.stop();

    await jest.advanceTimersByTimeAsync(10_000);

    expect(purge).toHaveBeenCalledTimes(1);
});

test('says how many sessions it purged, and stays quiet when there were none', async () => {
    purge.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    const running = startSessionPurge(purge, 1000);
    await jest.advanceTimersByTimeAsync(1000);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Purged 3 expired session(s)');
    running.stop();
});

test('a failed run is logged, and the next one still happens', async () => {
    purge.mockRejectedValueOnce(new Error("Table 'todos.sessions' doesn't exist"));
    const running = startSessionPurge(purge, 1000);
    await jest.advanceTimersByTimeAsync(0);

    expect(errors).toHaveBeenCalledWith('Expired session purge failed:', expect.any(Error));

    await jest.advanceTimersByTimeAsync(1000);
    expect(purge).toHaveBeenCalledTimes(2);
    running.stop();
});

test('never keeps the process alive on its own', () => {
    jest.useRealTimers();
    const created = jest.spyOn(global, 'setInterval');

    const running = startSessionPurge(purge);
    try {
        const timer = created.mock.results[0].value as NodeJS.Timeout;
        // A ref'd interval would keep Node running after everything else stopped.
        expect(timer.hasRef()).toBe(false);
    } finally {
        // Even when the assertion fails: a live one-hour interval would keep
        // Jest itself from exiting.
        running.stop();
        created.mockRestore();
    }
});
