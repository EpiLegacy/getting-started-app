import React from 'react';
import { Container, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';

/** RGAA 12.1 and 12.3: a second navigation system, listing every page. */
const SECTIONS: Array<[string, Array<[string, string]>]> = [
    ['Your account', [['/login', 'Sign in'], ['/register', 'Create an account'], ['/profile', 'Your profile']]],
    ['Tasks', [['/', 'Home'], ['/todos', 'My tasks']]],
    ['About this site', [['/accessibility', 'Accessibility statement'], ['/sitemap', 'Site map']]],
];

export default function SitemapPage() {
    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
            <Stack spacing={3}>
                <Typography component="h1" variant="h3" fontWeight={700}>Site map</Typography>
                {SECTIONS.map(([title, links]) => (
                    <section key={title} aria-label={title}>
                        <Typography component="h2" variant="h5" fontWeight={700} gutterBottom>{title}</Typography>
                        <ul>
                            {links.map(([to, label]) => (
                                <li key={to}><Link component={RouterLink} to={to}>{label}</Link></li>
                            ))}
                        </ul>
                    </section>
                ))}
            </Stack>
        </Container>
    );
}
