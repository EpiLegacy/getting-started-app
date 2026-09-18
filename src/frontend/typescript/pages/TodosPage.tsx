import React from 'react';
import { Container, Typography } from '@mui/material';
import { TodoList } from '../components/todos/TodoList';

export function TodosPage() {
    return (
        <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 6 } }}>
            <Typography component="h1" variant="h4" fontWeight={700} mb={3}>
                Todo list
            </Typography>
            <TodoList />
        </Container>
    );
}
