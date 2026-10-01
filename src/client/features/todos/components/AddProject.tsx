import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';

import { projectApi } from '../api/projectApi';
import React from 'react';

interface AddProjectProps {
  open: boolean;
  handleClose: () => void;
  onCreated?: () => void | Promise<void>;
}

export default function AddProject({
  open,
  handleClose,
  onCreated,
}: AddProjectProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setError(null);
  };

  const handleCloseDialog = () => {
    if (loading) {
      return;
    }

    resetForm();
    handleClose();
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(
        'Le nom du projet est obligatoire.',
      );
      return;
    }

    if (trimmedName.length > 255) {
      setError(
        'Le nom du projet ne peut pas dépasser 255 caractères.',
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await projectApi.create(trimmedName);
      resetForm();
      handleClose();

      await onCreated?.();
    } catch (error) {
      console.error(
        'Failed to create project:',
        error,
      );

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          'Impossible de créer le projet.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    if (!loading) {
      void handleSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleCloseDialog}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        Créer un projet
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              mt: 1,
            }}
          >
            {error}
          </Alert>
        )}

        <TextField
          autoFocus
          fullWidth
          label="Nom du projet"
          placeholder="Mon projet"
          value={name}
          disabled={loading}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          inputProps={{
            maxLength: 255,
          }}
          sx={{ mt: 1 }}
        />
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleCloseDialog}
          disabled={loading}
        >
          Annuler
        </Button>

        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={
            loading || !name.trim()
          }
        >
          {loading && (
            <CircularProgress
              size={18}
              sx={{ mr: 1 }}
            />
          )}

          Créer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
