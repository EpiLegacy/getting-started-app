const db = require('../persistence');
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { isMysqlConfigured } from '../infrastructure/db/mysql';
import { updateTask } from '../modules/tasks/application/updateTask';

module.exports = async (req: Request, res: Response) => {
    // The event-driven path needs transactions, which only the MySQL adapter
    // provides. SQLite development keeps the legacy behaviour, without events.
    if (!isMysqlConfigured()) {
        await db.updateItem(req.params.id, {
            name: req.body.name,
            completed: req.body.completed,
        });
        const item = await db.getItem(req.params.id);
        res.send(item);
        return;
    }

    // Carried through the outbox into the event, so one user action can be
    // traced from the HTTP request to the worker log.
    const header = req.header('x-correlation-id');
    const correlationId = (Array.isArray(header) ? header[0] : header) || randomUUID();

    const updated = await updateTask({
        id: String(req.params.id),
        name: req.body.name,
        completed: Boolean(req.body.completed),
        correlationId,
    });

    if (!updated) {
        res.status(404).send({ error: 'Item not found' });
        return;
    }

    res.send(updated);
};
