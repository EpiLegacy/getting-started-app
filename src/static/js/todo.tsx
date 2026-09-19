import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  IconButton,
  InputAdornment,
  MenuItem,
  Modal,
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

import './globals.css';
import React from 'react';
import { Item, itemsApi, Priority } from './api';

type SortKey = 'deadline' | 'priorisation';

interface AddItemProps {
  open: boolean;
  handleClose: () => void;
  refresh: boolean;
  setRefresh: React.Dispatch<React.SetStateAction<boolean>>;
}

function AddItem({ open, handleClose, refresh, setRefresh }: AddItemProps) {
  const [name, setName] = useState<string>('');
  const [deadline, setDeadline] = useState<string>('');
  const [priorisation, setPriorisation] = useState<Priority>('medium');

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const item: Item = {
      id: name,
      completed: false,
      name,
      deadline,
      priorisation,
    };

    itemsApi
      .create(item)
      .then();

    setName('');
    setDeadline('');
    setPriorisation('medium');
    setRefresh(!refresh);
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="modal-modal-title"
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400,
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Typography
          id="modal-modal-title"
          variant="h6"
          component="h2"
        >
          Ajouter une tâche
        </Typography>

        <TextField
          name="name"
          label="Nom"
          variant="outlined"
          required
          fullWidth
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <TextField
          name="deadline"
          label="Deadline"
          type="date"
          variant="outlined"
          required
          fullWidth
          value={deadline}
          onChange={(event) =>
            setDeadline(event.target.value)
          }
          slotProps={{
            inputLabel: {
              shrink: true,
            },
          }}
        />

        <TextField
          name="priorisation"
          label="Priorisation"
          select
          value={priorisation}
          onChange={(event) =>
            setPriorisation(event.target.value as Priority)
          }
          required
          fullWidth
        >
          <MenuItem value="high">
            High
          </MenuItem>

          <MenuItem value="medium">
            Medium
          </MenuItem>

          <MenuItem value="low">
            Low
          </MenuItem>
        </TextField>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            mt: 1,
          }}
        >
          <Button
            type="button"
            variant="outlined"
            onClick={handleClose}
          >
            Annuler
          </Button>

          <Button
            type="submit"
            variant="contained"
          >
            Ajouter
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

export default function TodosPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<boolean>(false);
  const [refresh, setRefresh] = useState<boolean>(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('deadline');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  useEffect(() => {
    itemsApi
      .getAll()
      .then(setItems)
    console.log(items);

  }, [refresh]);

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
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const sortedItems = [...filteredItems].sort((a, b) => {
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
  });

  const paginatedItems = sortedItems.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
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
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // const handleCheckboxChange = (id: number) => {
  //     setItems((prevItems) => {
  //         const updatedItems = prevItems.map((item) =>
  //             item.id === id
  //                 ? {
  //                     ...item,
  //                     completed: !item.completed,
  //                 }
  //                 : item
  //         );

  //         return [...updatedItems].sort(
  //             (a, b) => Number(a.completed) - Number(b.completed)
  //         );
  //     });
  // };

  // const handleCheckboxChange = (id: number) => {
  //     setItems((prevItems) => {
  //         const updatedItems = prevItems.map(
  //             (item) =>
  //                 item.id === id
  //                     ? {
  //                         ...item,
  //                         completed:
  //                             !item.completed,
  //                     }
  //                     : item
  //         );

  //         return [...updatedItems].sort(
  //             (a, b) =>
  //                 Number(a.completed) -
  //                 Number(b.completed)
  //         );
  //     });
  // };

  const handleDeleteItem = (id: string) => {
    itemsApi.remove(id);
    setRefresh(!refresh);
  }

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
        <Typography variant="h5" sx={{ mb: 2, textAlign: 'center' }}>
          Todo List
        </Typography>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
            mb: 2,
          }}
        >
          <Button
            onClick={handleOpen}
            variant="contained"
          >
            <AddIcon />
            Add item
          </Button>
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
        </Box>
        <AddItem
          open={open}
          handleClose={handleClose}
          refresh={refresh}
          setRefresh={setRefresh}
        />
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell>
                  Name
                </TableCell>

                <TableCell sortDirection={
                  sortKey === 'deadline'
                    ? sortDirection
                    : false
                }>
                  <TableSortLabel
                    active={sortKey === 'deadline'}
                    direction={
                      sortKey === 'deadline'
                        ? sortDirection
                        : 'asc'
                    }
                    onClick={() => handleSort('deadline')}
                  >
                    Deadline
                  </TableSortLabel>
                </TableCell>

                <TableCell sortDirection={
                  sortKey === 'priorisation'
                    ? sortDirection
                    : false
                }>
                  <TableSortLabel
                    active={sortKey === 'priorisation'}
                    direction={
                      sortKey === 'priorisation'
                        ? sortDirection
                        : 'asc'
                    }
                    onClick={() => handleSort('priorisation')}
                  >
                    Priorisation
                  </TableSortLabel>
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
                    {row.name}
                  </TableCell>

                  <TableCell>
                    {new Date(row.deadline).toLocaleDateString(
                      'fr-FR'
                    )}
                  </TableCell>

                  <TableCell>
                    {row.priorisation}
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={row.completed}
                    // onChange={() =>
                    //     handleCheckboxChange(row.id)
                    // }
                    />
                  </TableCell>

                  <TableCell>
                    <IconButton
                      aria-label="delete"
                      onClick={() => {
                        handleDeleteItem(row.id)
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
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, filteredItems.length]}
            labelRowsPerPage="Lignes par page"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} sur ${count}`
            }
          />
        </TableContainer>
      </Box>
    </Box>
  );
}

