# Package release

Package versions and published artifact integrity are defined by
`packages/distribution/release-targets.v1.json`. Verify the current candidate
before dispatching a release:

```sh
npm run test:b13:clients
npm run test:b11
npm run verify:distribution-release:registry
npm run verify:package-consumers
```

The protected GitHub workflows publish through OIDC/trusted publishing. npm or
PyPI write tokens do not belong in GitHub secrets, this repository, or chat.
Each workflow requires the exact main-branch commit and confirmation string.

Registry versions are immutable. If a multi-package publish partially succeeds,
do not rerun blindly: inspect the public artifacts and provenance, reconcile the
exact state, increment only versions that require a new artifact, and update the
release target before another approved run. Preserve earlier releases; removal
is reserved for a confirmed compromise and requires owner approval.
