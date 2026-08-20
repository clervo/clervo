# ADR-0003: CI and environment isolation

- Status: accepted

CI uses pinned GitHub Actions, installs the committed dependency graph without
lifecycle scripts, and runs `npm test`. The repository-local secret scanner
checks the working tree and Git history without printing matched values.

Development, test, staging, and production have separate database, queue,
secret, data, and approval boundaries. Staging is private by default and must
not share production state. A local smoke test proves the application contract;
it does not prove a remote deployment or public availability.

Remote deployments require current scoped credentials, an immutable release
identity, bounded resources, explicit approval for external mutation or cost,
and a tested rollback path.
