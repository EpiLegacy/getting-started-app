import React from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import type { Item } from '../../types';
import { AddItemForm } from './AddItemForm';
import { TodoItem } from './TodoItem';

export function TodoList() {
    const [items, setItems] = React.useState<Item[] | null>(null);

    React.useEffect(() => {
        fetch('/items')
            .then(response => response.json())
            .then(setItems);
    }, []);

    const onNewItem = React.useCallback((newItem: Item) => {
        setItems(currentItems => [...(currentItems ?? []), newItem]);
    }, []);

    const onItemUpdate = React.useCallback((item: Item) => {
        setItems(currentItems =>
            currentItems?.map(currentItem =>
                currentItem.id === item.id ? item : currentItem,
            ) ?? [],
        );
    }, []);

    const onItemRemoval = React.useCallback((item: Item) => {
        setItems(currentItems =>
            currentItems?.filter(currentItem => currentItem.id !== item.id) ?? [],
        );
    }, []);

    if (items === null) {
        return (
            <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress aria-label="Loading items" />
            </Box>
        );
    }

    return (
        <Stack spacing={2}>
            <AddItemForm onNewItem={onNewItem} />
            {items.length === 0 && (
                <Typography color="text.secondary" textAlign="center" py={4}>
                    No items yet! Add one above!
                </Typography>
            )}
            {items.map(item => (
                <TodoItem
                    item={item}
                    key={item.id}
                    onItemUpdate={onItemUpdate}
                    onItemRemoval={onItemRemoval}
                />
            ))}
        </Stack>
    );
}
