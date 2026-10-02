import React, { useState } from 'react';
import { Alert, Button, List, ListItem, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { Task } from '../../../../modules/tasks/types';
import type { Project } from '../api/projectApi';

interface Props {
    tasks: Task[];
    projects: Project[];
    disabled: boolean;
    onClaim(id: string, projectId: string, userId: string): void;
}

function Assignment({ task, projects, disabled, onClaim }: Omit<Props, 'tasks'> & { task: Task }) {
    const [projectId, setProjectId] = useState(task.projectId ?? '');
    const [userId, setUserId] = useState('');
    const project = projects.find(candidate => candidate.id === projectId);
    const validUser = project?.members.some(member => member.id === userId);
    const name = task.name || 'Untitled task';
    return (
        <ListItem sx={{ p: 2, minWidth: 0, alignItems: 'flex-start', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Stack spacing={1.5} sx={{ width: '100%', minWidth: 0 }}>
                <Typography component="h3" variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>{name}</Typography>
                <Alert severity="warning">
                    {task.projectId ? 'This task has a project but no assigned user.' :
                        task.userId ? 'This task has an assigned user but no project.' :
                            'This task has no project or assigned user.'}
                </Alert>
                <TextField select size="small" label={`Project for ${name}`} value={projectId}
                    disabled={disabled || Boolean(task.projectId)}
                    onChange={event => { setProjectId(event.target.value); setUserId(''); }}>
                    {projects.filter(candidate => !task.projectId || candidate.id === task.projectId)
                        .map(candidate => <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>)}
                </TextField>
                <TextField select size="small" label={`Assign ${name} to`} value={validUser ? userId : ''}
                    disabled={disabled || !project} onChange={event => setUserId(event.target.value)}>
                    {(project?.members ?? []).map(member =>
                        <MenuItem key={member.id} value={member.id}>{member.email}</MenuItem>)}
                </TextField>
                <Button variant="outlined" disabled={disabled || !project || !validUser}
                    onClick={() => onClaim(task.id, projectId, userId)}>Save assignment</Button>
            </Stack>
        </ListItem>
    );
}

export default function UnassignedTasks({ tasks, ...props }: Props) {
    return (
        <Paper component="section" aria-labelledby="unassigned-heading" sx={{ p: 3, mb: 4 }}>
            <Typography id="unassigned-heading" component="h2" variant="h5">
                Tasks needing attention ({tasks.length})
            </Typography>
            <Typography sx={{ mt: 1 }}>Choose a project, then assign the task to a member of that project.</Typography>
            {tasks.length > 0 && props.projects.length === 0 &&
                <Alert severity="info" sx={{ mt: 2 }}>Create a project before assigning these tasks.</Alert>}
            {tasks.length === 0 ? <Typography sx={{ mt: 2 }}>No tasks need attention.</Typography> :
                <List sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 2, mt: 2, p: 0 }}>{tasks.map(task =>
                    <Assignment key={`${task.id}-${task.projectId ?? ''}`} task={task} {...props} />)}</List>}
        </Paper>
    );
}
