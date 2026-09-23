import type { Request, Response } from 'express';
const db = jest.requireMock('../../src/persistence');
export {};
import deleteItem from '../../src/routes/deleteItem';

jest.mock('../../src/persistence', () => ({
    removeItem: jest.fn(),
    getItem: jest.fn(),
}));

test('it removes item correctly', async () => {
    const req = { params: { id: 12345 } };
    const res = { sendStatus: jest.fn() };

    await deleteItem(req as unknown as Request<{ id: string }>, res as unknown as Response);

    expect(db.removeItem.mock.calls.length).toBe(1);
    expect(db.removeItem.mock.calls[0][0]).toBe(req.params.id);
    expect(res.sendStatus.mock.calls[0].length).toBe(1);
    expect(res.sendStatus.mock.calls[0][0]).toBe(200);
});
