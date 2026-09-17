# Releasing

The pipeline builds and publishes a container image to
`ghcr.io/epilegacy/getting-started-app` on every merge to `main`. That image is
a development build. A **release** is a separate, deliberate act: it names a
version, re-verifies the exact tree, and records what changed.

## Image tags

| Tag | Points at | Use it for |
| --- | --- | --- |
| `edge` | the tip of `main` | trying out what was merged today |
| `sha-<commit>` | one commit, forever | anything that must be reproducible |
| `1.2.3` | a released version | pinning a deployment |
| `1.2` | the newest patch of 1.2 | following patches automatically |
| `latest` | the newest release | a quick demo |

`sha-<commit>` is the only tag that never moves. Every other tag is a pointer
that a later build can take over, so a deployment that has to be reproducible
pins the SHA.

`latest` follows releases, not `main`. A prerelease never takes it.

## Cutting a release

Versions follow [semantic versioning](https://semver.org). Tag a commit that is
already on `main` and already green:

```sh
git checkout main
git pull --ff-only
git tag -a v1.2.0 -m "Sprint 2: priorities and deadlines"
git push origin v1.2.0
```

Pushing the tag starts `.github/workflows/release.yml`, which:

1. re-runs the full gate (types, lint, tests, build) on the tagged tree;
2. builds the image and pushes it under the tags above;
3. creates the GitHub release, with notes generated from the merged pull
   requests since the previous tag.

If the gate fails, nothing is published. Delete the tag, fix `main`, tag again:

```sh
git push origin :refs/tags/v1.2.0
git tag -d v1.2.0
```

A tag carrying a suffix, such as `v1.3.0-rc.1`, is published as a prerelease
and does not move `latest`.

## Rolling back

Releases are immutable, so rolling back is running the previous one again
rather than undoing anything:

```sh
docker pull ghcr.io/epilegacy/getting-started-app:1.1.0
```

Never delete or re-point a released tag to work around a bad build. Publish the
fix as a new patch version, so the history of what ran stays readable.

## What is not automated yet

Nothing deploys. The pipeline delivers a verified, versioned, retrievable
artefact, which is where continuous delivery stops until the team decides where
the application runs. Once a target exists, the deployment step consumes the
tags above; it does not change how they are produced.
