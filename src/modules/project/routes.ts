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
    const { name, usersEmail } = req.body;
    const userId = currentUser(res).id;

    const project = await projectRepository.create(
      userId,
      {
        name: name.trim(),
      },
      usersEmail
    );

    return res.status(201).json(project);
  });

  router.patch('/:id', async (req, res) => {
    const project = await projectRepository.update(
      req.params.id,
      currentUser(res).id,
      req.body,
    );

    if (!project) {
      return res.status(404).json({
        message: 'Projet introuvable ou accès refusé',
      });
    }

    return res.json(project);
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await projectRepository.remove(
      req.params.id,
      currentUser(res).id,
    );

    if (!deleted) {
      return res.status(404).json({
        message: 'Projet introuvable ou accès refusé',
      });
    }

    return res.status(204).send();
  });

  router.post('/:id/users', async (req, res) => {
    const { email } = req.body;

    const project = await projectRepository.addUser(
      req.params.id,
      currentUser(res).id,
      email,
    );

    if (!project) {
      return res.status(404).json({
        message: 'Projet introuvable ou accès refusé',
      });
    }

    return res.json(project);
  });

  router.delete('/:id/users', async (req, res) => {
    const { email } = req.body;

    const project = await projectRepository.removeUser(
      req.params.id,
      currentUser(res).id,
      email,
    );

    if (!project) {
      return res.status(404).json({
        message: 'Projet introuvable ou accès refusé',
      });
    }

    return res.json(project);
  });

  return router;
}
