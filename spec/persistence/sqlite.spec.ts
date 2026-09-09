export {};
const fs = require('fs');
const path = require('path');
const os = require('os');

const previousLocation = process.env.SQLITE_DB_LOCATION;
const previousNodeEnv = process.env.NODE_ENV;
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-test-'));
const location = path.join(testRoot, 'todo.db');
process.env.SQLITE_DB_LOCATION = location;
const db = require('../../src/persistence/sqlite');

const ITEM = {
    id: '7aef3d7c-d301-4846-8358-2a91ec9d6be3',
    name: 'Test',
    completed: false,
};

beforeEach(() => {
    if (fs.existsSync(location)) {
        fs.unlinkSync(location);
    }
});

afterEach(() => {
    process.env.SQLITE_DB_LOCATION = location;
    process.env.NODE_ENV = previousNodeEnv;
    jest.restoreAllMocks();
    jest.dontMock('sqlite3');
    jest.resetModules();
});

afterAll(() => {
    if (previousLocation === undefined) {
        delete process.env.SQLITE_DB_LOCATION;
    } else {
        process.env.SQLITE_DB_LOCATION = previousLocation;
    }
    fs.rmSync(testRoot, { recursive: true, force: true });
});

test('it initializes correctly', async () => {
    await db.init();
    await db.teardown();
});

test('it can create directory if do not exist', async () => {
    const testDir = path.join(testRoot, 'nested');
    const dbPath = path.join(testDir, 'todo.db');

    process.env.SQLITE_DB_LOCATION = dbPath;

    jest.resetModules();

    const database = require('../../src/persistence/sqlite');

    expect(fs.existsSync(testDir)).toBe(false);

    await database.init();

    expect(fs.existsSync(testDir)).toBe(true);

    await database.teardown();

    delete process.env.SQLITE_DB_LOCATION;

    fs.rmSync(testDir, { recursive: true, force: true });
});

test('it can store and retrieve items', async () => {
    await db.init();

    await db.storeItem(ITEM);

    const items = await db.getItems();

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(ITEM);

    await db.teardown();
});

test('it can update an existing item', async () => {
    await db.init();

    const initialItems = await db.getItems();
    expect(initialItems.length).toBe(0);

    await db.storeItem(ITEM);

    await db.updateItem(
        ITEM.id,
        {
            ...ITEM,
            completed: true,
        },
    );

    const item = await db.getItem(ITEM.id);

    expect(item).toEqual({
        ...ITEM,
        completed: true,
    });

    await db.teardown();
});

test('it can remove an existing item', async () => {
    await db.init();

    await db.storeItem(ITEM);
    await db.removeItem(ITEM.id);

    const items = await db.getItems();

    expect(items).toHaveLength(0);

    await db.teardown();
});

test('it can get a single item', async () => {
    await db.init();

    await db.storeItem(ITEM);

    const item = await db.getItem(ITEM.id);

    expect(item).toEqual(ITEM);

    await db.teardown();
});

test('it can close correctly', async () => {
    await db.init();

    await expect(db.teardown()).resolves.toBeUndefined();
});

test('it rejects when database cannot be opened', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                process.nextTick(() => {
                    callback(new Error('Database open error'));
                });
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await expect(database.init()).rejects.toThrow(
        'Database open error',
    );
});

test('it rejects when table creation fails', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                const fakeDb = {
                    run: jest.fn((query, callback) => {
                        callback(new Error('Create table error'));
                    }),
                };

                process.nextTick(() => callback(null));

                return fakeDb;
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await expect(database.init()).rejects.toThrow(
        'Create table error',
    );
});

test('it rejects when closing database fails', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                const fakeDb = {
                    run: jest.fn((query, callback) => {
                        callback(null);
                    }),
                    close: jest.fn(callback => {
                        callback(new Error('Close error'));
                    }),
                };

                process.nextTick(() => callback(null));

                return fakeDb;
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await database.init();

    await expect(database.teardown()).rejects.toThrow(
        'Close error',
    );
});

test('it rejects when getItems fails', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                const fakeDb = {
                    run: jest.fn((query, callback) => {
                        callback(null);
                    }),
                    all: jest.fn((query, callback) => {
                        callback(new Error('Get items error'));
                    }),
                };

                process.nextTick(() => callback(null));

                return fakeDb;
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await database.init();

    await expect(database.getItems()).rejects.toThrow(
        'Get items error',
    );
});

test('it rejects when getItem fails', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                const fakeDb = {
                    run: jest.fn((query, callback) => {
                        callback(null);
                    }),
                    all: jest.fn((query, params, callback) => {
                        callback(new Error('Get item error'));
                    }),
                };

                process.nextTick(() => callback(null));

                return fakeDb;
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await database.init();

    await expect(
        database.getItem(ITEM.id),
    ).rejects.toThrow('Get item error');
});

test('it rejects when storing an item fails', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                const fakeDb = {
                    run: jest.fn((query, ...args) => {
                        const callback = args[args.length - 1];

                        if (query.includes('CREATE TABLE')) {
                            callback(null);
                            return;
                        }

                        if (query.includes('INSERT INTO')) {
                            callback(new Error('Store item error'));
                            return;
                        }

                        callback(null);
                    }),
                };

                process.nextTick(() => callback(null));

                return fakeDb;
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await database.init();

    await expect(
        database.storeItem(ITEM),
    ).rejects.toThrow('Store item error');
});

test('it rejects when updating an item fails', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                const fakeDb = {
                    run: jest.fn((query, ...args) => {
                        const callback = args[args.length - 1];

                        if (query.includes('CREATE TABLE')) {
                            callback(null);
                            return;
                        }

                        if (query.includes('UPDATE')) {
                            callback(new Error('Update item error'));
                            return;
                        }

                        callback(null);
                    }),
                };

                process.nextTick(() => callback(null));

                return fakeDb;
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await database.init();

    await expect(
        database.updateItem(ITEM.id, {
            ...ITEM,
            completed: true,
        }),
    ).rejects.toThrow('Update item error');
});

test('it rejects when removing an item fails', async () => {
    jest.resetModules();

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database: jest.fn((location, callback) => {
                const fakeDb = {
                    run: jest.fn((query, ...args) => {
                        const callback = args[args.length - 1];

                        if (query.includes('CREATE TABLE')) {
                            callback(null);
                            return;
                        }

                        if (query.includes('DELETE')) {
                            callback(new Error('Remove item error'));
                            return;
                        }

                        callback(null);
                    }),
                };

                process.nextTick(() => callback(null));

                return fakeDb;
            }),
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    await database.init();

    await expect(
        database.removeItem(ITEM.id),
    ).rejects.toThrow('Remove item error');
});

test('it uses the default database location when SQLITE_DB_LOCATION is not defined', async () => {
    const previousLocation = process.env.SQLITE_DB_LOCATION;

    delete process.env.SQLITE_DB_LOCATION;

    jest.resetModules();

    const Database = jest.fn((location, callback) => {
        const fakeDb = {
            run: jest.fn((query, callback) => {
                callback(null);
            }),
        };

        process.nextTick(() => callback(null));

        return fakeDb;
    });

    jest.doMock('sqlite3', () => ({
        verbose: () => ({
            Database,
        }),
    }));

    const database = require('../../src/persistence/sqlite');

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    await database.init();

    expect(Database).toHaveBeenCalledWith(
        '/etc/todos/todo.db',
        expect.any(Function),
    );

    if (previousLocation === undefined) {
        delete process.env.SQLITE_DB_LOCATION;
    } else {
        process.env.SQLITE_DB_LOCATION = previousLocation;
    }
});

test('it logs database location when NODE_ENV is not test', async () => {
    const previousNodeEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'production';

    jest.resetModules();

    const consoleLogSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

    const database = require('../../src/persistence/sqlite');

    await database.init();

    expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using sqlite database at'),
    );

    await database.teardown();

    process.env.NODE_ENV = previousNodeEnv;
});
