import React, { useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';

import '../features/todos/todos.css';

import AddItem from '../features/todos/components/AddItem';
import AddProject from '../features/todos/components/AddProject';
import UnassignedTasks from '../features/todos/components/UnassignedTasks';

import { itemsApi } from '../features/todos/api/itemsApi';
import { projectsApi } from '../features/todos/api/projectApi';

import { useTasks } from '../features/todos/useTasks';

import { errorMessage } from '../lib/http';
import { Project, TaskStatus } from '../../types';
import ProjectTable from '../features/todos/components/ProjectTable';
import { useAuth } from '../features/auth/AuthProvider';

type DraggedTask = {
  id: string;
  status: TaskStatus;
};

const columns: {
  id: TaskStatus;
  title: string;
}[] = [
    {
      id: 'todo',
      title: 'Todo',
    },
    {
      id: 'in_progress',
      title: 'In progress',
    },
    {
      id: 'done',
      title: 'Done',
    },
  ];

export default function TodosPage() {
  const {
    items,
    unassigned,
    loading,
    pending,
    error,
    refresh,
    mutate,
  } = useTasks();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [openProject, setOpenProject] = useState(false);

  const [search, setSearch] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] =
    useState(false);

  const [projectsError, setProjectsError] = useState('');

  const [draggedTask, setDraggedTask] =
    useState<DraggedTask | null>(null);

  const [dragOverColumn, setDragOverColumn] =
    useState<TaskStatus | null>(null);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleOpenProject = () => {
    setOpenProject(true);
  };

  const handleCloseProject = () => {
    setOpenProject(false);
  };

  /**
   * Charge les projets.
   */
  const loadProjects = async () => {
    try {
      const data = await projectsApi.getAll();
      const myProjects = data.filter((project) =>
        project.usersEmail?.some((email) => email.toLowerCase() === user?.email.toLowerCase()));
      setProjects(myProjects);
    } catch (cause) {
      console.error(cause);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  /**
   * Permet de retrouver le nom du projet
   * à partir du projectId de la tâche.
   */
  const getProjectName = (
    projectId: string | null | undefined
  ) => {
    if (!projectId) {
      return 'No project';
    }

    const project = projects.find(
      (project) => project.id === projectId
    );

    return project?.name ?? 'Unknown project';
  };

  /**
   * Recherche.
   */
  const filteredItems = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    if (!normalizedSearch) {
      return items;
    }

    return items.filter((item) => {
      const taskName =
        item.name?.toLowerCase() ?? '';

      const projectName =
        getProjectName(item.projectId).toLowerCase();

      return (
        taskName.includes(normalizedSearch) ||
        projectName.includes(normalizedSearch)
      );
    });
  }, [items, search, projects]);

  /**
   * Regroupe les tâches par colonne.
   */
  const tasksByStatus = useMemo(() => {
    const result: Record<
      TaskStatus,
      typeof filteredItems
    > = {
      todo: [],
      in_progress: [],
      done: [],
    };

    filteredItems.forEach((item) => {
      const status =
        (item.status as TaskStatus) ?? 'todo';

      if (status in result) {
        result[status].push(item);
      } else {
        result.todo.push(item);
      }
    });

    return result;
  }, [filteredItems]);

  /**
   * Drag & Drop
   */
  const handleDragStart = (
    event: React.DragEvent,
    task: {
      id: string;
      status?: TaskStatus;
    }
  ) => {
    const data: DraggedTask = {
      id: task.id,
      status: task.status ?? 'todo',
    };

    setDraggedTask(data);

    event.dataTransfer.effectAllowed = 'move';

    event.dataTransfer.setData(
      'text/plain',
      task.id
    );
  };

  const handleDragOver = (
    event: React.DragEvent,
    status: TaskStatus
  ) => {
    event.preventDefault();

    event.dataTransfer.dropEffect = 'move';

    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (
    event: React.DragEvent,
    targetStatus: TaskStatus
  ) => {
    event.preventDefault();

    setDragOverColumn(null);

    if (!draggedTask) {
      return;
    }

    if (draggedTask.status === targetStatus) {
      setDraggedTask(null);
      return;
    }

    try {
      await mutate(() =>
        itemsApi.updateStatus(
          draggedTask.id,
          targetStatus
        )
      );
    } catch (cause) {
      console.error(
        'Unable to update task status',
        cause
      );
    } finally {
      setDraggedTask(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  /**
   * Supprime une tâche.
   */
  const handleDeleteItem = (id: string) => {
    void mutate(() =>
      itemsApi.remove(id)
    );
  };

  /**
   * Change le statut via la checkbox.
   */
  const handleCheckboxChange = (
    id: string
  ) => {
    const item = items.find(
      (item) => item.id === id
    );

    if (!item) {
      return;
    }

    const newCompleted = !item.completed;

    const newStatus: TaskStatus =
      newCompleted
        ? 'done'
        : 'todo';

    void mutate(async () => {
      await itemsApi.setCompleted(
        item.id,
        newCompleted
      );

      await itemsApi.updateStatus(
        item.id,
        newStatus
      );
    });
  };

  /**
   * Après création d'un projet :
   * - refresh des tâches
   * - refresh des projets
   */
  const handleProjectCreated = () => {
    void refresh();
    void loadProjects();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        p: 3,
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 1600,
          mx: 'auto',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: {
              xs: 'stretch',
              md: 'center',
            },
            justifyContent: 'space-between',
            gap: 2,
            mb: 3,
            flexDirection: {
              xs: 'column',
              md: 'row',
            },
          }}
        >
          <Box>
            <Typography
              variant="h5"
              fontWeight={700}
            >
              My tasks
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              Organize your work
              visually.
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Button
              onClick={handleOpen}
              variant="contained"
              startIcon={<AddIcon />}
            >
              Add task
            </Button>

            <Button
              onClick={handleOpenProject}
              variant="outlined"
              startIcon={<AddIcon />}
            >
              Add project
            </Button>
          </Box>
        </Box>

        {/* Modals */}
        <AddProject
          open={openProject}
          handleClose={handleCloseProject}
          onCreated={handleProjectCreated}
        />

        <AddItem
          projects={projects}
          open={open}
          handleClose={handleClose}
          onCreated={refresh}
        />

        {/* Errors */}
        {error && (
          <Alert
            severity="error"
            action={
              <Button onClick={refresh}>
                Retry
              </Button>
            }
            sx={{ mb: 2 }}
          >
            {error}
          </Alert>
        )}

        {projectsError && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
          >
            Impossible de charger les projets :{' '}
            {projectsError}
          </Alert>
        )}

        {/* Search */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 3,
          }}
        >
          <TextField
            label="Search tasks"
            variant="outlined"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            size="small"
            sx={{
              width: {
                xs: '100%',
                sm: 350,
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
          />

          {(loading ||
            projectsLoading) && (
              <CircularProgress
                size={24}
                aria-label="Loading"
              />
            )}
        </Box>

        {/* Kanban */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            width: '100%',
            overflowX: 'auto',
            pb: 2,
          }}
        >
          {columns.map((column) => {
            const columnTasks = tasksByStatus[column.id];

            const isDragOver = dragOverColumn === column.id;

            const searchValue = search.trim().toLowerCase();

            const filteredColumnTasks = columnTasks.filter((task) => {
              if (!searchValue) {
                return true;
              }

              return task.name?.toLowerCase().includes(searchValue);
            });

            const sortedColumnTasks = [...filteredColumnTasks].sort(
              (a, b) => {
                const priorityOrder: Record<string, number> = {
                  high: 0,
                  medium: 1,
                  low: 2,
                };

                return (
                  (priorityOrder[a.priorisation] ?? 3) -
                  (priorityOrder[b.priorisation] ?? 3)
                );
              }
            );


            return (
              <Paper
                key={column.id}
                elevation={0}
                onDragOver={(event) =>
                  handleDragOver(event, column.id)
                }
                onDragLeave={handleDragLeave}
                onDrop={(event) =>
                  void handleDrop(event, column.id)
                }
                sx={{
                  flex: '1 1 0',
                  minWidth: 320,
                  maxWidth: 520,
                  minHeight: 550,
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: isDragOver
                    ? 'primary.main'
                    : 'divider',
                  backgroundColor: isDragOver
                    ? 'action.hover'
                    : 'background.default',
                  transition:
                    'border-color 0.15s, background-color 0.15s',
                }}
              >
                {/* Column header */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 1.5,
                    px: 0.5,
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    fontWeight={700}
                  >
                    {column.title}
                  </Typography>

                  <Chip
                    size="small"
                    label={columnTasks.length}
                  />
                </Box>

                {/* Cards */}
                <Stack spacing={1.5}>
                  {sortedColumnTasks.map((row) => (
                    <Card
                      key={row.id}
                      draggable
                      onDragStart={(event) =>
                        handleDragStart(event, {
                          id: row.id,
                          status:
                            (row.status as TaskStatus) ??
                            'todo',
                        })
                      }
                      onDragEnd={handleDragEnd}
                      sx={{
                        cursor: 'grab',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        transition:
                          'box-shadow 0.15s, transform 0.15s',
                        '&:hover': {
                          boxShadow: 3,
                        },
                        '&:active': {
                          cursor: 'grabbing',
                        },
                        opacity:
                          draggedTask?.id === row.id
                            ? 0.5
                            : 1,
                      }}
                    >
                      <CardContent
                        sx={{
                          '&:last-child': {
                            pb: 2,
                          },
                        }}
                      >
                        {/* Task name + delete */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            fontWeight={600}
                            sx={{
                              wordBreak: 'break-word',
                            }}
                          >
                            {row.name ||
                              'Untitled task'}
                          </Typography>

                          <IconButton
                            size="small"
                            disabled={
                              loading || pending
                            }
                            aria-label={`Delete ${row.name}`}
                            onClick={() =>
                              handleDeleteItem(
                                row.id
                              )
                            }
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>

                        {/* Project */}
                        <Tooltip title="Project">
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              mt: 1,
                              mb: 1,
                              display: 'inline-block',
                            }}
                          >
                            {getProjectName(
                              row.projectId
                            )}
                          </Typography>
                        </Tooltip>

                        {/* Metadata */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Tooltip title="Priorisation">
                            <Chip
                              size="medium"
                              label={row.priorisation}
                              color={
                                row.priorisation ===
                                  'high'
                                  ? 'error'
                                  : row.priorisation ===
                                    'medium'
                                    ? 'warning'
                                    : 'success'
                              }
                            />
                          </Tooltip>

                          <Tooltip title="Deadline">
                            <Chip
                              size="medium"
                              variant="outlined"
                              label={
                                row.deadline
                                  ? new Date(
                                    row.deadline
                                  ).toLocaleDateString(
                                    'fr-FR'
                                  )
                                  : 'No deadline'
                              }
                            />
                          </Tooltip>

                          <Tooltip title="User email">
                            <Chip
                              size="medium"
                              variant="outlined"
                              label={row.userId}
                            />
                          </Tooltip>

                        </Box>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Empty column */}
                  {columnTasks.length === 0 && (
                    <Box
                      sx={{
                        minHeight: 120,
                        border: '1px dashed',
                        borderColor: isDragOver
                          ? 'primary.main'
                          : 'divider',
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 2,
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        textAlign="center"
                      >
                        Drop a task here
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Box>

        <Box>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{
              mt: 2,
            }}
          >
            Your Projects
          </Typography>
          <ProjectTable
            projects={projects}
            onUpdated={loadProjects}
          />
        </Box>

        {/* Unassigned tasks */}
        {!loading && (
          <Box sx={{ mt: 4 }}>
            <UnassignedTasks
              tasks={unassigned}
              disabled={pending}
              onClaim={(id) => {
                void mutate(() =>
                  itemsApi.claim(id)
                );
              }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
