import React from 'react';
import { createRoot } from 'react-dom/client';
import AddIcon from '@mui/icons-material/Add';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import {
    AppBar,
    Box,
    Button,
    CircularProgress,
    Container,
    CssBaseline,
    IconButton,
    Paper,
    Stack,
    Toolbar,
    TextField,
    ThemeProvider,
    Typography,
    createTheme,
} from '@mui/material';

interface Item {
    id: string;
    name: string;
    completed: boolean;
}

interface DashboardTodo {
    id: string;
    name: string;
    dueToday: boolean;
    completed: boolean;
}

const dashboardTodos: DashboardTodo[] = [
    { id: '1', name: 'Review the project roadmap', dueToday: true, completed: false },
    { id: '2', name: 'Prepare notes for the team sync', dueToday: true, completed: false },
    { id: '3', name: 'Reply to pending messages', dueToday: true, completed: true },
    { id: '4', name: 'Update the weekly report', dueToday: false, completed: false },
    { id: '5', name: 'Plan next week’s priorities', dueToday: false, completed: false },
    { id: '6', name: 'Organize project files', dueToday: false, completed: false },
    { id: '7', name: 'Book the monthly review', dueToday: false, completed: true },
    { id: '8', name: 'Read the product feedback', dueToday: false, completed: true },
];

const theme = createTheme({
    palette: { background: { default: '#f4f4f4' } },
    typography: {
        fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    shape: { borderRadius: 10 },
});

function App() {
    const isTodosPage = window.location.pathname === '/todos';

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <AppBar position="static" color="inherit" elevation={1}>
                <Toolbar sx={{ gap: 1 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
                        Todo App
                    </Typography>
                    <Button
                        href="/"
                        color="inherit"
                        startIcon={<HomeOutlinedIcon />}
                        aria-current={!isTodosPage ? 'page' : undefined}
                    >
                        Home
                    </Button>
                    <Button
                        href="/todos"
                        color="inherit"
                        startIcon={<ListAltOutlinedIcon />}
                        aria-current={isTodosPage ? 'page' : undefined}
                    >
                        Todos
                    </Button>
                </Toolbar>
            </AppBar>
            {isTodosPage ? <TodosPage /> : <HomePage />}
        </ThemeProvider>
    );
}

function HomePage() {
    const dueToday = dashboardTodos.filter(todo => todo.dueToday);
    const unresolvedCount = 0

    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
            <Stack spacing={4}>
                <Box>
                    <Typography component="h1" variant="h3" fontWeight={700} gutterBottom>
                        Welcome back!
                    </Typography>
                    <Typography color="text.secondary" variant="h6">
                        Here’s a quick look at what needs your attention today.
                    </Typography>
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                    <Paper sx={{ p: 3, flex: 2 }} elevation={2}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                            <TodayOutlinedIcon color="primary" />
                            <Typography component="h2" variant="h6" fontWeight={700}>
                                Due today
                            </Typography>
                        </Stack>
                        <Stack spacing={1.5}>
                            WIP
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 3, flex: 1 }} elevation={2}>
                        <Typography color="text.secondary" gutterBottom>
                            Unresolved todos
                        </Typography>
                        <Typography variant="h3" fontWeight={700} color="primary">
                            {unresolvedCount}
                            <Typography component="span" variant="h6" color="text.secondary">
                                {' '}of {dashboardTodos.length}
                            </Typography>
                        </Typography>
                        <Typography color="text.secondary" mt={1}>
                            todos still need to be completed
                        </Typography>
                        <Button href="/todos" variant="outlined" sx={{ mt: 3 }}>
                            View all todos
                        </Button>
                    </Paper>
                </Stack>
            </Stack>
        </Container>
    );
}

function TodosPage() {
    return (
        <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 6 } }}>
            <Typography component="h1" variant="h4" fontWeight={700} mb={3}>
                Todo list
            </Typography>
            <TodoListCard />
        </Container>
    );
}

function TodoListCard() {
    const [items, setItems] = React.useState<Item[] | null>(null);

    React.useEffect(() => {
        fetch('/items')
            .then(r => r.json())
            .then(setItems);
    }, []);

    const onNewItem = React.useCallback((newItem: Item) => {
        setItems(currentItems => [...(currentItems ?? []), newItem]);
    }, []);

    const onItemUpdate = React.useCallback((item: Item) => {
        setItems(currentItems =>
            currentItems?.map(currentItem =>
                currentItem.id === item.id ? item : currentItem,
            ) ?? [],
        );
    }, []);

    const onItemRemoval = React.useCallback((item: Item) => {
        setItems(currentItems =>
            currentItems?.filter(currentItem => currentItem.id !== item.id) ?? [],
        );
    }, []);

    if (items === null) {
        return (
            <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress aria-label="Loading items" />
            </Box>
        );
    }

    return (
        <Stack spacing={2}>
            <AddItemForm onNewItem={onNewItem} />
            {items.length === 0 && (
                <Typography color="text.secondary" textAlign="center" py={4}>
                    No items yet! Add one above!
                </Typography>
            )}
            {items.map(item => (
                <ItemDisplay
                    item={item}
                    key={item.id}
                    onItemUpdate={onItemUpdate}
                    onItemRemoval={onItemRemoval}
                />
            ))}
        </Stack>
    );
}

interface AddItemFormProps {
    onNewItem: (item: Item) => void;
}

function AddItemForm({ onNewItem }: AddItemFormProps) {
    const [newItem, setNewItem] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);

    const submitNewItem = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        fetch('/items', {
            method: 'POST',
            body: JSON.stringify({ name: newItem }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then(r => r.json())
            .then(item => {
                onNewItem(item);
                setSubmitting(false);
                setNewItem('');
            });
    };

    return (
        <Box component="form" onSubmit={submitNewItem}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                    fullWidth
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    type="text"
                    label="New item"
                    size="small"
                />
                <Button
                    type="submit"
                    variant="contained"
                    color="success"
                    disabled={!newItem.trim().length || submitting}
                    startIcon={
                        submitting ? (
                            <CircularProgress size={16} color="inherit" />
                        ) : (
                            <AddIcon />
                        )
                    }
                    sx={{ whiteSpace: 'nowrap' }}
                >
                    {submitting ? 'Adding...' : 'Add item'}
                </Button>
            </Stack>
        </Box>
    );
}

interface ItemDisplayProps {
    item: Item;
    onItemUpdate: (item: Item) => void;
    onItemRemoval: (item: Item) => void;
}

function ItemDisplay({ item, onItemUpdate, onItemRemoval }: ItemDisplayProps) {
    const toggleCompletion = () => {
        fetch(`/items/${item.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: item.name,
                completed: !item.completed,
            }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then(r => r.json())
            .then(onItemUpdate);
    };

    const removeItem = () => {
        fetch(`/items/${item.id}`, { method: 'DELETE' }).then(() =>
            onItemRemoval(item),
        );
    };

    return (
        <Paper elevation={2} sx={{ p: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton
                    color="primary"
                    onClick={toggleCompletion}
                    aria-label={
                        item.completed
                            ? 'Mark item as incomplete'
                            : 'Mark item as complete'
                    }
                >
                    {item.completed ? (
                        <CheckBoxIcon />
                    ) : (
                        <CheckBoxOutlineBlankIcon />
                    )}
                </IconButton>
                <Typography
                    flex={1}
                    sx={{
                        overflowWrap: 'anywhere',
                        textDecoration: item.completed ? 'line-through' : 'none',
                        color: item.completed ? 'text.secondary' : 'text.primary',
                    }}
                >
                    {item.name}
                </Typography>
                <IconButton
                    color="error"
                    onClick={removeItem}
                    aria-label="Remove item"
                >
                    <DeleteOutlineIcon />
                </IconButton>
            </Stack>
        </Paper>
    );
}

const rootElement = document.getElementById('root');

if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(<App />);
