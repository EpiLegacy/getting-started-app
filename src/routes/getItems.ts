const db = require('../persistence');
import type { Request, Response } from 'express';

module.exports = async (_req: Request, res: Response) => {
    const items = await db.getItems();
    res.send(items);
};
