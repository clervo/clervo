---
name: clervo-cloud-cleanup
description: Inventory, stop, and remove only exact Clervo ticket-owned cloud resources while preserving unrelated and legacy assets, costs, audit history, and recovery evidence. Use for an explicitly authorized Clervo cloud cleanup, cost-exposure shutdown, disposable qualification teardown, or zero-resource verification.
---

# Clervo Cloud Cleanup

## Establish authority and ownership

1. Invoke `$clervo-engineering-stage` and read the active ticket or exact maintenance authorization.
2. List the permitted project, region, resource prefixes, labels, creation window, cost ceiling, evidence path, and stop condition.
3. Inventory read-only before mutation. Treat absent, ambiguous, shared, production, legacy, and unrelated resources as not owned.
4. Never inspect secret values, change IAM/billing, or delete backups unless the same authority explicitly names the exact action and recovery evidence.

## Clean in dependency order

1. Stop traffic and scheduled creation paths first.
2. Reconcile operations, payments, persistent data, and backups before deleting compute.
3. Remove only resources proven ticket-owned by immutable identity, labels, and recorded creation evidence.
4. Delete dependents before networks and identities. Preserve provider audit/operation history.
5. After any unknown outcome, inventory again before retrying. Never guess that a timeout succeeded or failed.

## Prove zero exposure

Record the pre-clean inventory, exact actions, failures, retries, final direct inventory, remaining provider-managed history, active daily exposure, gross cost, owner-cash cost, provider cost, and USDC spend. Require independent negative checks for ticket prefixes and labels. Append the result to the build journal, commit repository evidence, report any residual resource, and stop.

Do not broaden cleanup into deployment, IAM, billing, provider integration, product implementation, legacy mutation, or another ticket.
