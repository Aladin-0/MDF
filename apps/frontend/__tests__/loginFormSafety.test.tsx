import '@testing-library/jest-dom';
import React from 'react';
import { TextEncoder, TextDecoder } from 'util';
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useSearchParams: () => new URLSearchParams('') }));
jest.mock('@/lib/apiClient', () => ({ authApi: { login: jest.fn() } }));

import LoginForm from '@/app/(auth)/login/LoginForm';

/**
 * The server draws the login form before the page's JavaScript is running (a slow phone, or the big development bundles). A form with no
 * `method` then falls back to GET on Sign In and puts the phone number AND PASSWORD in the web address (history, logs, screenshots).
 */
describe('Login form before the page is alive', () => {
    it('is drawn by the server with the Sign In button OFF and the form set to POST (never GET)', () => {
        // the server renderer needs these in a jsdom test; a real server has them
        Object.assign(global, { TextEncoder, TextDecoder });
        const { renderToString } = require('react-dom/server');
        const html = renderToString(<LoginForm />);
        expect(html).toMatch(/<form[^>]*method="post"/i);
        expect(html).not.toMatch(/<form[^>]*method="get"/i);
        const button = html.match(/<button[^>]*type="submit"[^>]*>/i)?.[0] ?? '';
        expect(button).toMatch(/disabled/i);
    });

    it('turns Sign In on once the page is running', () => {
        render(<LoginForm />);
        expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
        expect(document.querySelector('form')).toHaveAttribute('method', 'post');
    });
});
