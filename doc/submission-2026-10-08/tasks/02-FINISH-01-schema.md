# 02 / FINISH-01 — Versioned external-shipping schema

**Priority:** P0 · **Owner:** Backend/DB · **Depends:** 01 · **Amendment:** R1

Current backend candidate is PR130; historical accepted A/B/C/D work and legacy references remain separate evidence. See [amendment scope](../coordination/AB-AMENDMENT-SCOPE.md). E/native/shared rollout acceptance is separate.

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R1 on PR130, codex/ab-external-shipping-2026-10-02, based on reviewed PR129 b531bd1372c0d26b8492fa28ff29ab20a85d7578. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md before older references. Preserve historical accepted A/B/C/D migrations and branch history.

Use the one existing model/settlement/command architecture. All existing Orders retain LEGACY_V1; new server-created Orders snapshot EXTERNAL_V2. Clients cannot select policy, money, parties or deadlines. Persist atomic positive result availability+72h, separate SYSTEM timeout outcome, actual recipient source/command and trusted transport event source/identity/leg/server time. Preserve immutable Payment/Receipt, old Courier/proof evidence and one settlement; do not create a second ledger. Migration r01e20261002 descends from c08f20261002. Test owned PostgreSQL actual legacy journeys, fresh install, constraints/default-deny access, safe legacy-only downgrade/re-upgrade and explicit unsafe-new-data refusal without rewriting history.

Return address remains owning Seller validated/frozen before TO_CENTER. Keep Order→Shipment→Escrow→Product locks as applicable. Keep active scope/SRS/requirements/QA/diagrams consistent with new policy and historical references clearly qualified. Deliver reports/EXTERNAL-SHIPPING-R1.md and concrete API mapping for E; report exact source/head and commands, not shared/device acceptance.
```

## Acceptance

- Follow the concrete amendment acceptance in EXTERNAL-SHIPPING-03 and AB-AMENDMENT-SCOPE.
- Record actual head/base, migration, commands and evidence; no legacy or mock PASS is relabeled as new-policy acceptance.
- Preserve historical/shared/private/UI state and deliver through the same reviewed branch.
