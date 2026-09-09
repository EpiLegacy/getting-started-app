const db = require('../persistence');
const {v4 : uuid} = require('uuid');
import type { Request, Response } from 'express';

module.exports = async (req: Request, res: Response) => {
    const item = {
        id: uuid(),
        name: req.body.name,
        completed: false,
    };

    await db.storeItem(item);
    res.send(item);
};
