import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import { Box, Button, CircularProgress, Stack, TextField } from '@mui/material';
import type { Item } from '../../types';

interface AddItemFormProps {
    onNewItem: (item: Item) => void;
}

export function AddItemForm({ onNewItem }: AddItemFormProps) {
    const [newItem, setNewItem] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);

    const submitNewItem = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        fetch('/items', {
            method: 'POST',
            body: JSON.stringify({ name: newItem }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then(response => response.json())
            .then(item => {
                onNewItem(item);
                setSubmitting(false);
                setNewItem('');
            });
    };

    return (
        <Box component="form" onSubmit={submitNewItem}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                    fullWidth
                    value={newItem}
                    onChange={event => setNewItem(event.target.value)}
                    type="text"
                    label="New item"
                    size="small"
                />
                <Button
                    type="submit"
                    variant="contained"
                    color="success"
                    disabled={!newItem.trim().length || submitting}
                    startIcon={
                        submitting ? (
                            <CircularProgress size={16} color="inherit" />
                        ) : (
                            <AddIcon />
                        )
                    }
                    sx={{ whiteSpace: 'nowrap' }}
                >
                    {submitting ? 'Adding...' : 'Add item'}
                </Button>
            </Stack>
        </Box>
    );
}
