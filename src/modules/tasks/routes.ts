import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/routes';
import type { AuthService } from '../auth/service';
import type { TaskRepository } from './types';

const taskInput = z.object({
    name: z.string().trim().min(1).max(255),
    completed: z.boolean(),
    deadline: z.union([z.literal(''), z.iso.date()]),
    priorisation: z.enum(['high', 'medium', 'low']),
});
const taskId = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(4294967295));

export function createTaskRouter(service: AuthService | undefined, repository: TaskRepository): Router {
    const router = Router();
    router.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    if (!service) {
        router.use((_req, res) => {
            res.status(503).json({ error: 'auth_unavailable', message: 'Authentication needs MySQL: set MYSQL_HOST.' });
        });
        return router;
    }
    router.use(requireAuth(service));
    router.get('/', async (_req, res) => {
        res.json(await repository.list(currentUser(res).id));
    });
    router.get('/unassigned', async (_req, res) => {
        res.json(await repository.listUnassigned());
    });
    router.post('/', async (req, res) => {
        const parsed = taskInput.safeParse({ ...req.body, completed: false });
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid_task', issues: parsed.error.issues });
            return;
        }
        res.status(201).json(await repository.create(currentUser(res).id, parsed.data));
    });
    router.param('id', (req, res, next, id) => {
        const parsed = taskId.safeParse(id);
        if (!parsed.success) {
            res.status(404).json({ error: 'task_not_found' });
            return;
        }
        res.locals.taskId = parsed.data;
        next();
    });
    router.post('/:id/claim', async (_req, res) => {
        const claimed = await repository.claim(res.locals.taskId, currentUser(res).id);
        if (!claimed) {
            // Do not disclose who owns a task (or whether a private task exists).
            res.status(409).json({ error: 'task_unavailable' });
            return;
        }
        res.status(204).end();
    });
    router.route('/:id').put(update).patch(update);
    async function update(req: Request, res: Response) {
        const schema = req.method === 'PATCH' ? taskInput.partial().refine(input => Object.keys(input).length > 0) : taskInput;
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid_task', issues: parsed.error.issues });
            return;
        }
        const task = await repository.update(res.locals.taskId, currentUser(res).id, parsed.data,
            req.get('x-correlation-id')?.slice(0, 64) || randomUUID());
        if (!task) {
            res.status(404).json({ error: 'task_not_found' });
            return;
        }
        res.json(task);
    }
    router.delete('/:id', async (_req, res) => {
        if (!await repository.remove(res.locals.taskId, currentUser(res).id)) {
            res.status(404).json({ error: 'task_not_found' });
            return;
        }
        res.status(204).end();
    });
    return router;
}
