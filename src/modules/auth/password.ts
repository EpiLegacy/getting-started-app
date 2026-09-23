import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt, from Node's own crypto module.
 *
 * Not argon2: every argon2 package for Node is a native addon, and ADR 0001
 * (criterion C5) is removing native builds from the image, not adding one.
 * scrypt is memory-hard like argon2 and is on OWASP's list of recommended
 * password hashes.
 */
export interface ScryptParams {
    /** CPU and memory cost. A power of two. */
    N: number;
    /** Block size. */
    r: number;
    /** Parallelisation. */
    p: number;
}

/** OWASP's recommended minimum for scrypt: about 128 MiB per hash. */
export const DEFAULT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = 'scrypt';

function derive(password: string, salt: Buffer, params: ScryptParams, keyLength: number): Promise<Buffer> {
    const options: ScryptOptions = {
        N: params.N,
        r: params.r,
        p: params.p,
        // Node refuses anything above 32 MiB by default. scrypt needs 128 * N * r
        // bytes; the factor 2 leaves room for the key derivation around it.
        maxmem: 2 * 128 * params.N * params.r,
    };
    return new Promise((resolve, reject) => {
        // NFKC, as NIST SP 800-63B asks: the same password typed on two
        // keyboards can reach the server as two different byte sequences.
        scrypt(password.normalize('NFKC'), salt, keyLength, options, (error, key) =>
            error ? reject(error) : resolve(key),
        );
    });
}

/**
 * Returns `scrypt$N$r$p$salt$hash`, salt and hash in base64. The parameters
 * travel with every hash, so they can be raised later without invalidating
 * the passwords already stored.
 */
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(password, salt, params, KEY_BYTES);
    return [PREFIX, params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

function parse(stored: string): { params: ScryptParams; salt: Buffer; key: Buffer } | undefined {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== PREFIX) return undefined;

    const [N, r, p] = parts.slice(1, 4).map(Number);
    const isPositiveInteger = (n: number) => Number.isSafeInteger(n) && n > 0;
    // N must be a power of two above 1, or scrypt throws.
    if (!isPositiveInteger(N) || N < 2 || (N & (N - 1)) !== 0) return undefined;
    if (!isPositiveInteger(r) || !isPositiveInteger(p)) return undefined;

    const salt = Buffer.from(parts[4], 'base64');
    const key = Buffer.from(parts[5], 'base64');
    if (salt.length === 0 || key.length === 0) return undefined;

    return { params: { N, r, p }, salt, key };
}

/**
 * False for a wrong password and for a stored value it cannot read: a
 * corrupted row must not become an error page that reveals it exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parsed = parse(stored);
    if (!parsed) return false;

    const key = await derive(password, parsed.salt, parsed.params, parsed.key.length);
    // Constant time, so the response time says nothing about how many bytes matched.
    return timingSafeEqual(key, parsed.key);
}
