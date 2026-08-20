# Google Cloud production release

Production release commands are fail-closed wrappers around the policies in
`infra/production/gcp/`. Start with read-only plans and observations:

```sh
npm run production:gcp -- plan
npm run production:gcp:public-launch -- plan
npm run production:gcp:public-launch -- observe
```

Builds and deployments require an exact 40-character source commit, an
immutable image digest, pinned positive secret versions, and the exact
confirmation string checked by the selected script. Never use `latest` secret
versions or print secret values.

Public launch deploys a zero-traffic candidate first. Promotion requires the
candidate image to match, current product smoke checks to pass, monitoring to
acknowledge delivery, and explicit owner authorization. Rollback requires the
previous revision and exact previous image. Unknown settlement state must be
reconciled before traffic changes that could duplicate payment effects.

Cloud creation, traffic changes, IAM changes, recovery resources, and deletion
are external mutations and may incur cost. Plan inspection and local validation
do not authorize them. Follow the exact environment names and confirmation
formats emitted by the scripts rather than copying values from old reports.
