import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Modal,
  TextField,
  Typography,
} from '@mui/material';

import { itemsApi } from '../api/itemsApi';
import { projectApi, type Project } from '../api/projectApi';
import { errorMessage } from '../../../lib/http';
import type { Priority } from '../../../../types';

interface AddItemProps {
  open: boolean;
  handleClose: () => void;
  onCreated: () => void;
}

export default function AddItem({
  open,
  handleClose,
  onCreated,
}: AddItemProps) {
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priorisation, setPriorisation] =
    useState<Priority>('medium');

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const [projectsLoading, setProjectsLoading] =
    useState(false);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedProject =
    projects.find(
      project => project.id === projectId,
    ) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      try {
        setProjectsLoading(true);
        setError('');

        const result =
          await projectApi.list();

        if (cancelled) {
          return;
        }

        setProjects(result);

        if (result.length > 0) {
          setProjectId(result[0].id);

          if (result[0].members.length > 0) {
            setAssigneeId(
              result[0].members[0].id,
            );
          }
        } else {
          setProjectId('');
          setAssigneeId('');
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            errorMessage(cause),
          );
        }
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [open]);


  useEffect(() => {
    if (!selectedProject) {
      setAssigneeId('');
      return;
    }

    const currentAssigneeExists =
      selectedProject.members.some(
        member =>
          member.id === assigneeId,
      );

    if (!currentAssigneeExists) {
      setAssigneeId(
        selectedProject.members[0]?.id ?? '',
      );
    }
  }, [selectedProject, assigneeId]);

  const resetForm = () => {
    setName('');
    setDeadline('');
    setPriorisation('medium');
    setProjects([]);
    setProjectId('');
    setAssigneeId('');
    setError('');
  };

  const handleCancel = () => {
    if (busy) {
      return;
    }

    resetForm();
    handleClose();
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!projectId) {
      setError(
        'Veuillez sélectionner un projet.',
      );
      return;
    }

    if (!assigneeId) {
      setError(
        'Veuillez sélectionner un utilisateur.',
      );
      return;
    }

    setBusy(true);
    setError('');

    try {
      const task = await itemsApi.create({
        completed: false,
        name,
        deadline,
        priorisation,
      });

      await projectApi.addItem(
        projectId,
        Number(task.id),
        assigneeId,
      );

      resetForm();
      onCreated();
      handleClose();
    } catch (cause) {
      setError(
        errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={
        busy
          ? undefined
          : handleCancel
      }
      aria-labelledby="modal-modal-title"
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform:
            'translate(-50%, -50%)',
          width: 400,
          maxWidth: 'calc(100vw - 32px)',
          bgcolor:
            'background.paper',
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

        <TextField
          name="name"
          label="Nom"
          variant="outlined"
          required
          fullWidth
          value={name}
          onChange={event =>
            setName(
              event.target.value,
            )
          }
          disabled={busy}
        />

        <TextField
          name="deadline"
          label="Deadline"
          type="date"
          variant="outlined"
          required
          fullWidth
          value={deadline}
          onChange={event =>
            setDeadline(
              event.target.value,
            )
          }
          disabled={busy}
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
          onChange={event =>
            setPriorisation(
              event.target.value as Priority,
            )
          }
          required
          fullWidth
          disabled={busy}
        >
          <MenuItem value="high">
            High
          </MenuItem>

          <MenuItem value="medium">
            Medium
          </MenuItem>

          <MenuItem value="low">
            Low
          </MenuItem>
        </TextField>

        <TextField
          name="project"
          label="Projet"
          select
          required
          fullWidth
          value={projectId}
          disabled={
            busy ||
            projectsLoading
          }
          onChange={event =>
            setProjectId(
              event.target.value,
            )
          }
        >
          {projects.length === 0 && (
            <MenuItem
              value=""
              disabled
            >
              Aucun projet disponible
            </MenuItem>
          )}

          {projects.map(project => (
            <MenuItem
              key={project.id}
              value={project.id}
            >
              {project.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          name="assignee"
          label="Attribuer à"
          select
          required
          fullWidth
          value={assigneeId}
          disabled={
            busy ||
            projectsLoading ||
            !selectedProject ||
            selectedProject.members
              .length === 0
          }
          onChange={event =>
            setAssigneeId(
              event.target.value,
            )
          }
        >
          {!selectedProject ||
            selectedProject.members.length ===
            0 ? (
            <MenuItem
              value=""
              disabled
            >
              Aucun membre disponible
            </MenuItem>
          ) : (
            selectedProject.members.map(
              member => (
                <MenuItem
                  key={member.id}
                  value={member.id}
                >
                  {member.email}
                </MenuItem>
              ),
            )
          )}
        </TextField>

        <Box
          sx={{
            display: 'flex',
            justifyContent:
              'flex-end',
            gap: 1,
            mt: 1,
          }}
        >
          <Button
            disabled={busy}
            type="button"
            variant="outlined"
            onClick={
              handleCancel
            }
          >
            Annuler
          </Button>

          <Button
            disabled={
              busy ||
              projectsLoading ||
              projects.length === 0 ||
              !projectId ||
              !assigneeId
            }
            type="submit"
            variant="contained"
          >
            {busy
              ? 'Ajout...'
              : 'Ajouter'}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}