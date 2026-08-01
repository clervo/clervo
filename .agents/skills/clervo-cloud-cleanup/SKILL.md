---
name: clervo-cloud-cleanup
description: Inventory, stop, and remove only explicitly owner-approved Clervo cloud resources while preserving unrelated and legacy assets, costs, audit history, and recovery evidence. Use for cloud cleanup, cost-exposure shutdown, disposable qualification teardown, or zero-resource verification.
---

# Clervo Cloud Cleanup

## Establish ownership and approval

1. Confirm explicit owner approval for the destructive cloud operation.
2. List the permitted project, region, resource prefixes, labels, creation window, cost ceiling, and recovery requirements.
3. Inventory read-only before mutation. Treat absent, ambiguous, shared, production, legacy, and unrelated resources as not owned.
4. Never inspect secret values, change IAM/billing, or delete backups unless the same authority explicitly names the exact action and recovery evidence.

## Clean in dependency order

1. Stop traffic and scheduled creation paths first.
2. Reconcile operations, payments, persistent data, and backups before deleting compute.
3. Remove only resources proven Clervo-owned and in scope by immutable identity, labels, and recorded creation evidence.
4. Delete dependents before networks and identities. Preserve provider audit/operation history.
5. After any unknown outcome, inventory again before retrying. Never guess that a timeout succeeded or failed.

## Prove zero exposure

Record the pre-clean inventory, exact actions, failures, retries, final direct inventory, remaining provider-managed history, active daily exposure, gross cost, owner-cash cost, provider cost, and USDC spend. Require independent negative checks for the approved prefixes and labels. Report any residual resource or cost exposure.

Do not broaden cleanup into deployment, IAM, billing, provider integration, product implementation, or legacy mutation.
