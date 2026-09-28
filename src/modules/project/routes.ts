import { Router } from 'express';

import type { AuthService } from '../auth/service';
import type { ProjectRepository } from './types';
import { currentUser, requireAuth } from '../auth/routes';

export function createProjectRouter(
  authService: AuthService | undefined,
  projectRepository: ProjectRepository,
) {
  const router = Router();
  if (!authService) {
    router.use((_req, res) => {
      res.status(503).json({ error: 'auth_unavailable', message: 'Authentication needs MySQL: set MYSQL_HOST.' });
    });
    return router;
  }
  router.use(requireAuth(authService));

  
  router.get('/', async (_req, res) => {
    res.json(await projectRepository.list());
  });

  router.post('/', async (req, res) => {
    const { name } = req.body;
    const userId = currentUser(res).id;
  
    const project = await projectRepository.create(
      userId,
      {
        name: name.trim(),
      },
    );
  
    return res.status(201).json(project);
  });

  return router;
}
