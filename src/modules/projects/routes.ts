import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthService } from '../auth/service';
import type { ProjectService } from './service';
import { requireAuth } from '../auth/routes';

const projectIdSchema = z.string().uuid();

const taskKeySchema = z
    .number()
    .int()
    .positive();

const nameSchema = z
    .string()
    .trim()
    .min(1)
    .max(255);

const emailSchema = z
    .string()
    .trim()
    .email();

const userIdSchema = z.string().uuid();

function currentUser(res: Response): { id: string } {
    return res.locals.user;
}

function sendServiceError(
    res: any,
    error: string,
) {
    switch (error) {
        case 'not_found':
        case 'user_not_found':
        case 'item_not_found':
            return res.status(404).json({
                error,
            });

        case 'forbidden':
            return res.status(403).json({
                error,
            });

        case 'already_member':
        case 'already_in_project':
        case 'owner_cannot_leave':
        case 'assignee_not_member':
            return res.status(409).json({
                error,
            });

        default:
            return res.status(500).json({
                error: 'internal_error',
            });
    }
}

export function createProjectsRouter(
    service: ProjectService,
    authService: AuthService | undefined,
) {
    const router = Router();

    if (!authService) {
        router.use((_req, res) => {
            res.status(503).json({ error: 'auth_unavailable', message: 'Authentication needs MySQL: set MYSQL_HOST.' });
        });
        return router;
    }

    router.use(requireAuth(authService));

    router.get('/', async (req, res, next) => {
        try {
            const user = currentUser(res);

            const projects = await service.list(user.id);

            return res.json({
                projects,
            });
        } catch (error) {
            next(error);
        }
    });

    router.post('/', async (req, res, next) => {
        try {
            const parsed = z.object({
                name: nameSchema,
            }).safeParse(req.body);

            if (!parsed.success) {
                return res.status(400).json({
                    error: 'invalid_request',
                });
            }

            const user = currentUser(res);

            const project = await service.create(
                user.id,
                parsed.data.name,
            );

            return res.status(201).json({
                project,
            });
        } catch (error) {
            next(error);
        }
    });

    router.get('/:projectId', async (req, res, next) => {
        try {
            const parsedId =
                projectIdSchema.safeParse(
                    req.params.projectId,
                );

            if (!parsedId.success) {
                return res.status(400).json({
                    error: 'invalid_project_id',
                });
            }

            const user = currentUser(res);

            const result = await service.get(
                parsedId.data,
                user.id,
            );

            if (!result.ok) {
                return sendServiceError(
                    res,
                    result.error,
                );
            }

            return res.json({
                project: result.value,
            });
        } catch (error) {
            next(error);
        }
    });

    router.patch('/:projectId', async (req, res, next) => {
        try {
            const parsedId =
                projectIdSchema.safeParse(
                    req.params.projectId,
                );

            const parsedBody = z.object({
                name: nameSchema,
            }).safeParse(req.body);

            if (
                !parsedId.success ||
                !parsedBody.success
            ) {
                return res.status(400).json({
                    error: 'invalid_request',
                });
            }

            const user = currentUser(res);

            const result = await service.rename(
                parsedId.data,
                user.id,
                parsedBody.data.name,
            );

            if (!result.ok) {
                return sendServiceError(
                    res,
                    result.error,
                );
            }

            return res.json({
                project: result.value,
            });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:projectId', async (req, res, next) => {
        try {
            const parsedId =
                projectIdSchema.safeParse(
                    req.params.projectId,
                );

            if (!parsedId.success) {
                return res.status(400).json({
                    error: 'invalid_project_id',
                });
            }

            const user = currentUser(res);

            const result = await service.remove(
                parsedId.data,
                user.id,
            );

            if (!result.ok) {
                return sendServiceError(
                    res,
                    result.error,
                );
            }

            return res.status(204).send();
        } catch (error) {
            next(error);
        }
    });

    router.post(
        '/:projectId/members',
        async (req, res, next) => {
            try {
                const parsedId =
                    projectIdSchema.safeParse(
                        req.params.projectId,
                    );

                const parsedBody = z.object({
                    email: emailSchema,
                }).safeParse(req.body);

                if (
                    !parsedId.success ||
                    !parsedBody.success
                ) {
                    return res.status(400).json({
                        error: 'invalid_request',
                    });
                }

                const user = currentUser(res);

                const result =
                    await service.addMember(
                        parsedId.data,
                        user.id,
                        parsedBody.data.email
                            .toLowerCase(),
                    );

                if (!result.ok) {
                    return sendServiceError(
                        res,
                        result.error,
                    );
                }

                return res.status(201).json({
                    members: result.value,
                });
            } catch (error) {
                next(error);
            }
        },
    );

    router.delete(
        '/:projectId/members/:userId',
        async (req, res, next) => {
            try {
                const parsedProjectId =
                    projectIdSchema.safeParse(
                        req.params.projectId,
                    );

                const parsedUserId =
                    userIdSchema.safeParse(
                        req.params.userId,
                    );

                if (
                    !parsedProjectId.success ||
                    !parsedUserId.success
                ) {
                    return res.status(400).json({
                        error: 'invalid_request',
                    });
                }

                const user = currentUser(res);

                const result =
                    await service.removeMember(
                        parsedProjectId.data,
                        user.id,
                        parsedUserId.data,
                    );

                if (!result.ok) {
                    return sendServiceError(
                        res,
                        result.error,
                    );
                }

                return res.status(204).send();
            } catch (error) {
                next(error);
            }
        },
    );

    router.post(
        '/:projectId/items',
        async (req, res, next) => {
            try {
                const parsedProjectId =
                    projectIdSchema.safeParse(
                        req.params.projectId,
                    );

                const parsedBody = z.object({
                    taskKey: taskKeySchema,
                    userId: userIdSchema,
                }).safeParse(req.body);

                if (
                    !parsedProjectId.success ||
                    !parsedBody.success
                ) {
                    return res.status(400).json({
                        error: 'invalid_request',
                    });
                }

                const user = currentUser(res);

                const result =
                    await service.addItem(
                        parsedProjectId.data,
                        user.id,
                        parsedBody.data.taskKey,
                        parsedBody.data.userId,
                    );

                if (!result.ok) {
                    return sendServiceError(
                        res,
                        result.error,
                    );
                }

                return res.status(201).json({
                    items: result.value,
                });
            } catch (error) {
                next(error);
            }
        },
    );

    router.delete(
        '/:projectId/items/:taskKey',
        async (req, res, next) => {
            try {
                const parsedProjectId =
                    projectIdSchema.safeParse(
                        req.params.projectId,
                    );

                const parsedTaskKey = z.coerce
                    .number()
                    .int()
                    .positive()
                    .safeParse(
                        req.params.taskKey,
                    );

                if (
                    !parsedProjectId.success ||
                    !parsedTaskKey.success
                ) {
                    return res.status(400).json({
                        error: 'invalid_request',
                    });
                }

                const user = currentUser(res);

                const result =
                    await service.removeItem(
                        parsedProjectId.data,
                        user.id,
                        parsedTaskKey.data,
                    );

                if (!result.ok) {
                    return sendServiceError(
                        res,
                        result.error,
                    );
                }

                return res.status(204).send();
            } catch (error) {
                next(error);
            }
        },
    );

    return router;
}
