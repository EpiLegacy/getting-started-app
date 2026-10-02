import http from 'http';

/*
 * One real server per test, listening before the first request. Handing
 * supertest the bare Express app makes it open and close a server on a fresh
 * ephemeral port for every request, and under a quick burst of requests a
 * recycled port occasionally answered with something that is not HTTP
 * ("Parse Error: Expected HTTP/").
 */
const servers: http.Server[] = [];

export async function listen(app: http.RequestListener): Promise<http.Server> {
    const server = http.createServer(app);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return server;
}

// Every spec that calls listen() registers this with afterEach or afterAll.
export async function closeServers(): Promise<void> {
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
}
