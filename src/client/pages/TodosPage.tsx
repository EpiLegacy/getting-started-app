import { useEffect, useState } from 'react';
import {
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
import React from 'react';
import { itemsApi } from '../features/todos/api/itemsApi';
import type { Item } from '../../types';

type SortKey = 'deadline' | 'priorisation';

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

  const handleDeleteItem = (id: string) => {
    itemsApi.remove(id);
    setRefresh(!refresh);
  }

  const handleCheckboxChange = (id: string) => {
    setItems((prevItems) => {
      const updatedItems = prevItems.map((item) =>
        item.id === id
          ? {
            ...item,
            completed: !item.completed,
          }
          : item
      );
      const updatedItem = updatedItems.find((item) => item.id === id);
      if (updatedItem) {
        itemsApi.update(updatedItem);
      }

      return [...updatedItems].sort(
        (a, b) => Number(a.completed) - Number(b.completed)
      );
    });
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
          <Button
            onClick={handleOpen}
            variant="contained"
          >
            <AddIcon />
            Add item
          </Button>
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
                      onChange={() => handleCheckboxChange(row.id) }
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

