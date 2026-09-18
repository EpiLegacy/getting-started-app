import React from 'react';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

interface DashboardTodo {
    id: string;
    name: string;
    dueToday: boolean;
    completed: boolean;
}

const dashboardTodos: DashboardTodo[] = [
    { id: '1', name: 'Review the project roadmap', dueToday: true, completed: false },
    { id: '2', name: 'Prepare notes for the team sync', dueToday: true, completed: false },
    { id: '3', name: 'Reply to pending messages', dueToday: true, completed: true },
    { id: '4', name: 'Update the weekly report', dueToday: false, completed: false },
    { id: '5', name: 'Plan next week’s priorities', dueToday: false, completed: false },
    { id: '6', name: 'Organize project files', dueToday: false, completed: false },
    { id: '7', name: 'Book the monthly review', dueToday: false, completed: true },
    { id: '8', name: 'Read the product feedback', dueToday: false, completed: true },
];

export function HomePage() {
    const unresolvedCount = 0;

    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
            <Stack spacing={4}>
                <Box>
                    <Typography component="h1" variant="h3" fontWeight={700} gutterBottom>
                        Welcome back!
                    </Typography>
                    <Typography color="text.secondary" variant="h6">
                        Here’s a quick look at what needs your attention today.
                    </Typography>
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                    <Paper sx={{ p: 3, flex: 2 }} elevation={2}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                            <TodayOutlinedIcon color="primary" />
                            <Typography component="h2" variant="h6" fontWeight={700}>
                                Due today
                            </Typography>
                        </Stack>
                        <Stack spacing={1.5}>WIP</Stack>
                    </Paper>

                    <Paper sx={{ p: 3, flex: 1 }} elevation={2}>
                        <Typography color="text.secondary" gutterBottom>
                            Unresolved todos
                        </Typography>
                        <Typography variant="h3" fontWeight={700} color="primary">
                            {unresolvedCount}
                            <Typography component="span" variant="h6" color="text.secondary">
                                {' '}of {dashboardTodos.length}
                            </Typography>
                        </Typography>
                        <Typography color="text.secondary" mt={1}>
                            todos still need to be completed
                        </Typography>
                        <Button
                            component={RouterLink}
                            to="/todos"
                            variant="outlined"
                            sx={{ mt: 3 }}
                        >
                            View all todos
                        </Button>
                    </Paper>
                </Stack>
            </Stack>
        </Container>
    );
}
