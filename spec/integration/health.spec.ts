import request from 'supertest';
import { closeServers, listen } from '../support/server';
import { createApp } from './support/app';

afterEach(closeServers);

// What the Docker HEALTHCHECK and the CI smoke test rely on.
test('GET /health answers 200 without an account', async () => {
    const res = await request(await listen(createApp())).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
});
