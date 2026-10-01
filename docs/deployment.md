# Deployment

[Back to README](../README.md) · [Releases](release.md)

A release is deployed to production without anyone logging in to the server:

```text
git tag v1.2.0  ->  Release workflow      ->  Deploy workflow
                    gate, image 1.2.0         SSH to the server, deploy.sh 1.2.0,
                    GitHub release            check https://<domain>/health
```

- [What runs on the server](#what-runs-on-the-server)
- [How a deployment works](#how-a-deployment-works)
- [Rolling back](#rolling-back)
- [Setting up a server](#setting-up-a-server)
- [Rehearsal in CI](#rehearsal-in-ci)

## What runs on the server

`deploy/compose.yml` describes the production stack. Nothing is built on the
server: every service runs a published image.

| Service | Image | Role |
| --- | --- | --- |
| `proxy` | `caddy` | The only published ports, 80 and 443. Gets and renews the HTTPS certificate, and hides `/metrics`. |
| `migration` | the application, at the deployed version | Applies `drizzle/` migrations, then exits. |
| `api` | the application, at the deployed version | The API and the frontend. |
| `worker` | the application, at the deployed version | The notifications worker. |
| `mysql`, `rabbitmq` | `mysql:8.4`, `rabbitmq:4-alpine` | Not reachable from outside. |

Credentials live in `.env` next to `compose.yml`, on the server only. Every
one of them is required: a missing value stops the deployment before anything
changes.

## How a deployment works

`deploy/deploy.sh <version>`, run on the server by the Deploy workflow:

1. checks `.env` and the Compose file;
2. pulls that version. If it does not exist, it stops here, and the running
   version is untouched;
3. starts it: `migration` must succeed before `api` and `worker` start, and
   every service must report healthy within five minutes;
4. if anything fails, it starts the previous version again and exits with an
   error, so the workflow run fails and the previous version keeps serving;
5. otherwise, records the version in `.deployed-version`.

The workflow then checks `https://<domain>/health` from outside, through DNS,
the certificate and the proxy.

## Rolling back

Run the **Deploy** workflow by hand (*Actions*, *Deploy*, *Run workflow*) with
the previous version, for example `1.1.0`. From the server itself,
`./deploy.sh 1.1.0` does the same.

Migrations only move forward: a rollback runs the previous version against the
new schema. A migration must therefore keep working with the version before it.
For example, add a column in one release and only remove the old one in a later
release.

## Setting up a server

Any Linux machine with Docker Engine and the Compose plugin, and a domain name
that points at it. This is done once.

1. Create a `deploy` user that can run Docker, and install the public half of a
   dedicated SSH key in its `~/.ssh/authorized_keys`.
2. Open ports 80 and 443.
3. As that user, create the directory and its `.env`:

   ```sh
   mkdir -p ~/legacy-kanban && cd ~/legacy-kanban
   # Copy deploy/.env.example from the repository to .env, then fill it in.
   chmod 600 .env
   ```

4. In the repository, under *Settings*, *Environments*, *production*, add:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `DEPLOY_HOST` | The server's address. |
   | Variable | `DEPLOY_USER` | `deploy` |
   | Variable | `DEPLOY_URL` | `https://<domain>` |
   | Variable | `DEPLOY_PATH` | Optional, defaults to `legacy-kanban` in the user's home. |
   | Secret | `DEPLOY_SSH_KEY` | The private half of the SSH key. |
   | Secret | `DEPLOY_KNOWN_HOSTS` | The output of `ssh-keyscan <server>`, checked against the server. |

5. Deploy the current release: *Actions*, *Deploy*, *Run workflow*.

Until these values are set, releases still succeed, and the Deploy run says
that nothing was deployed.

The first deployable version is the first one released after this guide:
`1.0.0` predates the migration script the deployment runs.

## Rehearsal in CI

Every pull request runs the **Deployment rehearsal** job. It deploys the image
built from the pull request on the runner, with `deploy.sh` and
`deploy/compose.yml` exactly as a server would. It then:

- checks, through the proxy, that the application answers, `/metrics` stays
  hidden, and a visitor can register and list their tasks;
- deploys an image that cannot start, and checks that the previous version is
  serving again.

A change that would break deploying fails there, before it can reach a release.
To play the same rehearsal locally, see the `rehearsal` job in
`.github/workflows/ci.yml`.
