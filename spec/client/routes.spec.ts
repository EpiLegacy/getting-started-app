import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from '../../src/client/app/App';
import { useAuth } from '../../src/client/features/auth/AuthProvider';

jest.mock('../../src/client/features/auth/AuthProvider', () => ({
    ...jest.requireActual('../../src/client/features/auth/AuthProvider'),
    useAuth: jest.fn(),
}));

beforeEach(() => {
    jest.mocked(useAuth).mockReturnValue({
        user: { id: 'alice', email: 'alice@example.com' }, loading: false, accountDeleted: false, error: '',
        signIn: jest.fn(), logout: jest.fn(), deleteAccount: jest.fn(), retry: jest.fn(),
    });
});

jest.mock('../../src/client/features/todos/todos.css', () => ({}));

function renderRoute(location: string, state?: unknown) {
    return renderToStaticMarkup(
        React.createElement(StaticRouter, { location: { pathname: location, state } }, React.createElement(App)),
    );
}

describe('frontend routes', () => {
    it('renders the dashboard and marks Home as the current page', () => {
        const html = renderRoute('/');
        expect(html).toContain('Welcome back!');
        expect(html).toMatch(/aria-current="page"[^>]*href="\/"/);
        expect(html).toContain('href="/todos"');
    });

    it('renders the todo list and marks Todos as the current page', () => {
        const html = renderRoute('/todos');
        expect(html).toContain('My tasks');
        expect(html).toMatch(/aria-current="page"[^>]*href="\/todos"/);
        expect(html).not.toContain('Welcome back!');
    });

    it('renders unknown nested paths inside the shared layout', () => {
        const html = renderRoute('/missing/nested');
        expect(html).toContain('Page not found');
        expect(html).toContain('Main navigation');
        expect(html).not.toContain('aria-current="page"');
        expect(html).toContain('Back to home');
    });
});

for (const path of ['/login', '/register']) {
    test(`renders ${path} for anonymous users`, () => {
        jest.mocked(useAuth).mockReturnValue({
            user: null, loading: false, accountDeleted: false, error: '', signIn: jest.fn(), logout: jest.fn(), deleteAccount: jest.fn(), retry: jest.fn(),
        });
        const html = renderRoute(path);
        expect(html).toContain('type="password"');
        expect(html).toContain('type="email"');
        expect(html).not.toContain('My tasks');
    });
}

test('does not show tasks while the session is being checked', () => {
    jest.mocked(useAuth).mockReturnValue({
        user: null, loading: true, accountDeleted: false, error: '', signIn: jest.fn(), logout: jest.fn(), deleteAccount: jest.fn(), retry: jest.fn(),
    });
    const html = renderRoute('/todos');
    expect(html).toContain('Checking your session');
    expect(html).not.toContain('Unassigned tasks');
});

test('profile shows read-only account details and links from navigation', () => {
    const html = renderRoute('/profile');
    expect(html).toContain('Your profile');
    expect(html).toContain('alice@example.com');
    expect(html).toContain('Account ID');
    expect(html).toContain('Member since');
    expect(html).toContain('Delete my account');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/profile"/);
    expect(html).not.toContain('<input');
});

test('profile waits for session verification before exposing account details', () => {
    jest.mocked(useAuth).mockReturnValue({
        user: null, loading: true, accountDeleted: false, error: '', signIn: jest.fn(), logout: jest.fn(), deleteAccount: jest.fn(), retry: jest.fn(),
    });
    const html = renderRoute('/profile');
    expect(html).toContain('Checking your session');
    expect(html).not.toContain('Delete my account');
});

test('login confirms account deletion without showing private profile details', () => {
    jest.mocked(useAuth).mockReturnValue({
        user: null, loading: false, accountDeleted: true, error: '', signIn: jest.fn(), logout: jest.fn(), deleteAccount: jest.fn(), retry: jest.fn(),
    });
    const html = renderRoute('/login');
    expect(html).toContain('Your account and its tasks have been deleted.');
    expect(html).not.toContain('alice@example.com');
    expect(html).not.toContain('Delete my account');
});

test('a session lookup failure offers retry without revealing the profile', () => {
    jest.mocked(useAuth).mockReturnValue({
        user: null, loading: false, accountDeleted: false, error: 'Sign-in is temporarily unavailable.',
        signIn: jest.fn(), logout: jest.fn(), deleteAccount: jest.fn(), retry: jest.fn(),
    });
    const html = renderRoute('/profile');
    expect(html).toContain('Sign-in is temporarily unavailable.');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Account ID');
});
