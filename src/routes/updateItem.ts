const db = require('../persistence');
import type { Request, Response } from 'express';

module.exports = async (req: Request, res: Response) => {
    await db.updateItem(req.params.id, {
        name: req.body.name,
        completed: req.body.completed,
    });
    const item = await db.getItem(req.params.id);
    res.send(item);
};
