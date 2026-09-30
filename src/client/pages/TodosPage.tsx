import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import React from 'react';
import AddProject from '../features/todos/components/AddProject';
import AddItem from '../features/todos/components/AddItem';
import { useTasks } from '../features/todos/useTasks';
import { Project, projectApi } from '../features/todos/api/projectApi';
import { TaskStatus } from '../../types';
import { itemsApi } from '../features/todos/api/itemsApi';

const kanbanColumns: {
  id: TaskStatus;
  title: string;
}[] = [
    { id: 'todo', title: 'Todo' },
    { id: 'inProgress', title: 'In progress' },
    { id: 'completed', title: 'Completed' },
  ];

export default function TodosPage() {
  const {
    items,
    unassigned,
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

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      setProjectsError(null);

      const data = await projectApi.list();

      setProjects(data);
    } catch (err) {
      console.error(
        'Erreur chargement projets:',
        err,
      );

      setProjectsError(
        'Impossible de charger les projets.',
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
        'Veuillez saisir un email.',
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
        'Erreur ajout utilisateur:',
        err,
      );

      setMemberError(
        'Impossible d’ajouter cet utilisateur.',
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

      setProjects((currentProjects) =>
        currentProjects.filter(
          (project) =>
            project.id !== projectId,
        ),
      );

      if (
        memberProject?.id === projectId
      ) {
        setMemberProject(null);
        setMemberEmail('');
        setMemberError(null);
      }
    } catch (err) {
      console.error(
        'Erreur suppression projet:',
        err,
      );
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

  const getTaskStatus = (item: any): TaskStatus => {
    if (item.status === 'inProgress' || item.status === 'in_progress') {
      return 'inProgress';
    }

    if (item.status === 'completed' || item.status === 'done') {
      return 'completed';
    }

    if (item.status === 'todo') {
      return 'todo';
    }

    return item.completed ? 'completed' : 'todo';
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

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
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
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    status: TaskStatus,
  ) => {
    event.preventDefault();

    const taskId =
      event.dataTransfer.getData('text/plain') ||
      draggedTaskId;

    if (!taskId) {
      return;
    }

    try {
      await itemsApi.updateStatus(taskId, status);

      setTaskStatuses((current) => ({
        ...current,
        [taskId]: status,
      }));
    } catch (error) {
      console.error('Failed to update task status:', error);
    }

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
      <Box
        sx={{
          mb: 3,
          width: '100%',
        }}
      >
        <Typography
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
            label="Rechercher une tâche"
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
              Ajouter un projet
            </Button>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpen(true)}
            >
              Ajouter une tâche
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h6"
          sx={{ mb: 1 }}
        >
          Mes tâches
        </Typography>

        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 5,
            }}
          >
            <CircularProgress />
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
                Réessayer
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
                        variant="subtitle1"
                        fontWeight={700}
                      >
                        {column.title}
                      </Typography>

                      <Chip
                        size="small"
                        label={columnItems.length}
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
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
                            Déposez une tâche ici
                          </Typography>
                        </Box>
                      ) : (
                        columnItems.map((item) => (
                          <Paper
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
                            <Typography
                              variant="subtitle2"
                              fontWeight={700}
                              sx={{
                                mb: 0.5,
                                wordBreak: 'break-word',
                              }}
                            >
                              {item.name}
                            </Typography>
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
                              <Tooltip
                                title={`Deadline`}
                                arrow
                              >
                                <Chip
                                  size="medium"
                                  variant="outlined"
                                  label={item.deadline}
                                />
                              </Tooltip>
                              <Tooltip
                                title={`Priorité`}
                                arrow
                              >
                                <Chip
                                  size="medium"
                                  label={item.priorisation}
                                  color={
                                    item.priorisation === "high" ? "error" :
                                      item.priorisation === "medium" ? "warning" : "success"

                                  }
                                />
                              </Tooltip>
                              <Tooltip
                                title={`Utilisateur assigné`}
                                arrow
                              >
                                <Chip
                                  size="medium"
                                  variant="outlined"
                                  avatar={
                                    getUserEmail(item.userId) ? (
                                      <Avatar>
                                        {getUserEmail(item.userId)?.charAt(0).toUpperCase()}
                                      </Avatar>
                                    ) : undefined
                                  }
                                  label={getUserEmail(item.userId)}
                                />
                              </Tooltip>
                            </Box>
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
          variant="h6"
          sx={{ mb: 1 }}
        >
          Mes projets
        </Typography>
        {projectsLoading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 3,
            }}
          >
            <CircularProgress size={28} />
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
                Réessayer
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
              Aucun projet pour le moment.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell> Nom du projet </TableCell>
                  <TableCell> Utilisateurs </TableCell>
                  <TableCell align="right"> Actions </TableCell>
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
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.5,
                          }}
                        >
                          {project.members.map(
                            (member) => (
                              <Typography
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
                          Aucun utilisateur
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        sx={{ mr: 1 }}
                        onClick={() => {
                          setMemberProject(project);
                          setMemberEmail('');
                          setMemberError(null);
                        }}
                      >
                        Ajouter
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={
                          <DeleteIcon />
                        }
                        onClick={() => {
                          setProjectToDelete(project);
                        }}
                      >
                        Supprimer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h6"
          sx={{ mb: 1 }}
        >
          Tâches non assignées
        </Typography>

        <Paper
          variant="outlined"
          sx={{ p: 2 }}
        >
          {unassigned.length ===
            0 ? (
            <Typography
              color="text.secondary"
            >
              Aucune tâche non assignée.
            </Typography>
          ) : (
            <Box
              sx={{
                display:
                  'flex',
                flexDirection:
                  'column',
                gap: 1,
              }}
            >
              {unassigned.map(
                (item) => (
                  <Box
                    key={item.id}
                    sx={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      alignItems:
                        'center',
                    }}
                  >
                    <Typography>
                      {item.name}
                    </Typography>
                  </Box>
                ),
              )}
            </Box>
          )}
        </Paper>
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
      >
        <DialogTitle>
          Ajouter un utilisateur
        </DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            Projet :{' '}
            {memberProject?.name}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Email de l'utilisateur"
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
            Annuler
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
            {memberLoading ? (
              <CircularProgress
                size={20}
              />
            ) : (
              'Ajouter'
            )}
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
      >
        <DialogTitle>
          Supprimer le projet
        </DialogTitle>

        <DialogContent>
          <Typography>
            Voulez-vous vraiment supprimer le
            projet{' '}
            <strong>
              {projectToDelete?.name}
            </strong>{' '}
            ?
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            Cette action est irréversible.
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
            Annuler
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
            {deleteProjectLoading ? (
              <CircularProgress
                size={20}
                color="inherit"
              />
            ) : (
              'Supprimer'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box >
  );
}
