# External shipping and refunds: implementation checkpoint

This is a draft backend checkpoint for teammate development, based on PR #129
(`b531bd1372c0d26b8492fa28ff29ab20a85d7578`). It preserves that branch's profile,
reviews and certificate revocation implementation. It is not final R1–R4 acceptance.

## Included behavior

- New Orders persist `EXTERNAL_V2`; migrated Orders retain `LEGACY_V1`.
- Seller shipping to the center and Inspector physical receipt do not require a
  Courier account or shipping photos under the new policy.
- Positive inspection results have a persisted 72-hour Buyer decision window.
  A sixth lifecycle job records a SYSTEM timeout that authorizes return without
  inventing a Buyer decision or moving money.
- Admin demo shipping events are distinct from actual recipient confirmation.
  Buyer receipt works after authorized dispatch; AUTO requires a trusted delivered
  event and its separate 72-hour deadline. A missing-delivery report blocks AUTO.
- Seller or audited Admin return confirmation commits before the separate refund
  attempt. Failed settlement remains pending for retry.
- Positive-result rejection or timeout refunds the item price after actual return:
  held 1,350 = refund 1,200 + inspection 100 + shipping 50. Negative-result,
  no-ship, audited non-receipt and legacy refund rules remain full-refund.
- Successful sale keeps the existing 5% item commission and one settlement ledger.
- Migration `r01e20261002` follows `c08f20261002`; unsafe downgrade with new-policy
  data refuses rather than deleting or rewriting financial history.

## Verification at publication

- Default backend suite: **627 passed, 373 skipped**. The skipped cases require
  separate environment setup; they are not counted as passed.
- New-policy normal API journeys on owned PostgreSQL: **21 passed**.
- Legacy upgrade, safe downgrade/re-upgrade, unsafe downgrade refusal and event
  access controls on owned PostgreSQL: **3 passed**. Representative legacy sale,
  return, review and revocation records are created through the prior API source.
- Existing legacy FINISH API/worker regressions on owned PostgreSQL: **45 passed**.
  The retained five jobs remain eligible for their old-policy fixtures; the new
  timeout job is ineligible there. A concurrent worker test now checks catch-up
  after a late HTTP transaction releases a lock, since bounded scans can skip it.
- Composed B/C/D normal API regressions on owned PostgreSQL: **4 passed**,
  including Seller-as-Buyer sale, persisted review and certificate revocation.

PostgreSQL tests use the disposable `ab-amendment-pg-20261002` container on local
port 55452. No shared database migration, deployed worker or live server change
was performed. Existing dependency deprecation warnings remain.

## Remaining acceptance work

The draft still needs additional new-policy cutoff/lock-wait, opposing-action
and direct constraint checks, complete active SRS/QA/diagram alignment, concrete
E API mapping and independent review of the final remote commit. Historical
reports and older document bodies must not be treated as new-policy acceptance.
Frontend integration, carrier/payment providers, shared deployment and Android
acceptance remain outside this backend checkpoint.

Demo shipping events require both the existing fulfillment simulation setting
and `EXTERNAL_SHIPPING_DEMO_ENABLED=true`. The example config defaults the new
flag to false. Obtain environment credentials privately; none are included.
