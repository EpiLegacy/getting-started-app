import React from 'react';
import ReactDOM from 'react-dom';
import { Button, Col, Container, Form, InputGroup, Row } from 'react-bootstrap';

interface Item {
    id: string;
    name: string;
    completed: boolean;
}

function App() {
    return (
        <Container>
            <Row>
                <Col md={{ offset: 3, span: 6 }}>
                    <TodoListCard />
                </Col>
            </Row>
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

    const onNewItem = React.useCallback(
        (newItem: Item) => {
            setItems([...items!, newItem]);
        },
        [items],
    );

    const onItemUpdate = React.useCallback(
        (item: Item) => {
            const index = items!.findIndex(i => i.id === item.id);
            setItems([
                ...items!.slice(0, index),
                item,
                ...items!.slice(index + 1),
            ]);
        },
        [items],
    );

    const onItemRemoval = React.useCallback(
        (item: Item) => {
            const index = items!.findIndex(i => i.id === item.id);
            setItems([...items!.slice(0, index), ...items!.slice(index + 1)]);
        },
        [items],
    );

    if (items === null) return <React.Fragment>Loading...</React.Fragment>;

    return (
        <React.Fragment>
            <AddItemForm onNewItem={onNewItem} />
            {items.length === 0 && (
                <p className="text-center">No items yet! Add one above!</p>
            )}
            {items.map(item => (
                <ItemDisplay
                    item={item}
                    key={item.id}
                    onItemUpdate={onItemUpdate}
                    onItemRemoval={onItemRemoval}
                />
            ))}
        </React.Fragment>
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
        <Form onSubmit={submitNewItem}>
            <InputGroup className="mb-3">
                <Form.Control
                    value={newItem}
                    onChange={e =>
                        setNewItem((e.target as HTMLInputElement).value)
                    }
                    type="text"
                    placeholder="New Item"
                    aria-describedby="basic-addon1"
                />
                <InputGroup.Append>
                    <Button
                        type="submit"
                        variant="success"
                        disabled={!newItem.length}
                        className={submitting ? 'disabled' : ''}
                    >
                        {submitting ? 'Adding...' : 'Add Item'}
                    </Button>
                </InputGroup.Append>
            </InputGroup>
        </Form>
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
        <Container fluid className={`item ${item.completed && 'completed'}`}>
            <Row>
                <Col xs={1} className="text-center">
                    <Button
                        className="toggles"
                        size="sm"
                        variant="link"
                        onClick={toggleCompletion}
                        aria-label={
                            item.completed
                                ? 'Mark item as incomplete'
                                : 'Mark item as complete'
                        }
                    >
                        <i
                            className={`far ${
                                item.completed ? 'fa-check-square' : 'fa-square'
                            }`}
                        />
                    </Button>
                </Col>
                <Col xs={10} className="name">
                    {item.name}
                </Col>
                <Col xs={1} className="text-center remove">
                    <Button
                        size="sm"
                        variant="link"
                        onClick={removeItem}
                        aria-label="Remove Item"
                    >
                        <i className="fa fa-trash text-danger" />
                    </Button>
                </Col>
            </Row>
        </Container>
    );
}

ReactDOM.render(<App />, document.getElementById('root'));
