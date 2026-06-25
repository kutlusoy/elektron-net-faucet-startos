# Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| [`sideload.yml`](sideload.yml) | `push` of a `v*` tag, or `workflow_dispatch` | Builds the `.s9pk` and publishes a GitHub Release. **The one that actually runs.** |
| [`build.yml`](build.yml) | `workflow_dispatch` only | Stub of the Start9 marketplace build pipeline. PR-trigger is commented out for personal use; uncomment to re-adopt upstream. |
| [`release.yml`](release.yml) | `workflow_dispatch` only | Stub of the Start9 marketplace release pipeline (S3 + registry publish). Wire up `RELEASE_REGISTRY`, `S3_S9PKS_BASE_URL`, `DEV_KEY`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` before enabling. |
| [`tagAndRelease.yml`](tagAndRelease.yml) | `workflow_dispatch` only | Stub of the Start9 marketplace tag+release pipeline. |

## Cutting a release

```bash
# 1. Bump the StartOS package version (incl. the :N revision suffix) in
#    startos/versions/current.ts. Don't forget the release notes.
vim ../startos/versions/current.ts

# 2. Commit on main and tag.
git commit -am "bump to v1.2.3"
git tag v1.2.3
git push origin main --follow-tags
```

`sideload.yml` picks up the tag, builds `elektron-net-faucet.s9pk` for
`x86_64`, uploads it as a workflow artifact, and creates a GitHub Release
titled **"Elektron Net Faucet StartOS Release v1.2.3"** with the `.s9pk`
attached. Users can download the asset and install it via the StartOS
"Install from File" flow.

## Signing key

By default the workflow runs `start-cli init-key` to generate an
*ephemeral* developer signing key per build, so each release is signed
with a different key. That is fine for sideloading but means StartOS
will treat each release as a fresh package author.

To get a stable signature across releases, drop the contents of
`~/.startos/developer.key.pem` (a PEM-encoded ed25519 key) into the
repository's `DEV_KEY` secret. The workflow will then write that key to
the runner instead of generating a new one.

## start-cli install

The Start9 install script at `https://start9.com/start-cli/install.sh`
returns **HTTP 403** to GitHub-Actions runners (Cloudflare bot gate), so
the workflow pulls the `start-cli_<arch>-linux` binary straight from
the latest [`Start9Labs/start-os`](https://github.com/Start9Labs/start-os/releases)
release. If you ever need a pinned version, replace the
`releases/latest` API call with `releases/tags/<tag>`.

## Marketplace stubs

`build.yml`, `release.yml`, and `tagAndRelease.yml` mirror the
shared-workflow templates from the upstream Start9 marketplace. They are
kept around so that whoever forks this repo for marketplace adoption can
re-enable the original `on:` triggers (commented at the top of each
file) without having to track them down. None of them run automatically
in this repo.
