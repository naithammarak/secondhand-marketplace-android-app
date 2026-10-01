# 13 / HANDOVER-01 — Final demo, documents and presentation

**Priority:** P0 · **Owner:** Docs/demo Codex + presenter for rehearsal · **Depends:** prepare now; final artifacts after 11, 12 · **Target:** 7 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Complete the submission handover for the actual tested release, working in the current project folder. Read the packet README.md, DOC-01-scope.md, SRS-SUBMISSION.md, diagrams, PRESENTATION-OUTLINE.md, QA-MATRIX.md, reports/11-QA-01.md, reports/12-APK-01.md and release-manifest.json. Use the presentation/PDF/document skills when creating their artifact types. Work autonomously on concrete files; do not stop at suggesting slide topics.

Prepare repeatable synthetic demo data/setup for a successful sale, rejected/negative return refund, unpaid expiry, no-ship refund, missing-delivery Admin resolution, certificate revocation, editable profile and reviews. Seed only an isolated explicitly chosen demo DB/storage namespace; require a guard against shared/production targets, avoid real identity/card/bank data, and use actual authenticated role mappings for real integration. Do not seed fake users or reviews into the shared catalog without authorization. Timer demos use isolated test clocks/aged fixtures through the same guarded services, never a public bypass endpoint.

Produce a clean submission directory containing final standalone APK/hash, setup/start/stop guide, Thai user guide for retained roles, aligned SRS source/PDF, rendered architecture/use-case/class/state/sequence diagrams, requirement-to-test report, release manifest, synthetic demo setup/runbook, PPTX or equivalent editable slides plus PDF export, a 7–10 minute Thai speaker/demo script and recording/rehearsal checklist. Reuse the prepared scope/docs/outline; update model/routes from actual release and proof, not from future promises. Clearly label payment/shipping/payout as persisted simulations and deferred requirements as future work. Preserve the original historical SRS.

Make slides explain problem, guest→Buyer→Seller UX, architecture, one-sale/one-refund journeys, public QR, profiles/reviews, roles/privacy/one-time settlement/timers, real test evidence and limitations. Include actual redacted Android screenshots and QR from the tested demo when available. If implementation is incomplete, deliver a clearly marked rehearsal draft and a precise blocker list; do not insert unrun PASS metrics or screenshots. Export/render and visually inspect deck/PDF/diagrams for clipped text and Thai font issues.

Capture a backup screen recording through an available authorized device/tool after the real demo succeeds. If tooling cannot operate the phone/presenter, prepare exact capture and rehearsal steps and request only the manual action. Verify the final submission directory links, APK hash, manifest SHA and guide commands against the actual release. Deliver reports/13-HANDOVER-01.md and a READY/NOT_READY gate summary. Teacher acknowledgement of revised scope and oral presentation are human steps; record their status rather than claiming them done.
```

## Acceptance

- One coherent handover package with actual APK, reproducible demo and verified evidence.
- Diagrams/SRS/slides/UI use the same scope, timing, fees, roles and settlement semantics.
- No fake readiness claims; rendered artifacts reviewed; backup recording/rehearsal done or clearly pending.
