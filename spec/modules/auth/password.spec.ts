import { DEFAULT_PARAMS, hashPassword, verifyPassword } from '../../../src/modules/auth/password';

// Cheap parameters: the behaviour under test does not depend on the cost.
const FAST = { N: 2 ** 10, r: 8, p: 1 };

test('a hash verifies against the password it was made from', async () => {
    const stored = await hashPassword('correct horse battery staple', FAST);

    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
});

test('a hash does not verify against another password', async () => {
    const stored = await hashPassword('correct horse battery staple', FAST);

    expect(await verifyPassword('correct horse battery stapler', stored)).toBe(false);
});

test('the stored value carries its parameters and never contains the password', async () => {
    const stored = await hashPassword('correct horse battery staple', FAST);

    expect(stored).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    expect(stored).not.toContain('correct horse');
});

test('the same password hashes differently each time, thanks to the salt', async () => {
    const first = await hashPassword('correct horse battery staple', FAST);
    const second = await hashPassword('correct horse battery staple', FAST);

    expect(first).not.toBe(second);
});

// The only test paying the real cost: two 128 MiB hashes, which can take
// several seconds on a CI runner while other suites run alongside.
test('the default cost is the OWASP minimum for scrypt', async () => {
    expect(DEFAULT_PARAMS).toEqual({ N: 131072, r: 8, p: 1 });

    const stored = await hashPassword('correct horse battery staple');

    expect(stored.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
}, 30_000);

test('two Unicode spellings of the same password are the same password', async () => {
    // "é" as one code point, then as "e" followed by a combining accent.
    const stored = await hashPassword('café au lait du matin', FAST);

    expect(await verifyPassword('café au lait du matin', stored)).toBe(true);
});

test.each([
    ['an empty string', ''],
    ['another algorithm', 'bcrypt$10$abc$def$ghi$jkl'],
    ['a missing part', 'scrypt$1024$8$1$c2FsdA=='],
    ['a cost that is not a power of two', 'scrypt$1000$8$1$c2FsdA==$a2V5'],
    ['a cost of one', 'scrypt$1$8$1$c2FsdA==$a2V5'],
    ['a non-numeric block size', 'scrypt$1024$x$1$c2FsdA==$a2V5'],
    ['an empty salt', 'scrypt$1024$8$1$$a2V5'],
    ['an empty hash', 'scrypt$1024$8$1$c2FsdA==$'],
])('a stored value that is %s never verifies, and never throws', async (_label, stored) => {
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(false);
});
