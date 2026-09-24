import React from 'react';
import { Alert, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { Link } from 'react-router';
import { useTasks } from '../features/todos/useTasks';

export default function HomePage() {
  const { items, unassigned, loading, error, refresh } = useTasks();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dueToday = items.filter(item => item.deadline === today && !item.completed);
  const unresolvedCount = items.filter(item => !item.completed).length;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
      <Stack spacing={4}>
        <Box>
          <Typography component="h1" variant="h3" fontWeight={700} gutterBottom>Welcome back!</Typography>
          <Typography color="text.secondary" variant="h6">Here’s a quick look at your tasks today.</Typography>
        </Box>
        {error && <Alert severity="error" action={<Button onClick={refresh}>Retry</Button>}>{error}</Alert>}
        {loading ? <Typography role="status">Loading tasks…</Typography> : <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Paper sx={{ p: 3, flex: 2 }} elevation={2}>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <TodayOutlinedIcon color="primary" />
                <Typography component="h2" variant="h6" fontWeight={700}>Due today</Typography>
              </Stack>
              <Stack spacing={1.5}>
                {dueToday.length ? dueToday.map(item => <Typography key={item.id}>{item.name || 'Untitled task'}</Typography>) :
                  <Typography>No open tasks due today.</Typography>}
              </Stack>
            </Paper>
            <Paper sx={{ p: 3, flex: 1 }} elevation={2}>
              <Typography color="text.secondary" gutterBottom>Unresolved tasks</Typography>
              <Typography variant="h3" fontWeight={700} color="primary">
                {unresolvedCount}
                <Typography component="span" variant="h6" color="text.secondary"> of {items.length}</Typography>
              </Typography>
              <Button component={Link} to="/todos" variant="outlined" sx={{ mt: 3 }}>View my tasks</Button>
            </Paper>
          </Stack>
          {unassigned.length > 0 && <Alert severity="info" action={<Button component={Link} to="/todos">View tasks</Button>}>
            {unassigned.length} unassigned {unassigned.length === 1 ? 'task is' : 'tasks are'} available to claim.
          </Alert>}
        </>}
      </Stack>
    </Container>
  );
}
