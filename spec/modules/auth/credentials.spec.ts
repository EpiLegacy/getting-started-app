import { loginSchema, registerSchema } from '../../../src/modules/auth/credentials';

const PASSWORD = 'correct horse battery staple';

test('the email is trimmed and lowercased', () => {
    const parsed = registerSchema.parse({ email: '  Alice@Example.COM ', password: PASSWORD });

    expect(parsed.email).toBe('alice@example.com');
});

test.each([
    ['not an address', 'alice'],
    ['no domain', 'alice@'],
    ['a space inside', 'ali ce@example.com'],
    ['longer than 254 characters', `${'a'.repeat(245)}@example.com`],
])('an email that is %s is rejected', (_label, email) => {
    expect(registerSchema.safeParse({ email, password: PASSWORD }).success).toBe(false);
});

test('registering needs at least 12 characters', () => {
    expect(registerSchema.safeParse({ email: 'a@b.io', password: 'a'.repeat(11) }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.io', password: 'a'.repeat(12) }).success).toBe(true);
});

test('no password is longer than 128 characters, so none is expensive to hash', () => {
    expect(registerSchema.safeParse({ email: 'a@b.io', password: 'a'.repeat(129) }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.io', password: 'a'.repeat(129) }).success).toBe(false);
});

test('logging in accepts a short password, so that it gets the same answer as any wrong one', () => {
    expect(loginSchema.safeParse({ email: 'a@b.io', password: 'short' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.io', password: '' }).success).toBe(false);
});

test.each([
    ['no body', undefined],
    ['a missing password', { email: 'a@b.io' }],
    ['a number for a password', { email: 'a@b.io', password: 123456789012 }],
])('%s is rejected', (_label, body) => {
    expect(registerSchema.safeParse(body).success).toBe(false);
});
