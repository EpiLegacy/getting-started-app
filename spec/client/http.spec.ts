import { ApiError, errorMessage, request } from '../../src/client/lib/http';

const events = new EventTarget();
const expired = jest.fn();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let fetchMock: jest.SpiedFunction<typeof fetch>;

beforeAll(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
    events.addEventListener('auth:unauthenticated', expired);
});
beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    expired.mockClear();
});
afterEach(() => fetchMock.mockRestore());
afterAll(() => {
    events.removeEventListener('auth:unauthenticated', expired);
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
});

test('successful account deletion handles an empty response and sends the session cookie', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request('/auth/me', { method: 'DELETE', body: JSON.stringify({ password: 'secret' }) })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/auth/me', expect.objectContaining({
        credentials: 'same-origin', method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    }));
});

test('an incorrect deletion password shows a useful error without ending the session', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_password' }), { status: 403 }));
    let failure: unknown;
    try { await request('/auth/me', { method: 'DELETE' }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ApiError);
    expect(errorMessage(failure)).toBe('Incorrect password. Your account has not been deleted.');
    expect(expired).not.toHaveBeenCalled();
});

test('an expired session on the profile endpoint signs the user out', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }));
    await expect(request('/auth/profile')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(expired).toHaveBeenCalledTimes(1);
});

test.each(['/auth/login', '/auth/register'])('invalid credentials on %s do not dispatch session expiration', async url => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 }));
    await expect(request(url)).rejects.toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
});

test('profile data is returned without transformation', async () => {
    const body = { user: { id: 'alice', email: 'alice@example.com', createdAt: '2026-09-24T00:00:00.000Z' } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(request('/auth/profile', { headers: { 'X-Test': 'value' } })).resolves.toEqual(body);
});

test('non-JSON server failures produce a recoverable error', async () => {
    fetchMock.mockResolvedValue(new Response('Server failure', { status: 500 }));
    await expect(request('/auth/me', { method: 'DELETE' })).rejects.toMatchObject({ code: 'request_failed' });
    expect(errorMessage(new ApiError(500, 'request_failed'))).toBe('The request failed. Please try again.');
    expect(errorMessage(new Error('network unavailable'))).toBe('The request failed. Please try again.');
});

test.each([
    ['invalid_credentials', 'Incorrect email or password.'],
    ['invalid_deletion_request', 'Enter your current password to confirm deletion.'],
    ['unauthenticated', 'Your session has expired. Please sign in again.'],
    ['auth_unavailable', 'Sign-in is temporarily unavailable. Please try again later.'],
])('explains %s to the user', (code, message) => {
    expect(errorMessage(new ApiError(400, code))).toBe(message);
});
