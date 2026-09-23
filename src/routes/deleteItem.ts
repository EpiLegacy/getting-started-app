import db from '../persistence';
import type { Request, Response } from 'express';

export = async (req: Request<{ id: string }>, res: Response) => {
    await db.removeItem(req.params.id);
    res.sendStatus(200);
};
