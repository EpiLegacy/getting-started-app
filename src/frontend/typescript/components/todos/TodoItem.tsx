import React from 'react';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { IconButton, Paper, Stack, Typography } from '@mui/material';
import type { Item } from '../../types';

interface TodoItemProps {
    item: Item;
    onItemUpdate: (item: Item) => void;
    onItemRemoval: (item: Item) => void;
}

export function TodoItem({ item, onItemUpdate, onItemRemoval }: TodoItemProps) {
    const toggleCompletion = () => {
        fetch(`/items/${item.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: item.name,
                completed: !item.completed,
            }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then(response => response.json())
            .then(onItemUpdate);
    };

    const removeItem = () => {
        fetch(`/items/${item.id}`, { method: 'DELETE' }).then(() =>
            onItemRemoval(item),
        );
    };

    return (
        <Paper elevation={2} sx={{ p: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton
                    color="primary"
                    onClick={toggleCompletion}
                    aria-label={
                        item.completed
                            ? 'Mark item as incomplete'
                            : 'Mark item as complete'
                    }
                >
                    {item.completed ? (
                        <CheckBoxIcon />
                    ) : (
                        <CheckBoxOutlineBlankIcon />
                    )}
                </IconButton>
                <Typography
                    flex={1}
                    sx={{
                        overflowWrap: 'anywhere',
                        textDecoration: item.completed ? 'line-through' : 'none',
                        color: item.completed ? 'text.secondary' : 'text.primary',
                    }}
                >
                    {item.name}
                </Typography>
                <IconButton
                    color="error"
                    onClick={removeItem}
                    aria-label="Remove item"
                >
                    <DeleteOutlineIcon />
                </IconButton>
            </Stack>
        </Paper>
    );
}
