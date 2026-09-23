import type { Request, Response } from 'express';
const db = jest.requireMock('../../src/persistence');
export {};
import getItems from '../../src/routes/getItems';
const ITEMS = [{ id: 12345 }];

jest.mock('../../src/persistence', () => ({
    getItems: jest.fn(),
}));

test('it gets items correctly', async () => {
    const req = {};
    const res = { send: jest.fn() };
    db.getItems.mockReturnValue(Promise.resolve(ITEMS));

    await getItems(req as unknown as Request, res as unknown as Response);

    expect(db.getItems.mock.calls.length).toBe(1);
    expect(res.send.mock.calls[0].length).toBe(1);
    expect(res.send.mock.calls[0][0]).toEqual(ITEMS);
});
