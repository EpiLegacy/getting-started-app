import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
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
  const [priorisation, setPriorisation] = useState<Priority>('medium');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(false);
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

        const result = await projectApi.list();

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
        'Choose a project.',
      );
      return;
    }

    if (!assigneeId) {
      setError(
        'Choose who the task is assigned to.',
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
        status: "todo",
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

  // A MUI Dialog rather than a bare Modal: it is announced as a dialog, named
  // by its title, keeps the focus inside and fits narrow screens (RGAA 7.1,
  // 10.11).
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : handleCancel}
      aria-labelledby="add-item-title"
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit}>
      <DialogTitle id="add-item-title">Add a task</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            All fields are required.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            name="name"
            label="Name"
            required
            fullWidth
            autoFocus
            value={name}
            onChange={event => setName(event.target.value)}
            disabled={busy}
          />
          <TextField
            name="deadline"
            label="Deadline"
            type="date"
            required
            fullWidth
            value={deadline}
            onChange={event => setDeadline(event.target.value)}
            disabled={busy}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            name="priorisation"
            label="Priority"
            select
            value={priorisation}
            onChange={event => setPriorisation(event.target.value as Priority)}
            required
            fullWidth
            disabled={busy}
          >
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="low">Low</MenuItem>
          </TextField>
          <TextField
            name="project"
            label="Project"
            select
            required
            fullWidth
            value={projectId}
            disabled={busy || projectsLoading}
            onChange={event => setProjectId(event.target.value)}
            helperText={!projectsLoading && projects.length === 0 ? 'Create a project first.' : undefined}
          >
            {projects.length === 0 && <MenuItem value="" disabled>No project yet</MenuItem>}
            {projects.map(project => (
              <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            name="assignee"
            label="Assigned to"
            select
            required
            fullWidth
            value={assigneeId}
            disabled={busy || projectsLoading || !selectedProject || selectedProject.members.length === 0}
            onChange={event => setAssigneeId(event.target.value)}
          >
            {!selectedProject || selectedProject.members.length === 0
              ? <MenuItem value="" disabled>No member yet</MenuItem>
              : selectedProject.members.map(member => (
                <MenuItem key={member.id} value={member.id}>{member.email}</MenuItem>
              ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} type="button" onClick={handleCancel}>Cancel</Button>
        <Button
          disabled={busy || projectsLoading || projects.length === 0 || !projectId || !assigneeId}
          type="submit"
          variant="contained"
        >
          {busy ? 'Adding…' : 'Add task'}
        </Button>
      </DialogActions>
      </form>
    </Dialog>
  );
}
