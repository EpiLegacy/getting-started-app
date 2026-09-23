import db from '../persistence';
import type { Request, Response } from 'express';

export = async (_req: Request, res: Response) => {
    const items = await db.getItems();
    res.send(items);
};
