import React from 'react';
import { Box, Container, Link, Stack, Typography } from '@mui/material';

/**
 * Accessibility statement, following the RGAA 4.1.2 model. The audit behind
 * every figure here is docs/accessibility.md: update both together.
 */
const AUDIT_DATE = '2026-10-02';
const CRITERIA_MET = 55;
const CRITERIA_APPLICABLE = 56;

const NON_COMPLIANT: Array<[string, string]> = [
    ['7.1', 'The compatibility of interactive components with screen readers has not been verified with a screen reader yet. Automated checks find no issue.'],
];

const AUDITED_PAGES = [
    'Sign in', 'Create an account', 'Home', 'My tasks: the Kanban board and the add task dialog', 'Your profile, with the account deletion dialog',
    'Accessibility statement', 'Site map', 'Page not found',
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <Box component="section" aria-labelledby={id}>
            <Typography id={id} component="h2" variant="h5" fontWeight={700} gutterBottom>{title}</Typography>
            <Stack spacing={1.5}>{children}</Stack>
        </Box>
    );
}

export default function AccessibilityPage() {
    const rate = Math.round((CRITERIA_MET / CRITERIA_APPLICABLE) * 100);
    const date = new Date(AUDIT_DATE).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
            <Stack spacing={4} sx={{ '& ul': { my: 0, pl: 3 } }}>
                <Typography component="h1" variant="h3" fontWeight={700}>Accessibility statement</Typography>
                <Typography>
                    EpiLegacy is committed to making Todo App accessible, in accordance with article 47 of French
                    law no. 2005-102 of 11 February 2005. This statement applies to the whole application.
                </Typography>

                <Section id="status" title="Compliance status">
                    <Typography>
                        Todo App is <strong>partially compliant</strong> with the French accessibility standard
                        RGAA, version 4.1.2, because of the non-compliances listed below.
                    </Typography>
                </Section>

                <Section id="results" title="Test results">
                    <Typography>
                        The internal audit of {date} found that <strong>{rate}% of the applicable RGAA criteria are
                        met</strong>: {CRITERIA_MET} of {CRITERIA_APPLICABLE}. The other {106 - CRITERIA_APPLICABLE} criteria
                        do not apply: the application has no informative image, video, audio, frame or downloadable document.
                    </Typography>
                </Section>

                <Section id="non-accessible" title="Non-accessible content">
                    <Typography component="h3" variant="h6">Non-compliances</Typography>
                    <ul>
                        {NON_COMPLIANT.map(([criteria, text]) => (
                            <li key={criteria}><Typography>{text} (RGAA {criteria})</Typography></li>
                        ))}
                    </ul>
                    <Typography component="h3" variant="h6">Disproportionate burden</Typography>
                    <Typography>None.</Typography>
                    <Typography component="h3" variant="h6">Content not subject to the accessibility obligation</Typography>
                    <Typography>None.</Typography>
                </Section>

                <Section id="method" title="How this statement was established">
                    <Typography>This statement was established on {date}.</Typography>
                    <Typography component="h3" variant="h6">Technologies used</Typography>
                    <Typography>HTML5, CSS, JavaScript (React, MUI), WAI-ARIA.</Typography>
                    <Typography component="h3" variant="h6">Test environment</Typography>
                    <ul>
                        <li><Typography>Chromium (Playwright), with axe-core checking the WCAG 2.1 A and AA rules on every page, in continuous integration.</Typography></li>
                        <li><Typography>Keyboard navigation (skip link, focus visibility, focus after navigation) and reflow in a 320 px wide window, also checked automatically in Chromium.</Typography></li>
                        <li><Typography>A review of every RGAA criterion against the source code.</Typography></li>
                    </ul>
                    <Typography component="h3" variant="h6">Pages audited</Typography>
                    <ul>
                        {AUDITED_PAGES.map(page => <li key={page}><Typography>{page}</Typography></li>)}
                    </ul>
                </Section>

                <Section id="feedback" title="Feedback and contact">
                    <Typography>
                        If you cannot access a piece of content or a service, tell us and we will provide an
                        accessible alternative: open an issue on{' '}
                        <Link href="https://github.com/EpiLegacy/getting-started-app/issues">the project's GitHub repository</Link>.
                    </Typography>
                </Section>

                <Section id="remedies" title="Remedies">
                    <Typography>
                        If you reported an accessibility problem and did not get a satisfactory answer, you can
                        contact the Défenseur des droits (the French rights ombudsman):
                    </Typography>
                    <ul>
                        <li><Typography>through the <Link href="https://formulaire.defenseurdesdroits.fr/" lang="fr">online form</Link>;</Typography></li>
                        <li><Typography>through <Link href="https://www.defenseurdesdroits.fr/carte-des-delegues">one of its local delegates</Link>;</Typography></li>
                        <li><Typography>by post, free of charge: <span lang="fr">Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07</span>.</Typography></li>
                    </ul>
                </Section>
            </Stack>
        </Container>
    );
}
