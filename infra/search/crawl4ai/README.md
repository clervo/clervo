# Crawl4AI isolation boundary

This directory is a fail-closed production specification, not deployment evidence. The worker has no Service and accepts no public/raw HTTP API. Its pod has no ingress, service-account token, host namespace, host mount, host socket, database connection, commerce secret, or direct Internet egress. The only permitted peer is the separate retrieval-authorization gateway, which must validate every document and asset URL before and after DNS resolution and verify the connected address.

The checked-in Deployment intentionally has zero replicas, an invalid image reference, `imagePullPolicy: Never`, and an engaged kill switch. N4.25 cannot pin/build/attest the runtime image or exercise the staging network because Docker/Podman, Crawl4AI, Playwright, and authenticated staging access are absent. Any reconciler applying this file therefore leaves the worker unavailable instead of creating an unproved browser.

A later authorized staging action may replace the image only with a digest-pinned image matching the exact versions and manifest hash, disengage the kill switch only after runtime attestation, and set replicas above zero only after the security drills pass. The API must report `unavailable` until that evidence exists. No Kubernetes Service should be added for this worker.
