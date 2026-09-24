import React from 'react';
import { Box, Button, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import type { Task } from '../../../../modules/tasks/types';

export default function UnassignedTasks({ tasks, disabled, onClaim }: {
    tasks: Task[];
    disabled: boolean;
    onClaim(id: string): void;
}) {
    return (
        <Paper component="section" aria-labelledby="unassigned-heading" sx={{ p: 3, mt: 4 }}>
            <Typography id="unassigned-heading" component="h2" variant="h5">Unassigned tasks</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
                These tasks were created before accounts existed. Claim a task to add it to your list.
            </Typography>
            {tasks.length === 0 ? <Typography sx={{ mt: 2 }}>No unassigned tasks remain.</Typography> :
                <List>
                    {tasks.map(task => (
                        <ListItem key={task.id} divider disableGutters sx={{ gap: 2 }}>
                            <ListItemText primary={task.name || 'Untitled task'} secondary={
                                `${task.completed ? 'Completed' : 'Open'}${task.deadline ? ` · Due ${task.deadline}` : ''}`
                            } />
                            <Box sx={{ flexShrink: 0 }}>
                                <Button variant="outlined" disabled={disabled} onClick={() => onClaim(task.id)}
                                    aria-label={`Claim ${task.name || 'untitled task'}`}>Claim</Button>
                            </Box>
                        </ListItem>
                    ))}
                </List>}
        </Paper>
    );
}
