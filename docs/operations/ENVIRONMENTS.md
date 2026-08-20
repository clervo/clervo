# Environments

Environment contracts live under `infra/environments/` for development, test,
staging, and production. Database and queue identifiers must be unique across
all four. Staging and production must not share credentials, data, queues,
deployment approvals, or release state.

`.env.example` contains names and safe local defaults only. Real values stay
outside Git and come from the environment's secret store. The repository scans
the working tree and Git history for credential patterns.

The staging workflow is a readiness and loopback smoke gate. It does not deploy
to a provider or establish public availability. Any remote deployment requires
an explicit current task, scoped credentials, a bounded plan, rollback inputs,
and owner approval for the external mutation or cost.
