const db = require('../persistence');
import type { Request, Response } from 'express';

module.exports = async (req: Request, res: Response) => {
    await db.removeItem(req.params.id);
    res.sendStatus(200);
};
