import React, { useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Chip,
  Modal,
  TextField,
  Typography,
} from '@mui/material';

import { errorMessage } from '../../../lib/http';
import { projectsApi } from '../api/projectApi';
import { useAuth } from '../../auth/AuthProvider';

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
  const { user } = useAuth();
  const [name, setName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [usersEmail, setUsersEmail] = useState<string[]>([]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAddUser = () => {
    const email = userEmail.trim();

    if (!email) {
      return;
    }

    // Évite les doublons
    if (usersEmail.includes(email)) {
      setError('Cet utilisateur a déjà été ajouté.');
      return;
    }

    // Vérification simple de l'email
    if (!email.includes('@')) {
      setError('Veuillez entrer une adresse email valide.');
      return;
    }

    setUsersEmail((current) => [...current, email]);
    setUserEmail('');
    setError('');
  };

  const handleRemoveUser = (emailToRemove: string) => {
    setUsersEmail((current) =>
      current.filter((email) => email !== emailToRemove)
    );
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setBusy(true);
    setError('');

    try {
      const emails = user?.email
        ? usersEmail.includes(user.email)
          ? usersEmail
          : [user.email, ...usersEmail]
        : usersEmail;

      await projectsApi.create(name, emails);

      setName('');
      setUserEmail('');
      setUsersEmail([]);

      onCreated();
      handleClose();
    } catch (cause) {
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
          disabled={busy}
        />

        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            name="userEmail"
            label="Email de l'utilisateur"
            type="email"
            variant="outlined"
            fullWidth
            value={userEmail}
            onChange={(event) => setUserEmail(event.target.value)}
            placeholder="utilisateur@example.com"
            disabled={busy}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddUser();
              }
            }}
          />

          <Button
            type="button"
            variant="outlined"
            onClick={handleAddUser}
            disabled={busy || !userEmail.trim()}
          >
            Ajouter
          </Button>
        </Box>

        {usersEmail.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            {usersEmail.map((email) => (
              <Chip
                key={email}
                label={email}
                onDelete={() => handleRemoveUser(email)}
                disabled={busy}
              />
            ))}
          </Box>
        )}

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
