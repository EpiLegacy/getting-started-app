import db from '../persistence';
import { v4 as uuid } from 'uuid';
import type { Request, Response } from 'express';
import { Item } from '../types';

export = async (req: Request, res: Response) => {
    const item: Item = {
        id: uuid(),
        name: req.body.name,
        completed: false,
        deadline: req.body.deadline,
        priorisation: req.body.priorisation,
    };

    await db.storeItem(item);
    res.send(item);
};
