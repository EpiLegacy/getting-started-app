import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from '../../src/client/app/App';

jest.mock('../../src/client/features/todos/todos.css', () => ({}));

function renderRoute(location: string) {
    return renderToStaticMarkup(
        React.createElement(StaticRouter, { location }, React.createElement(App)),
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
        expect(html).toContain('Todo List');
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
