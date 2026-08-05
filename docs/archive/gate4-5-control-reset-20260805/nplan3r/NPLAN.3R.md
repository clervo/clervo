# NPLAN.3R — Repair acceptance-run handoff contradiction

## Authority

The owner's standing instruction treats a failed closeout check as a bounded
repair ticket. An independent read-only NPLAN.3 review found one contradiction
between the external master-plan handoff and the preserved repository evidence.

## Exact scope

1. Correct only the external master-plan statement about canonical acceptance.
2. Preserve that the accidental run happened once during incomplete edits,
   failed at typecheck with exit 1, and was not rerun.
3. Preserve that the Stage 4 verifier did not run.
4. Record the repair without changing NPLAN.3 evidence, product behavior,
   lifecycle, stage order, ticket authority, benchmark evidence, or cloud and
   payment state.

## Validation

- Exact repaired text must occur in the external master-plan handoff.
- The contradictory sentence must be absent.
- NPLAN.3's original external-master hash remains immutable historical evidence;
  this repair records the new hash.
- Secret scan, clean-room boundary, and Git diff integrity must pass.

## Stop

Commit this repair atomically. Do not begin NPLAN.4 or product implementation in
this ticket.
