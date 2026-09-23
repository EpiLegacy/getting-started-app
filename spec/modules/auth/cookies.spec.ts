import { readCookie, sessionCookieOptions } from '../../../src/modules/auth/cookies';

test.each([
    ['no header', undefined, undefined],
    ['an empty header', '', undefined],
    ['the only cookie', 'sid=abc', 'abc'],
    ['one cookie among others', 'theme=dark; sid=abc; lang=fr', 'abc'],
    ['spaces around it', '  sid = abc  ;theme=dark', 'abc'],
    ['a cookie whose name only ends like it', 'xsid=abc', undefined],
    ['a pair without "="', 'garbage; sid=abc', 'abc'],
    ['percent-encoding', 'sid=a%2Bb', 'a+b'],
    ['malformed percent-encoding', 'sid=%E0%A4%A', undefined],
    ['the first of two cookies with the name', 'sid=first; sid=second', 'first'],
])('reading "sid" from %s', (_label, header, expected) => {
    expect(readCookie(header, 'sid')).toBe(expected);
});

test('the session cookie is invisible to page scripts and never sent cross-site', () => {
    expect(sessionCookieOptions(false, 1000)).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 1000,
    });
});

test('the Secure attribute follows the configuration', () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
});

test('without a lifetime, no maxAge is set, which is what clearing a cookie needs', () => {
    expect(sessionCookieOptions(false)).not.toHaveProperty('maxAge');
});
