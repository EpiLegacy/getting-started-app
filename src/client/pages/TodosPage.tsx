import React, { useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import { Task } from '../../modules/tasks/types';
import { authApi } from '../features/auth/api';

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

/**
 * Route permettant de récupérer un utilisateur
 * à partir de son ID.
 *
 * Si ton backend possède un préfixe, par exemple :
 * /api/auth/users/id/:id
 *
 * alors remplace cette constante.
 */
const USER_BY_ID_URL = '/auth/users/id';

export default function TodosPage() {
  const {
    unassigned,
    loading,
    pending,
    error,
    refresh,
    mutate,
  } = useTasks();

  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [openProject, setOpenProject] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [items, setItems] =
    useState<Task[]>([]);

  const [projectsLoading, setProjectsLoading] =
    useState(false);

  const [projectsError, setProjectsError] =
    useState('');

  const [draggedTask, setDraggedTask] =
    useState<DraggedTask | null>(null);

  const [dragOverColumn, setDragOverColumn] =
    useState<TaskStatus | null>(null);

  /**
   * Cache des emails.
   *
   * Exemple :
   *
   * {
   *   "abc123": "john@gmail.com",
   *   "def456": "alice@gmail.com"
   * }
   */
  const [userEmails, setUserEmails] =
    useState<Record<string, string>>({});

  /**
   * ============================
   * Modals
   * ============================
   */

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
   * ============================
   * Projects + Tasks
   * ============================
   */

  /**
   * Charge les projets auxquels l'utilisateur
   * connecté est rattaché ainsi que les tâches.
   */
  const loadProjects = async () => {
    if (!user?.email) {
      return;
    }

    try {
      setProjectsLoading(true);
      setProjectsError('');

      const data =
        await projectsApi.getAll();

      const taskItems =
        await itemsApi.getAllItems();

      const userEmail =
        user.email.toLowerCase();

      const myProjects =
        data.filter((project) =>
          project.usersEmail?.some(
            (email) =>
              email.toLowerCase() ===
              userEmail
          )
        );

      setItems(taskItems);
      setProjects(myProjects);
    } catch (cause) {
      console.error(cause);

      setProjectsError(
        errorMessage(cause)
      );
    } finally {
      setProjectsLoading(false);
    }
  };

  /**
   * Recharge les projets lorsque
   * l'utilisateur est disponible.
   */
  useEffect(() => {
    if (user?.email) {
      void loadProjects();
    }
  }, [user?.email]);

  /**
   * ============================
   * User emails
   * ============================
   */

  /**
   * Récupère l'email d'un utilisateur
   * à partir de son ID.
   *
   * Appelle :
   *
   * GET /users/id/:id
   */
  const getUserEmail = async (
    userId: string
  ) => {
    /**
     * Pas d'ID => rien à faire.
     */
    if (!userId) {
      return;
    }

    /**
     * Si on possède déjà l'email,
     * inutile de refaire une requête.
     */
    if (userEmails[userId]) {
      return;
    }

    

    try {
      const response = await authApi.findById(userId);
      const email = response.user.email;

      if (!email) {
        return;
      }

      setUserEmails(
        (currentEmails) => ({
          ...currentEmails,
          [userId]: email,
        })
      );
    } catch (cause) {
      console.error(
        'Unable to retrieve user email',
        cause
      );
    }
  };

  /**
   * Dès que les tâches sont disponibles,
   * récupère les emails des utilisateurs
   * associés aux tâches.
   */
  useEffect(() => {
    const loadUserEmails = async () => {
      const userIds = [
        ...new Set(
          items
            .map(
              (item) => item.userId
            )
            .filter(
              (
                userId
              ): userId is string =>
                Boolean(userId)
            )
        ),
      ];

      await Promise.all(
        userIds.map((userId) =>
          getUserEmail(userId)
        )
      );
    };

    if (items.length > 0) {
      void loadUserEmails();
    }
  }, [items]);

  /**
   * ============================
   * Project helpers
   * ============================
   */

  /**
   * Permet de retrouver le nom du projet
   * à partir du projectId de la tâche.
   */
  const getProjectName = (
    projectId:
      | string
      | null
      | undefined
  ) => {
    if (!projectId) {
      return 'No project';
    }

    const project =
      projects.find(
        (project) =>
          project.id === projectId
      );

    return (
      project?.name ??
      'Unknown project'
    );
  };

  /**
   * ============================
   * Tasks filtering
   * ============================
   */

  /**
   * Garde uniquement les tâches
   * des projets auxquels l'utilisateur
   * est rattaché.
   */
  const myProjectTasks = useMemo(() => {
    const myProjectIds =
      new Set(
        projects.map(
          (project) => project.id
        )
      );

    return items.filter(
      (item) =>
        item.projectId &&
        myProjectIds.has(
          item.projectId
        )
    );
  }, [items, projects]);

  /**
   * Recherche parmi les tâches.
   *
   * La recherche fonctionne sur :
   * - le nom de la tâche ;
   * - le nom du projet.
   */
  const filteredItems = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    if (!normalizedSearch) {
      return myProjectTasks;
    }

    return myProjectTasks.filter(
      (item) => {
        const taskName =
          item.name?.toLowerCase() ??
          '';

        const projectName =
          getProjectName(
            item.projectId
          ).toLowerCase();

        return (
          taskName.includes(
            normalizedSearch
          ) ||
          projectName.includes(
            normalizedSearch
          )
        );
      }
    );
  }, [
    myProjectTasks,
    search,
    projects,
  ]);

  /**
   * ============================
   * Tasks by status
   * ============================
   */

  const tasksByStatus = useMemo(() => {
    const result: Record<
      TaskStatus,
      Task[]
    > = {
      todo: [],
      in_progress: [],
      done: [],
    };

    filteredItems.forEach(
      (item) => {
        const status =
          (item.status as TaskStatus) ??
          'todo';

        if (status in result) {
          result[status].push(item);
        } else {
          result.todo.push(item);
        }
      }
    );

    return result;
  }, [filteredItems]);

  /**
   * ============================
   * Drag & Drop
   * ============================
   */

  const handleDragStart = (
    event: React.DragEvent,
    task: {
      id: string;
      status?: TaskStatus;
    }
  ) => {
    const status =
      task.status ?? 'todo';

    setDraggedTask({
      id: task.id,
      status,
    });

    event.dataTransfer.effectAllowed =
      'move';

    event.dataTransfer.setData(
      'text/plain',
      task.id
    );
  };

  const handleDragOver = (
    event: React.DragEvent,
    status: TaskStatus
  ) => {
    /**
     * Obligatoire pour permettre
     * le drop.
     */
    event.preventDefault();

    event.dataTransfer.dropEffect =
      'move';

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

    /**
     * Récupère l'ID stocké au début
     * du drag.
     */
    const taskId =
      event.dataTransfer.getData(
        'text/plain'
      );

    if (!taskId) {
      setDraggedTask(null);
      return;
    }

    /**
     * Retrouve la tâche.
     */
    const task = items.find(
      (item) =>
        item.id === taskId
    );

    if (!task) {
      setDraggedTask(null);
      return;
    }

    const currentStatus =
      (task.status as TaskStatus) ??
      'todo';

    /**
     * Même colonne => rien à faire.
     */
    if (
      currentStatus ===
      targetStatus
    ) {
      setDraggedTask(null);
      return;
    }

    try {
      /**
       * Mise à jour côté backend.
       */
      await itemsApi.updateStatus(
        taskId,
        targetStatus
      );

      /**
       * Mise à jour immédiate côté frontend.
       */
      setItems(
        (currentItems) =>
          currentItems.map(
            (item) =>
              item.id === taskId
                ? {
                    ...item,
                    status:
                      targetStatus,
                  }
                : item
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
   * ============================
   * Delete
   * ============================
   */

  const handleDeleteItem = (
    id: string
  ) => {
    void mutate(async () => {
      await itemsApi.remove(id);

      /**
       * Supprime également la tâche
       * localement.
       */
      setItems(
        (currentItems) =>
          currentItems.filter(
            (item) =>
              item.id !== id
          )
      );
    });
  };

  /**
   * ============================
   * Checkbox / Completed
   * ============================
   */

  const handleCheckboxChange = (
    id: string
  ) => {
    const item = items.find(
      (item) =>
        item.id === id
    );

    if (!item) {
      return;
    }

    const newCompleted =
      !item.completed;

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

      setItems(
        (currentItems) =>
          currentItems.map(
            (currentItem) =>
              currentItem.id === id
                ? {
                    ...currentItem,
                    completed:
                      newCompleted,
                    status:
                      newStatus,
                  }
                : currentItem
          )
      );
    });
  };

  /**
   * ============================
   * Project created
   * ============================
   */

  const handleProjectCreated =
    () => {
      void refresh();
      void loadProjects();
    };

  /**
   * ============================
   * Render
   * ============================
   */

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
            justifyContent:
              'space-between',
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
              onClick={
                handleOpenProject
              }
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
          handleClose={
            handleCloseProject
          }
          onCreated={
            handleProjectCreated
          }
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
              <Button
                onClick={refresh}
              >
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
            Impossible de charger les
            projets :{' '}
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
              setSearch(
                event.target.value
              )
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
          {columns.map(
            (column) => {
              const columnTasks =
                tasksByStatus[
                  column.id
                ];

              const isDragOver =
                dragOverColumn ===
                column.id;

              /**
               * Tri par priorité.
               */
              const sortedColumnTasks =
                [
                  ...columnTasks,
                ].sort((a, b) => {
                  const priorityOrder: Record<
                    string,
                    number
                  > = {
                    high: 0,
                    medium: 1,
                    low: 2,
                  };

                  return (
                    (priorityOrder[
                      a.priorisation
                    ] ?? 3) -
                    (priorityOrder[
                      b.priorisation
                    ] ?? 3)
                  );
                });

              return (
                <Paper
                  key={column.id}
                  elevation={0}
                  onDragOver={(
                    event
                  ) =>
                    handleDragOver(
                      event,
                      column.id
                    )
                  }
                  onDragLeave={
                    handleDragLeave
                  }
                  onDrop={(event) =>
                    void handleDrop(
                      event,
                      column.id
                    )
                  }
                  sx={{
                    flex: '1 1 0',
                    minWidth: 320,
                    maxWidth: 520,
                    minHeight: 550,
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor:
                      isDragOver
                        ? 'primary.main'
                        : 'divider',
                    backgroundColor:
                      isDragOver
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
                      alignItems:
                        'center',
                      justifyContent:
                        'space-between',
                      mb: 1.5,
                      px: 0.5,
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      fontWeight={700}
                    >
                      {
                        column.title
                      }
                    </Typography>

                    <Chip
                      size="small"
                      label={
                        columnTasks.length
                      }
                    />
                  </Box>

                  {/* Cards */}
                  <Stack
                    spacing={1.5}
                  >
                    {sortedColumnTasks.map(
                      (row) => (
                        <Card
                          key={row.id}
                          draggable
                          onDragStart={(
                            event
                          ) =>
                            handleDragStart(
                              event,
                              {
                                id: row.id,
                                status:
                                  (row.status as TaskStatus) ??
                                  'todo',
                              }
                            )
                          }
                          onDragEnd={
                            handleDragEnd
                          }
                          sx={{
                            cursor:
                              'grab',
                            border:
                              '1px solid',
                            borderColor:
                              'divider',
                            borderRadius: 2,
                            transition:
                              'box-shadow 0.15s, transform 0.15s',
                            '&:hover': {
                              boxShadow: 3,
                            },
                            '&:active': {
                              cursor:
                                'grabbing',
                            },
                            opacity:
                              draggedTask?.id ===
                              row.id
                                ? 0.5
                                : 1,
                          }}
                        >
                          <CardContent
                            sx={{
                              '&:last-child':
                                {
                                  pb: 2,
                                },
                            }}
                          >
                            {/* Task name + delete */}
                            <Box
                              sx={{
                                display:
                                  'flex',
                                alignItems:
                                  'flex-start',
                                justifyContent:
                                  'space-between',
                                gap: 1,
                              }}
                            >
                              <Typography
                                variant="subtitle2"
                                fontWeight={
                                  600
                                }
                                sx={{
                                  wordBreak:
                                    'break-word',
                                }}
                              >
                                {row.name ||
                                  'Untitled task'}
                              </Typography>

                              <IconButton
                                size="small"
                                disabled={
                                  loading ||
                                  pending
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
                                  display:
                                    'inline-block',
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
                                display:
                                  'flex',
                                alignItems:
                                  'center',
                                gap: 1,
                                flexWrap:
                                  'wrap',
                              }}
                            >
                              {/* Priority */}
                              <Tooltip title="Priorisation">
                                <Chip
                                  size="medium"
                                  label={
                                    row.priorisation
                                  }
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

                              {/* Deadline */}
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

                              {/* User email */}
                              <Tooltip title="User email">
                                <Chip
                                  size="medium"
                                  variant="outlined"
                                  label={
                                    row.userId
                                      ? userEmails[
                                          row.userId
                                        ] ??
                                        'Loading...'
                                      : 'Unknown user'
                                  }
                                />
                              </Tooltip>
                            </Box>
                          </CardContent>
                        </Card>
                      )
                    )}

                    {/* Empty column */}
                    {columnTasks.length ===
                      0 && (
                      <Box
                        sx={{
                          minHeight: 120,
                          border:
                            '1px dashed',
                          borderColor:
                            isDragOver
                              ? 'primary.main'
                              : 'divider',
                          borderRadius: 2,
                          display:
                            'flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'center',
                          p: 2,
                        }}
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          textAlign="center"
                        >
                          Drop a task
                          here
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              );
            }
          )}
        </Box>

        {/* Projects */}
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
            onUpdated={
              loadProjects
            }
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