# Draft comment for issue #98 (not published)

DOC-01 decision, 1 October 2026, submission target 8 October 2026:

- Deadline eligibility uses a fresh PostgreSQL wall-clock read after acquiring the Order lock and after any I/O/state revalidation. A Buyer mutation at/after receipt_deadline_at returns 409 receipt_deadline_passed, even if the request arrived earlier and waited for the lock. A committed same-key replay remains readable after the deadline. Handler and worker race/boundary tests must share this rule.
- Receipt deadline is confirmed readable TO_BUYER delivery proof + 72 hours, not inspection result notification. There is no automatic inspection decision.
- RELEASE and full held-total REFUND share one exactly-once service and unique Order/Escrow terminal record; original successful Payment/Receipt remain immutable. Refund leaves Product CANCELLED and does not auto relist.
- Timely non-receipt report blocks AUTO while HELD until scoped audited Admin resolution. Durable return delivery survives refund failure and is retried by the worker.
- Latest local code contains UI outside HEAD; INT-01 must preserve it and freeze a reproducible complete-app candidate. Catalog-only/buyer-only runtimes are not the submission app.
- Basic profile and seller reviews are retained; push/inbox, advanced filters/admin, review photos/tags/inspection scores and wallet are deferred in the selected scope revision. Teacher acknowledgement remains pending.

Implementation/acceptance gates are tracked in doc/submission-2026-10-08/FINISH-00-release-gates.md and QA-MATRIX.md. This decision does not itself close FINISH-00 or establish release readiness.
