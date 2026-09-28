import React, { useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Modal,
  TextField,
  Typography,
} from '@mui/material';

import { errorMessage } from '../../../lib/http';
import { projectsApi } from '../api/projectApi';

interface AddProjectProps {
  open: boolean;
  handleClose: () => void;
  onCreated: () => void;
}

export default function AddProject({
  open,
  handleClose,
  onCreated,
}: AddProjectProps) {
  const [name, setName] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setBusy(true);
    setError('');

    try {
      const res = await projectsApi.create(name);
      setName('');
      onCreated();
      handleClose();
    } catch (cause) {
      console.error(cause);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : handleClose}
      aria-labelledby="add-project-modal-title"
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
          id="add-project-modal-title"
          variant="h6"
          component="h2"
        >
          Créer un projet
        </Typography>

        {error && (
          <Alert severity="error">
            {error}
          </Alert>
        )}

        <TextField
          name="name"
          label="Nom du projet"
          variant="outlined"
          required
          fullWidth
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />

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
            disabled={busy}
            type="submit"
            variant="contained"
          >
            Créer
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}
