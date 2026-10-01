#!/bin/sh
# Deploys one released version of the application, on the server itself.
#
#   ./deploy.sh 1.2.0
#
# Pulls that version, migrates the database with it, starts it, and waits
# until every service reports healthy. If the new version does not come up,
# the version that was running before is started again, so a failed
# deployment leaves the previous one serving rather than nothing.
#
# The GitHub "Deploy" workflow runs this over SSH (docs/deployment.md); it runs
# the same way by hand, which is how a rollback is done: deploy the previous
# version again.
set -eu

usage() {
    echo "usage: $0 <version>   e.g. $0 1.2.0" >&2
    exit 2
}

[ $# -eq 1 ] || usage
version=$1
# A version is a registry tag: nothing that could be read as a shell word or
# a path. v1.2.0 and 1.2.0 both work, as release tags carry the "v".
case $version in
    v[0-9]*) version=${version#v} ;;
esac
case $version in
    '' | *[!0-9A-Za-z._-]*) echo "invalid version: $1" >&2; usage ;;
esac

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "no .env next to compose.yml: copy .env.example and fill it in" >&2
    exit 1
fi

# How long "up --wait" gives the stack to become healthy, migrations included.
timeout=${DEPLOY_TIMEOUT:-300}

compose() {
    docker compose --file compose.yml "$@"
}

start() {
    APP_VERSION=$1 compose up --detach --wait --wait-timeout "$timeout" --remove-orphans
}

previous=$(cat .deployed-version 2>/dev/null || true)
echo "Deploying $version (running: ${previous:-nothing})"

# Refuses to go further with a missing variable, before anything changes.
APP_VERSION=$version compose config --quiet

# A version that does not exist fails here, while the previous one still runs
# untouched. DEPLOY_PULL=0 is for rehearsals on images built locally.
if [ "${DEPLOY_PULL:-1}" != 0 ]; then
    APP_VERSION=$version compose pull --quiet migration api worker
fi

if ! start "$version"; then
    echo "::error::$version did not become healthy" >&2
    compose ps --all >&2 || true
    compose logs --no-color --tail 50 migration api worker >&2 || true

    if [ -n "$previous" ] && [ "$previous" != "$version" ]; then
        echo "Rolling back to $previous" >&2
        # Migrations only move forward: the previous version runs against the
        # new schema, which is why a migration must stay compatible with the
        # version before it (docs/deployment.md).
        if start "$previous"; then
            echo "Rolled back: $previous is serving again" >&2
        else
            echo "::error::the rollback to $previous failed too" >&2
        fi
    fi
    exit 1
fi

echo "$version" > .deployed-version
# Old versions stay pullable from the registry; they need not fill the disk.
docker image prune --force >/dev/null
echo "Deployed $version"
