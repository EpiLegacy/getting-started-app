import React from 'react';
import { Button, Container, Typography } from '@mui/material';
import { Link } from 'react-router';

export default function NotFoundPage() {
    return (
        <Container sx={{ py: 6 }}>
            <Typography component="h1" variant="h3" gutterBottom>Page not found</Typography>
            <Button component={Link} to="/" variant="contained">Back to home</Button>
        </Container>
    );
}
