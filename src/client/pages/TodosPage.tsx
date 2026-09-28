import React, { useEffect, useState } from 'react';

import {
  Alert,
  CircularProgress,
  Box,
  Button,
  Checkbox,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
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

type SortKey = 'deadline' | 'priorisation';

type Project = {
  id: string;
  name: string;
};

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

  const [open, setOpen] = useState<boolean>(false);
  const [openProject, setOpenProject] = useState<boolean>(false);

  const [search, setSearch] = useState('');

  const [sortKey, setSortKey] =
    useState<SortKey>('deadline');

  const [sortDirection, setSortDirection] =
    useState<'asc' | 'desc'>('asc');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] =
    useState(false);

  const [projectsError, setProjectsError] = useState('');

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleOpenProject = () => setOpenProject(true);
  const handleCloseProject = () => setOpenProject(false);

  /**
   * Charge les projets afin de pouvoir afficher
   * leur nom dans le tableau.
   */
  const loadProjects = async () => {
    const controller = new AbortController();

    setProjectsLoading(true);
    setProjectsError('');

    try {
      const result = await projectsApi.getAll(
        controller.signal
      );

      setProjects(result);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setProjectsError(errorMessage(cause));
      }
    } finally {
      if (!controller.signal.aborted) {
        setProjectsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  /**
   * Retourne le nom du projet correspondant au projectId
   * de la tâche.
   */
  const getProjectName = (
    projectId: string | null | undefined
  ) => {
    if (!projectId) {
      return '—';
    }

    const project = projects.find(
      (project) => project.id === projectId
    );

    return project?.name ?? 'Projet inconnu';
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) =>
        prev === 'asc' ? 'desc' : 'asc'
      );
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }

    setPage(0);
  };

  const priorityOrder = {
    high: 1,
    medium: 2,
    low: 3,
  };

  const filteredItems = items.filter((item) =>
    item.name
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const sortedItems = [...filteredItems].sort(
    (a, b) => {
      let comparison = 0;

      if (sortKey === 'deadline') {
        comparison =
          new Date(a.deadline).getTime() -
          new Date(b.deadline).getTime();
      }

      if (sortKey === 'priorisation') {
        comparison =
          priorityOrder[a.priorisation] -
          priorityOrder[b.priorisation];
      }

      return sortDirection === 'asc'
        ? comparison
        : -comparison;
    }
  );

  const currentPage = Math.min(
    page,
    Math.max(
      0,
      Math.ceil(
        sortedItems.length / rowsPerPage
      ) - 1
    )
  );

  const paginatedItems = sortedItems.slice(
    currentPage * rowsPerPage,
    currentPage * rowsPerPage + rowsPerPage
  );

  const handleChangePage = (
    _event: unknown,
    newPage: number
  ) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(
      parseInt(event.target.value, 10)
    );
    setPage(0);
  };

  const handleDeleteItem = (id: string) => {
    void mutate(() => itemsApi.remove(id));
  };

  const handleCheckboxChange = (id: string) => {
    const item = items.find(
      (item) => item.id === id
    );

    if (item) {
      void mutate(() =>
        itemsApi.setCompleted(
          item.id,
          !item.completed
        )
      );
    }
  };

  /**
   * Après création d'un projet, on recharge également
   * les projets pour que le nouveau nom soit disponible
   * immédiatement dans le tableau.
   */
  const handleProjectCreated = () => {
    void refresh();
    void loadProjects();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 1000,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            mb: 2,
            textAlign: 'center',
          }}
        >
          My tasks
        </Typography>

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

        {(loading || projectsLoading) && (
          <CircularProgress
            aria-label="Loading"
            size={24}
          />
        )}

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <TextField
            label="Name"
            variant="outlined"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
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

          <Box
            sx={{
              display: 'flex',
              gap: 2,
            }}
          >
            <Button
              onClick={handleOpen}
              variant="contained"
            >
              <AddIcon />
              Add item
            </Button>

            <Button
              onClick={handleOpenProject}
              variant="contained"
            >
              <AddIcon />
              Add project
            </Button>
          </Box>
        </Box>

        <AddProject
          open={openProject}
          handleClose={handleCloseProject}
          onCreated={handleProjectCreated}
        />

        <AddItem
          open={open}
          handleClose={handleClose}
          onCreated={refresh}
        />

        {!loading &&
          filteredItems.length === 0 && (
            <Typography sx={{ my: 2 }}>
              {items.length
                ? 'No matching tasks.'
                : 'No tasks yet. Add one or claim an unassigned task below.'}
            </Typography>
          )}

        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell>
                  Name
                </TableCell>

                <TableCell
                  sortDirection={
                    sortKey === 'deadline'
                      ? sortDirection
                      : false
                  }
                >
                  <TableSortLabel
                    active={
                      sortKey === 'deadline'
                    }
                    direction={
                      sortKey === 'deadline'
                        ? sortDirection
                        : 'asc'
                    }
                    onClick={() =>
                      handleSort('deadline')
                    }
                  >
                    Deadline
                  </TableSortLabel>
                </TableCell>

                <TableCell
                  sortDirection={
                    sortKey === 'priorisation'
                      ? sortDirection
                      : false
                  }
                >
                  <TableSortLabel
                    active={
                      sortKey === 'priorisation'
                    }
                    direction={
                      sortKey === 'priorisation'
                        ? sortDirection
                        : 'asc'
                    }
                    onClick={() =>
                      handleSort(
                        'priorisation'
                      )
                    }
                  >
                    Priorisation
                  </TableSortLabel>
                </TableCell>

                <TableCell>
                  Project name
                </TableCell>

                <TableCell>
                  Completed
                </TableCell>

                <TableCell>
                  Action
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {paginatedItems.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    row.completed
                      ? 'todo-row completed'
                      : 'todo-row'
                  }
                >
                  <TableCell>
                    {row.name ||
                      'Untitled task'}
                  </TableCell>

                  <TableCell>
                    {row.deadline
                      ? new Date(
                          row.deadline
                        ).toLocaleDateString(
                          'fr-FR'
                        )
                      : '—'}
                  </TableCell>

                  <TableCell>
                    {row.priorisation}
                  </TableCell>

                  <TableCell>
                    <Typography
                      variant="body2"
                      fontWeight={500}
                    >
                      {getProjectName(
                        row.projectId
                      )}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      disabled={
                        loading || pending
                      }
                      slotProps={{
                        input: {
                          'aria-label': `Mark ${
                            row.name
                          } ${
                            row.completed
                              ? 'incomplete'
                              : 'complete'
                          }`,
                        },
                      }}
                      checked={row.completed}
                      onChange={() =>
                        handleCheckboxChange(
                          row.id
                        )
                      }
                    />
                  </TableCell>

                  <TableCell>
                    <IconButton
                      disabled={
                        loading || pending
                      }
                      aria-label={`Delete ${row.name}`}
                      onClick={() => {
                        handleDeleteItem(
                          row.id
                        );
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={filteredItems.length}
            page={currentPage}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={
              handleChangeRowsPerPage
            }
            rowsPerPageOptions={[
              5,
              10,
              25,
            ]}
            labelRowsPerPage="Lignes par page"
            labelDisplayedRows={({
              from,
              to,
              count,
            }) =>
              `${from}-${to} sur ${count}`
            }
          />
        </TableContainer>

        {!loading && (
          <UnassignedTasks
            tasks={unassigned}
            disabled={pending}
            onClaim={(id) => {
              void mutate(() =>
                itemsApi.claim(id)
              );
            }}
          />
        )}
      </Box>
    </Box>
  );
}
