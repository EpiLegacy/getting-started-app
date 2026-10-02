import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import React from 'react';
import UnassignedTasks from '../features/todos/components/UnassignedTasks';
import AddProject from '../features/todos/components/AddProject';
import AddItem from '../features/todos/components/AddItem';
import { useTasks } from '../features/todos/useTasks';
import { Project, projectApi } from '../features/todos/api/projectApi';
import { TaskStatus } from '../../types';
import { itemsApi } from '../features/todos/api/itemsApi';
import { TaskForUser } from '../../modules/tasks/types';
import { visuallyHidden } from '../lib/visuallyHidden';

const kanbanColumns: {
  id: TaskStatus;
  title: string;
}[] = [
    { id: 'todo', title: 'Todo' },
    { id: 'inProgress', title: 'In progress' },
    { id: 'completed', title: 'Completed' },
  ];

const columnTitle = (status: TaskStatus) =>
  kanbanColumns.find(column => column.id === status)?.title ?? status;

export default function TodosPage() {
  const {
    items,
    unassigned,
    pending,
    mutate,
    loading,
    error,
    refresh,
    itemsForUser,
  } = useTasks();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [memberProject, setMemberProject] = useState<Project | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortDirection, _] = useState<'asc' | 'desc'>('asc');
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  // RGAA 7.5: the outcome of a move or a deletion is announced, not only shown.
  const [announcement, setAnnouncement] = useState('');

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      setProjectsError(null);

      const data = await projectApi.list();

      setProjects(data);
    } catch (err) {
      console.error(
        'Failed to load projects:',
        err,
      );

      setProjectsError(
        'Could not load the projects.',
      );
    } finally {
      setProjectsLoading(false);
    }
  };


  useEffect(() => {
    void loadProjects();
  }, []);

  const handleProjectCreated = async () => {
    setProjectOpen(false);
    await loadProjects();
  };

  const handleAddMember = async () => {
    if (!memberProject) {
      return;
    }

    const email =
      memberEmail.trim().toLowerCase();

    if (!email) {
      setMemberError(
        'Enter an e-mail address.',
      );
      return;
    }

    try {
      setMemberLoading(true);
      setMemberError(null);

      const members =
        await projectApi.addMember(
          memberProject.id,
          email,
        );

      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === memberProject.id
            ? {
              ...project,
              members,
            }
            : project,
        ),
      );
      setMemberProject((current) =>
        current
          ? {
            ...current,
            members,
          }
          : null,
      );
      setMemberEmail('');
    } catch (err) {
      console.error(
        'Failed to add a member:',
        err,
      );

      setMemberError(
        'Could not add this member. Check the e-mail address.',
      );
    } finally {
      setMemberLoading(false);
    }
  };

  const handleDeleteProject = async (
    projectId: string,
  ) => {
    try {
      setDeleteProjectLoading(projectId);

      await projectApi.remove(projectId);

      const deleted = projects.find(project => project.id === projectId);
      setProjects((currentProjects) =>
        currentProjects.filter(
          (project) =>
            project.id !== projectId,
        ),
      );
      setAnnouncement(`Project ${deleted?.name ?? ''} deleted.`);
      refresh();

      if (
        memberProject?.id === projectId
      ) {
        setMemberProject(null);
        setMemberEmail('');
        setMemberError(null);
      }
    } catch (err) {
      console.error(
        'Failed to delete the project:',
        err,
      );
      setAnnouncement('Could not delete the project.');
    } finally {
      setDeleteProjectLoading(null);
    }
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    const filtered = itemsForUser.filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        item.name
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        String(item.id)
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });

    return [...filtered].sort((a, b) => {
      const priorityOrder = {
        high: 3,
        medium: 2,
        low: 1,
      };

      const valueA = priorityOrder[a.priorisation ?? 'low'];
      const valueB = priorityOrder[b.priorisation ?? 'low'];

      if (valueA > valueB) {
        return sortDirection === 'asc' ? -1 : 1;
      }

      if (valueA < valueB) {
        return sortDirection === 'asc' ? 1 : -1;
      }

      return 0;
    });
  }, [itemsForUser, search, sortDirection, taskStatuses, projects, items]);

  const getTaskStatus = (item: TaskForUser): TaskStatus => {
    if (item.status === 'inProgress') {
      return 'inProgress';
    }

    if (item.status === 'completed') {
      return 'completed';
    }

    if (item.status === 'todo') {
      return 'todo';
    }

    return 'todo';
  };

  const getUserEmail = (userId: string | null | undefined) => {
    if (!userId) {
      return null;
    }

    for (const project of projects) {
      const member = project.members?.find(
        (member) => member.id === userId,
      );

      if (member) {
        return member.email;
      }
    }

    return null;
  };

  const handleDeleteItem = async (id: string, name: string | null) => {
    try {
      await itemsApi.remove(id);
      setAnnouncement(`Task ${name ?? ''} deleted.`);
      refresh();
    } catch (error) {
      console.error('Failed to delete item:', error);
      setAnnouncement(`Could not delete the task ${name ?? ''}.`);
    }
  };

  // Shared by drag and drop and by the status select on each card: the select
  // is the keyboard and touch alternative to dragging (RGAA 7.1, 7.3).
  const moveTask = async (taskId: string, status: TaskStatus, name: string | null) => {
    try {
      await itemsApi.updateStatus(taskId, status);

      setTaskStatuses((current) => ({
        ...current,
        [taskId]: status,
      }));
      setAnnouncement(`Task ${name ?? ''} moved to ${columnTitle(status)}.`);
    } catch (error) {
      console.error('Failed to update task status:', error);
      setAnnouncement(`Could not move the task ${name ?? ''}.`);
    }
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    taskKey: number,
  ) => {
    const key = String(taskKey);

    setDraggedTaskId(key);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
  };

  const handleDragOver = (
    event: React.DragEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (
    event: React.DragEvent<HTMLElement>,
    status: TaskStatus,
  ) => {
    event.preventDefault();

    const taskId =
      event.dataTransfer.getData('text/plain') ||
      draggedTaskId;

    if (!taskId) {
      return;
    }

    const task = filteredItems.find(item => String(item.taskKey) === taskId);
    await moveTask(taskId, status, task?.name ?? null);

    setDraggedTaskId(null);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        p: 3,
        '& > *': {
          width: '100%',
          maxWidth: 1400,
        },
      }}
    >
      <Box role="status" aria-live="polite" sx={visuallyHidden}>
        {announcement}
      </Box>
      <Box
        sx={{
          mb: 3,
          width: '100%',
        }}
      >
        <Typography
          component="h1"
          variant="h5"
          sx={{
            mb: 2,
          }}
        >
          TODO list
        </Typography>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            width: '100%',
          }}
        >
          <TextField
            size="small"
            label="Search by name"
            type="search"
            variant="outlined"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            sx={{
              width: '40%',
            }}
          />

          <Box
            sx={{
              display: 'flex',
              gap: 1,
              ml: 'auto',
            }}
          >
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setProjectOpen(true)}
            >
              Add a project
            </Button>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpen(true)}
            >
              Add a task
            </Button>
          </Box>
        </Box>
      </Box>

      {!loading && <UnassignedTasks tasks={unassigned} projects={projects}
        disabled={pending || projectsLoading}
        onClaim={(id, projectId, userId) => void mutate(() => itemsApi.claim(id, projectId, userId))} />}

      <Box sx={{ mb: 3 }}>
        <Typography
          component="h2"
          variant="h6"
          sx={{ mb: 1 }}
        >
          My tasks
        </Typography>

        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 5,
            }}
          >
            <CircularProgress aria-label="Loading tasks" />
          </Box>
        ) : error ? (
          <Paper
            variant="outlined"
            sx={{ p: 3 }}
          >
            <Typography
              color="error"
              textAlign="center"
            >
              {error}
            </Typography>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                mt: 2,
              }}
            >
              <Button
                variant="outlined"
                onClick={() => void refresh()}
              >
                Retry
              </Button>
            </Box>
          </Paper>
        ) : (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              backgroundColor: 'background.default',
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'repeat(3, minmax(0, 1fr))',
                },
                gap: 2,
                alignItems: 'start',
              }}
            >
              {kanbanColumns.map((column) => {
                const columnItems = filteredItems.filter(
                  (item) => {
                    const status = taskStatuses[String(item.taskKey)] ?? getTaskStatus(item);
                    return status === column.id;
                  },
                );

                return (
                  <Box
                    component="section"
                    aria-labelledby={`column-${column.id}`}
                    key={column.id}
                    onDragOver={handleDragOver}
                    onDrop={(event) =>
                      handleDrop(event, column.id)
                    }
                    sx={{
                      minHeight: 420,
                      borderRadius: 2,
                      backgroundColor: 'action.hover',
                      border: '1px solid',
                      borderColor: 'divider',
                      p: 1.5,
                      transition: 'background-color 0.2s',
                      '&:hover': {
                        backgroundColor: 'action.selected',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1.5,
                        px: 0.5,
                      }}
                    >
                      <Typography
                        id={`column-${column.id}`}
                        component="h3"
                        variant="subtitle1"
                        fontWeight={700}
                      >
                        {column.title}
                        <Box component="span" sx={visuallyHidden}>
                          {` (${columnItems.length} ${columnItems.length === 1 ? 'task' : 'tasks'})`}
                        </Box>
                      </Typography>

                      <Chip
                        aria-hidden
                        size="small"
                        label={columnItems.length}
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>

                    <Box
                      component={columnItems.length === 0 ? 'div' : 'ul'}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                        listStyle: 'none',
                        m: 0,
                        p: 0,
                      }}
                    >
                      {columnItems.length === 0 ? (
                        <Box
                          sx={{
                            minHeight: 120,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px dashed',
                            borderColor: 'divider',
                            borderRadius: 2,
                          }}
                        >
                          <Typography
                            variant="body2"
                            color="text.secondary"
                          >
                            No task
                          </Typography>
                        </Box>
                      ) : (
                        columnItems.map((item) => (
                          <Paper
                            component="li"
                            key={item.id}
                            draggable
                            elevation={0}
                            onDragStart={(event) => handleDragStart(event, item.taskKey)}
                            onDragEnd={handleDragEnd}
                            sx={{
                              p: 1.5,
                              border: '1px solid',
                              borderColor:
                                draggedTaskId === String(item.taskKey)
                                  ? 'primary.main'
                                  : 'divider',
                              borderRadius: 2,
                              cursor: 'grab',
                              backgroundColor: 'background.paper',
                              opacity:
                                draggedTaskId === String(item.taskKey)
                                  ? 0.5
                                  : 1,
                              transition:
                                'transform 0.15s, box-shadow 0.15s',
                              '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: 3,
                              },
                              '&:active': {
                                cursor: 'grabbing',
                              },
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                mb: 0.5,
                              }}
                            >
                              <Typography
                                component="h4"
                                variant="subtitle2"
                                fontWeight={700}
                                sx={{
                                  wordBreak: 'break-word',
                                }}
                              >
                                {item.name}
                              </Typography>

                              <IconButton
                                size="small"
                                aria-label={`Delete the task ${item.name ?? ''}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteItem(String(item.taskKey), item.name);
                                }}
                                sx={{
                                  ml: 1,
                                  flexShrink: 0,
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>

                            <Typography
                              variant="body2"
                              sx={{
                                mb: 0.5,
                                wordBreak: 'break-word',
                                ml: 0.5,
                              }}
                            >
                              {item.projectName}
                            </Typography>

                            <Box
                              sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 0.75,
                              }}
                            >
                              {item.deadline && (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={`Due ${item.deadline}`}
                                />
                              )}
                              {item.priorisation && (
                                <Chip
                                  size="small"
                                  label={`Priority: ${item.priorisation}`}
                                  color={
                                    item.priorisation === 'high' ? 'error' :
                                      item.priorisation === 'medium' ? 'warning' : 'success'
                                  }
                                />
                              )}
                              <Chip
                                size="small"
                                variant="outlined"
                                label={`Assigned to ${getUserEmail(item.userId) ?? 'a deleted account'}`}
                              />
                            </Box>

                            <TextField
                              select
                              size="small"
                              fullWidth
                              label="Status"
                              value={taskStatuses[String(item.taskKey)] ?? getTaskStatus(item)}
                              onChange={(event) =>
                                void moveTask(String(item.taskKey), event.target.value as TaskStatus, item.name)
                              }
                              slotProps={{ htmlInput: { 'aria-label': `Status of ${item.name ?? 'task'}` } }}
                              sx={{ mt: 1.5 }}
                            >
                              {kanbanColumns.map((option) => (
                                <MenuItem key={option.id} value={option.id}>
                                  {option.title}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Paper>
                        ))
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Paper>
        )}
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography
          component="h2"
          variant="h6"
          sx={{ mb: 1 }}
        >
          My projects
        </Typography>
        {projectsLoading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 3,
            }}
          >
            <CircularProgress size={28} aria-label="Loading projects" />
          </Box>
        ) : projectsError ? (
          <Paper
            variant="outlined"
            sx={{ p: 3 }}
          >
            <Typography
              color="error"
              textAlign="center"
            >
              {projectsError}
            </Typography>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                mt: 2,
              }}
            >
              <Button
                variant="outlined"
                onClick={() =>
                  void loadProjects()
                }
              >
                Retry
              </Button>
            </Box>
          </Paper>
        ) : projects.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{ p: 3 }}
          >
            <Typography
              color="text.secondary"
              textAlign="center"
            >
              No project yet.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Project</TableCell>
                  <TableCell>Members</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {projects.map((project) => (
                  <TableRow
                    key={project.id}
                    hover
                  >
                    <TableCell>
                      <Typography fontWeight={500}>
                        {project.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {project.members &&
                        project.members.length > 0 ? (
                        <Box
                          component="ul"
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.5,
                            listStyle: 'none',
                            m: 0,
                            p: 0,
                          }}
                        >
                          {project.members.map(
                            (member) => (
                              <Typography
                                component="li"
                                key={member.id}
                                variant="body2"
                              >
                                {member.email}
                              </Typography>
                            ),
                          )}
                        </Box>
                      ) : (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          No member
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        sx={{ mr: 1 }}
                        aria-label={`Add member to ${project.name}`}
                        onClick={() => {
                          setMemberProject(project);
                          setMemberEmail('');
                          setMemberError(null);
                        }}
                      >
                        Add member
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        aria-label={`Delete the project ${project.name}`}
                        variant="outlined"
                        startIcon={
                          <DeleteIcon />
                        }
                        onClick={() => {
                          setProjectToDelete(project);
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <AddProject
        open={projectOpen}
        handleClose={() => setProjectOpen(false)}
        onCreated={() => handleProjectCreated()}
      />
      <AddItem
        open={open}
        handleClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          refresh();
        }}
      />
      <Dialog
        open={Boolean(memberProject)}
        onClose={() => {
          if (!memberLoading) {
            setMemberProject(null);
            setMemberEmail('');
            setMemberError(null);
          }
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="add-member-title"
      >
        <DialogTitle id="add-member-title">
          Add a member
        </DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            Project:{' '}
            {memberProject?.name}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Member e-mail"
            required
            type="email"
            value={memberEmail}
            onChange={(event) =>
              setMemberEmail(
                event.target.value,
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                'Enter' &&
                !memberLoading
              ) {
                event.preventDefault();
                void handleAddMember();
              }
            }}
            error={Boolean(
              memberError,
            )}
            helperText={
              memberError ?? ''
            }
            disabled={
              memberLoading
            }
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setMemberProject(
                null,
              );
              setMemberEmail('');
              setMemberError(null);
            }}
            disabled={
              memberLoading
            }
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() =>
              void handleAddMember()
            }
            disabled={
              memberLoading ||
              !memberEmail.trim()
            }
          >
            {memberLoading ? 'Adding…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(projectToDelete)}
        onClose={() =>
          setProjectToDelete(null)
        }
        fullWidth
        maxWidth="xs"
        aria-labelledby="delete-project-title"
      >
        <DialogTitle id="delete-project-title">
          Delete the project?
        </DialogTitle>

        <DialogContent>
          <Typography>
            The project{' '}
            <strong>
              {projectToDelete?.name}
            </strong>{' '}
            will be deleted for all its members.
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            This cannot be undone.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setProjectToDelete(null)
            }
            disabled={
              deleteProjectLoading !== null
            }
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={
              !projectToDelete ||
              deleteProjectLoading !== null
            }
            onClick={async () => {
              if (!projectToDelete) {
                return;
              }

              await handleDeleteProject(
                projectToDelete.id,
              );

              setProjectToDelete(null);
            }}
          >
            {deleteProjectLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box >
  );
}
