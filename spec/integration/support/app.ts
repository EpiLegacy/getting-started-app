import { createApp as createApplication } from '../../../src/app';
import { isDrizzleConfigured } from '../../../src/infrastructure/db/drizzle';
import { drizzleAuthRepository } from '../../../src/modules/auth/repository.drizzle';
import { createAuthService } from '../../../src/modules/auth/service';

export function createApp() {
    const app = createApplication(isDrizzleConfigured() ? createAuthService(drizzleAuthRepository) : undefined, false);
    app.set('env', 'production');
    return app;
}
