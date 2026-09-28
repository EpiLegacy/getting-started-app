import React, { useState, useEffect } from 'react';
import { Alert, Box, Button, MenuItem, Modal, TextField, Typography } from '@mui/material';
import { itemsApi } from '../api/itemsApi';
import { projectsApi } from '../api/projectApi';
import { errorMessage } from '../../../lib/http';
import type { Priority } from '../../../../types';

interface AddItemProps {
  open: boolean;
  handleClose: () => void;
  onCreated: () => void;
}

export default function AddItem({ open, handleClose, onCreated }: AddItemProps) {
  const [name, setName] = useState<string>('');
  const [deadline, setDeadline] = useState<string>('');
  const [priorisation, setPriorisation] = useState<Priority>('medium');

  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<
    { id: string; name: string }[]
  >([]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    const getProjects = async () => {
      setLoadingProjects(true);
      setError('');

      try {
        const res = await projectsApi.getAll(controller.signal);

        setProjects(res);

        if (res.length > 0) {
          setProjectId(res[0].id);
        } else {
          setProjectId('');
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(errorMessage(cause));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingProjects(false);
        }
      }
    };

    getProjects();

    return () => {
      controller.abort();
    };
  }, [open]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!projectId) {
      setError('Veuillez ajouter un projet.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      await itemsApi.create({
        completed: false,
        name,
        deadline,
        priorisation,
        projectId,
      });

      setName('');
      setDeadline('');
      setPriorisation('medium');
      setProjectId('');

      onCreated();
      handleClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const noProjects = !loadingProjects && projects.length === 0;

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : handleClose}
      aria-labelledby="modal-modal-title"
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400,
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Typography
          id="modal-modal-title"
          variant="h6"
          component="h2"
        >
          Ajouter une tâche
        </Typography>

        {error && (
          <Alert severity="error">
            {error}
          </Alert>
        )}

        {loadingProjects ? (
          <TextField
            label="Projet"
            value="Chargement..."
            fullWidth
            disabled
          />
        ) : noProjects ? (
          <Alert severity="info">
            Aucun projet n'existe encore. Veuillez d'abord créer
            un projet avant d'ajouter une tâche.
          </Alert>
        ) : (
          <TextField
            name="projectId"
            label="Projet"
            select
            required
            fullWidth
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          name="name"
          label="Nom"
          variant="outlined"
          required
          fullWidth
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <TextField
          name="deadline"
          label="Deadline"
          type="date"
          variant="outlined"
          required
          fullWidth
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          slotProps={{
            inputLabel: {
              shrink: true,
            },
          }}
        />

        <TextField
          name="priorisation"
          label="Priorisation"
          select
          value={priorisation}
          onChange={(event) =>
            setPriorisation(event.target.value as Priority)
          }
          required
          fullWidth
        >
          <MenuItem value="high">High</MenuItem>
          <MenuItem value="medium">Medium</MenuItem>
          <MenuItem value="low">Low</MenuItem>
        </TextField>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            mt: 1,
          }}
        >
          <Button
            disabled={busy}
            type="button"
            variant="outlined"
            onClick={handleClose}
          >
            Annuler
          </Button>

          <Button
            disabled={busy || loadingProjects || noProjects}
            type="submit"
            variant="contained"
          >
            Ajouter
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

// ### Important : ton `itemsApi.create`

// Il faut maintenant que le type de création accepte `projectId` :

// ```ts
// export type ItemInput = {
//   name: string;
//   completed: boolean;
//   deadline: string;
//   priorisation: Priority;
//   projectId: string;
// };
// ```

// Et ton appel :

// ```ts
// create: (item: ItemInput) =>
//   request<TodoItem>('/items', {
//     method: 'POST',
//     body: JSON.stringify(item),
//   }),
// ```

// Le JSON envoyé au backend sera donc :

// ```json
// {
//   "name": "Ma tâche",
//   "completed": false,
//   "deadline": "2026-10-01",
//   "priorisation": "medium",
//   "projectId": "3147d0d2-a8d3-4337-843f-7f76d6ae9f40"
// }
// ```

// ### Côté backend

// Ton endpoint `/items` devra récupérer `projectId` :

// ```ts
// const {
//   name,
//   completed,
//   deadline,
//   priorisation,
//   projectId,
// } = req.body;
// ```

// puis le repository devra l'insérer dans `todo_items.project_id`.

// **Petit détail :** dans le code ci-dessus, lorsqu'il y a des projets, le premier est sélectionné automatiquement. Si tu préfères afficher `Sélectionner un projet...` par défaut et obliger l'utilisateur à choisir, je peux te faire cette variante.
