import React, { useState } from 'react';
import { Box, Button, MenuItem, Modal, TextField, Typography } from '@mui/material';
import { itemsApi } from '../api/itemsApi';
import type { Priority, Item } from '../../../../types';

interface AddItemProps {
  open: boolean;
  handleClose: () => void;
  refresh: boolean;
  setRefresh: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function AddItem({ open, handleClose, refresh, setRefresh }: AddItemProps) {
  const [name, setName] = useState<string>('');
  const [deadline, setDeadline] = useState<string>('');
  const [priorisation, setPriorisation] = useState<Priority>('medium');

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const item: Item = {
      id: name,
      completed: false,
      name,
      deadline,
      priorisation,
    };

    itemsApi
      .create(item)
      .then();

    setName('');
    setDeadline('');
    setPriorisation('medium');
    setRefresh(!refresh);
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
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
          onChange={(event) =>
            setDeadline(event.target.value)
          }
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

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            mt: 1,
          }}
        >
          <Button
            type="button"
            variant="outlined"
            onClick={handleClose}
          >
            Annuler
          </Button>

          <Button
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

