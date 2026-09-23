import { hashSessionToken, newSessionToken } from '../../../src/modules/auth/tokens';

test('a session token is 256 random bits, URL-safe', () => {
    const token = newSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
});

test('two session tokens are never the same', () => {
    const tokens = new Set(Array.from({ length: 1000 }, newSessionToken));

    expect(tokens.size).toBe(1000);
});

test('a token is stored as its SHA-256, in hexadecimal', () => {
    // echo -n abc | shasum -a 256
    expect(hashSessionToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
