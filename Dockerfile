# syntax=docker/dockerfile:1

# Kept in sync with .nvmrc: a single source of truth for the Node version.
ARG NODE_VERSION=24

# Debian "slim" rather than Alpine: glibc avoids native-binary issues, today
# with sqlite3 and tomorrow with the Prisma engines.
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# ---------------------------------------------------------------------------
# deps - every dependency, dev ones included (required to compile)
# ---------------------------------------------------------------------------
FROM base AS deps

# TEMPORARY: sqlite3 builds from source whenever no prebuilt binary exists for
# this Node version. These lines go away once Prisma + MySQL land
# (audit sections 2.2 and 7.2).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copied on their own: the install layer is only invalidated when dependencies
# change, not on every source edit.
COPY package.json package-lock.json ./
# NODE_ENV=production makes npm skip devDependencies, hence the explicit flag.
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev

# ---------------------------------------------------------------------------
# build - types checked, backend compiled, frontend bundled
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json vite.config.mts ./
COPY src ./src

# A type error fails the image build: it can never reach a published artifact.
RUN npm run typecheck

RUN npx tsc -p tsconfig.build.json   # src/**/*.ts -> build/
RUN npm run build                    # vite -> dist/

# ---------------------------------------------------------------------------
# prod-deps - runtime dependencies only
# ---------------------------------------------------------------------------
FROM deps AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---------------------------------------------------------------------------
# runtime - final image: no TS sources, no toolchain, no dev dependencies
# ---------------------------------------------------------------------------
FROM base AS runtime

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/build        ./build
COPY --from=build     /app/dist         ./dist
COPY package.json ./

# TEMPORARY: the "node" user cannot write to /etc/todos, the default SQLite
# path. Goes away once MySQL is the only supported engine.
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV SQLITE_DB_LOCATION=/app/data/todo.db

# Never root: an application flaw must not grant control over the container.
USER node

EXPOSE 3000

# Switch to /health as soon as that endpoint exists (audit section 2.4).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/items').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form: node runs as PID 1 and receives SIGTERM, so the graceful shutdown
# already implemented in src/index.ts actually runs.
CMD ["node", "build/index.js"]
