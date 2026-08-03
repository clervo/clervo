# Package release

The candidate package archives are built from the frozen Stage 12 interface.
This procedure publishes no API deployment and does not change capability
lifecycle.

## One-time account setup

After the public `clervo/clervo` repository exists:

1. Create a protected GitHub environment named `package-release` with required
   owner review. While the organization has only one member, self-review must
   remain enabled or every release deadlocks; the exact commit and confirmation
   checks remain mandatory. Disable self-review after adding another trusted
   release reviewer.
2. For both `@clervo/sdk` and `@clervo/mcp`, configure the npm trusted publisher
   as GitHub organization `clervo`, repository `clervo`, workflow
   `publish-packages.yml`, environment `package-release`, allowed action
   `npm publish`.
3. For PyPI project `clervo-sdk`, configure its GitHub trusted publisher with
   owner `clervo`, repository `clervo`, workflow `publish-packages.yml`, and
   environment `package-release`.

No npm or PyPI write token belongs in GitHub, this repository, or chat. The
workflow uses short-lived OIDC credentials and a public-repository provenance
record.

## Release

Before dispatch, run:

```sh
npm run test:stage13:distribution
npm run verify:distribution-release:registry
```

Dispatch `Publish verified packages` from the default branch. Enter the exact
40-character main-branch commit and the confirmation string shown by the
workflow, then approve the protected environment.

The workflow verifies that all three versions are unpublished before the first
publish. It publishes the TypeScript SDK, then the MCP package that depends on
it, then the Python distributions. If any publish succeeds and a later publish
fails, do not blindly rerun: registry versions are immutable and the preflight
will fail. Inspect the published artifacts and provenance, reconcile the exact
partial state, increment only versions that require a new artifact, and update
the release target manifest before another approved run.

## Legacy releases

After all three replacement versions are observed in their registries, apply
`packages/distribution/legacy-release-policy.v1.json`. Deprecate the stale npm
previews with the exact bounded messages in that file. Preserve npm and PyPI
history; do not unpublish, delete, or yank ordinary legacy releases. Deletion is
reserved for a confirmed compromise or malicious artifact and requires owner
approval. The unsupported `clervo@0.0.0` and `@clervo/beacon@0.1.0` releases
receive explicit deprecation notices rather than invented replacements.
