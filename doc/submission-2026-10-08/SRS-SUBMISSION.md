# 2NDHAND — Submission Software Requirements Specification

> **แผนแก้ล่าสุด 2 ต.ค.:** อ่าน [ขนส่งภายนอก + เงินคืน / R1–R6](changes/EXTERNAL-SHIPPING-03.md) ก่อน กติกานี้แทน Courier-required flow และคืนเต็มในกรณี Buyer ปฏิเสธ/หมดเวลาผลตรวจ; implementation และการปรับ traceability/QA ทุกกรณียังเป็นงานถัดไป หลักฐานผ่านกติกาเดิมไม่ใช่ผ่านกติกาใหม่

Version: submission-2026-10-01 · Target: Thursday, 8 October 2026 · Timezone: Asia/Bangkok

Status: Scope selected by the project owner on 1 October 2026. Implementation and final acceptance are pending. Teacher acknowledgement of revised scope is not established by this document.

## 1. Purpose and authority

2NDHAND is an Android prototype for fixed-price secondhand clothing/accessory sales with central inspection, public digital certificates, held funds and evidence-based delivery. The submission demonstrates both a successful sale and a returned-item full refund.

This specification replaces conflicting submission rules in the historical SRS revision 1.5 dated 25 August 2026. The original PDF remains a historical reference. DOC-01-scope.md records the owner's selected changes; PROFILE-REVIEWS-contract.md defines the new APIs; references/FINISH-spec.md defines detailed transactions and errors, subject to the current release gate and route mapping.

Requirement IDs FR-01–FR-49 and NFR-01–NFR-10 are preserved for traceability. A revised or deferred requirement is a scope change, not evidence that the original requirement was fulfilled. Every retained behavior needs evidence on the combined release and a real Android APK.

## 2. Scope, users and external systems

The retained system includes public catalog discovery, Google authentication, default Buyer registration, seller approval, fixed-price listings, persisted simulated payment/receipt/escrow, center inspection, certificates, Buyer result decisions, final delivery/return, exactly-once release/refund, lifecycle jobs, basic profile, seller reviews and minimal operational Admin actions.

Guest users browse/search/detail/reviews and public certificates without login. New Google users are BUYER. Approved SELLER users keep Buyer capabilities and can publish/manage eligible products. INSPECTOR, COURIER and ADMIN are assigned staff roles; clients cannot select them. Active account and resource-ownership authorization is enforced on the server, not only by navigation.

Architecture: Expo Android client; FastAPI service; PostgreSQL business records; Google identity via the configured Auth provider; private Storage for sensitive evidence; public HTTPS certificate views; scheduled server worker. Payment, carrier and payout providers are simulated. Internal state, money allocation, receipt and settlement are persisted and guarded as real business operations. No real bank transfer, carrier integration or tax invoice is claimed.

## 3. Retained functional requirements

| ID | Submission requirement |
|---|---|
| FR-01 | Verified first Google login creates one active BUYER linked to the provider identity. No first-login role selector grants Seller/staff rights. |
| FR-02 | Existing users authenticate through Google; profile display-name edits persist across subsequent logins. |
| FR-03 | Private profile displays backend name/email/role/status. Active users edit their own display name only. Password changes, avatar, address book and self-service account deletion are deferred. |
| FR-04 | Buyer requests Seller approval in Profile; identity/bank demonstration evidence stays private. Existing Admin verification decision governs Seller capability. Demo fixtures use synthetic identity data. |
| FR-05 | Approved active Seller publishes a listing with the fields/images required by the existing product contract. Buyer or unapproved Seller cannot publish. |
| FR-06 | Fixed-price sale only. Auction is deferred. |
| FR-07 | Owning Seller edits/cancels listings only in permitted unreserved states. Reserved/sold stock cannot be reopened through an edit. |
| FR-08 | Guest and signed-in users search/browse the public catalog and use retained, implemented category filters. Advanced brand/price/size/condition filters are deferred. |
| FR-09 | Product detail shows actual product data and persisted seller review aggregates/list. No separate trust-score algorithm or synthetic API-mode ratings. |
| FR-10 | Eligible Buyer, including Seller acting as Buyer, creates an Order from validated quote/address snapshots. Reservation prevents simultaneous purchases of the same stock. |
| FR-11 | Explicitly simulated payment persists successful Payment/Receipt/Escrow once. Timeout/retry is resolved from backend state; no real PromptPay/card/banking is claimed. |
| FR-12 | Successful payment holds the complete Order amount until one eligible RELEASE or REFUND. |
| FR-13 | Owning Seller supplies a validated immutable return-address snapshot before sending the paid item to the inspection center. Shipping is rejected at/after the no-ship deadline. |
| FR-14 | Assigned Courier operates authorized shipment legs and records private delivery proof; transport is simulated, evidence and states are persisted. |
| FR-15 | Assigned Inspector records center receipt through the canonical inspection receive operation, with the required proof and server time. |
| FR-16 | Assigned Inspector evaluates authenticity, condition and description match. Final result is PASS, MINOR_ISSUE, NOT_AS_DESCRIBED or FAKE. |
| FR-17 | Final result and required private evidence are persisted with valid ownership and immutable final history. |
| FR-18 | Buyer reads the committed result/evidence through the authorized result screen and refresh. Push/email/inbox delivery is not claimed. |
| FR-19 | Owning Buyer selects CONFIRM or REJECT once for PASS/MINOR_ISSUE. Negative results return without CONFIRM; no automatic result decision. |
| FR-20 | PASS/MINOR_ISSUE certificate is issued atomically with final inspection, before Buyer decision. Negative results never issue a qualifying certificate. |
| FR-21 | Certificate uses an opaque public token/QR pointing to the reachable HTTPS certificate origin. |
| FR-22 | Any person verifies public certificate status without login. Public views exclude identity/address/private evidence. Invalid tokens are not valid certificates. |
| FR-23 | Active Admin revokes an incorrect certificate through a reasoned audited command. Public/native views show REVOKED. Revocation does not rewrite inspection, receipt or settlement. |
| FR-24 | Proven Buyer delivery followed by eligible physical receipt or eligible 72-hour worker release atomically completes Order and records simulated Seller payout from original snapshots. |
| FR-25 | Proven return, Seller no-ship or audited non-receipt resolution refunds the full held total once. Original successful payment/receipt stays immutable; refunded Product is CANCELLED, not automatically relisted. |
| FR-26 | Successful persisted simulated charge creates a retrievable receipt. A refund has a separate settlement reference. No legally issued tax invoice is represented. |
| FR-37 | Revised: actual active Order Buyer submits one seller rating 1–5 and optional purchase/item-experience comment after COMPLETED plus RELEASED. No separate product/inspection scores, photos, tags or replies. |
| FR-41 | Revised: retain seller-application approval and minimal assignment/non-receipt/revocation operations. Wider account administration/suspension UI and its automatic refund policy are deferred. Existing status/auth guards remain enforced. |

## 4. Additional retained lifecycle requirements

- Final shipment direction is server-derived: positive result plus CONFIRM sends TO_BUYER; positive REJECT or negative result sends TO_SELLER. At most one final direction exists. Buyer and Seller destinations come from validated immutable Order snapshots.
- Assigned active Courier confirmation selects 1–3 distinct private, readable, server-bound JPEG/PNG proof objects. Upload alone does not confirm delivery. Confirmation time and selected IDs are immutable.
- Buyer physical receipt is separate from inspection acceptance. A timely non-receipt report keeps Escrow HELD and blocks automatic release. Scoped audited Admin evidence review resolves one RELEASE or REFUND.
- Return delivery is committed durably before attempting refund. If settlement fails, RETURNED_TO_SELLER plus HELD remains visible and the worker retries; delivery evidence is not lost.
- One Order/Escrow receives exactly one immutable RELEASE or REFUND. Server derives recipients/amounts; Decimal allocations conserve the original held amount. Commands use stable idempotency keys and safely replay committed outcomes.
- Server jobs work without HTTP traffic: unpaid expiry, receipt release, Seller no-ship refund, return-refund retry and inspection overdue escalation. Outage/readability failure remains pending and observable, then retries.

## 5. Profile, reviews and privacy detail

Profile endpoints target GET /profile, PATCH /profile and POST /profile/policy-acknowledgement, subject to reuse of a compatible existing route. Edits accept only trimmed 1–100 character full_name without control characters. Email, role, status, provider ID and addresses are readonly through this API. Nullable policy version/time record actual acknowledgement; legacy accounts are not backfilled with invented consent.

Review endpoints target GET/POST /orders/{id}/review and public GET /sellers/{id}/reviews. Eligibility is server-derived from actual Buyer ownership and COMPLETED/RELEASED state. Unique Order review and command replay prevent duplicates. Comment is optional, at most 1,000 characters and rendered as plain text. Public reviewer label is a generic verified-purchase label; buyer/order IDs, real names, email, phone and addresses are excluded. Count, average and distribution are calculated from persisted reviews, not mocked or from the current page only. Zero reviews has null average.

Readable Thai prototype policy states data purposes, private evidence access, contact through the actual demo administrator and limitations. Policy acknowledgement is not blanket consent for photo reuse or a legal compliance certification. Optional photo reuse, automated export/delete and a general privacy request system are deferred; unsupported promises/actions are removed from UI.

## 6. Explicitly deferred original requirements

| ID | Deferred scope |
|---|---|
| FR-27 | Auction creation. |
| FR-28 | Auction bidding. |
| FR-29 | Auction bid notifications. |
| FR-30 | Automatic auction closing. |
| FR-31 | Auction winner/payment handling. |
| FR-32 | Buyer/Seller chat. |
| FR-33 | Push/email/inbox notifications. Result visibility remains FR-18 through API screens. |
| FR-34 | Chatbot. |
| FR-35 | Chatbot handoff to staff. |
| FR-36 | Wishlist. |
| FR-38 | Inspection-service reviews. |
| FR-39 | General post-delivery item disputes; only the narrow non-receipt delivery report is retained. |
| FR-40 | General seller reporting. |
| FR-42 | General Order/refund/dispute administration. Narrow audited non-receipt resolution remains a retained lifecycle operation. |
| FR-43 | Advanced fee-setting administration. Existing Order fee snapshots remain authoritative. |
| FR-44 | System analytics/dashboard. |
| FR-45 | Seller analytics/dashboard beyond retained progress/payout views. |
| FR-46 | Category/brand/FAQ/policy/content administration. |
| FR-47 | Separate trust-score system. Seller review average is not a trustScore claim. |
| FR-48 | Wallet/bank withdrawal. |
| FR-49 | Inspection appeals. |

Deferred does not mean implemented or accepted by the teacher. requirements.csv contains individual dispositions and acceptance mapping for every FR/NFR.

## 7. Non-functional requirements for submission

| ID | Submission disposition and verification |
|---|---|
| NFR-01 | Demo performance: measure cold catalog/API timings on the actual phone/network and report them. The historical 500 concurrent sessions/10,000 products/3-second guarantee is deferred, not asserted without load evidence. |
| NFR-02 | Auction performance deferred with auctions. |
| NFR-03 | Product images: up to 10, server limit 5 MiB each, validated types/bytes according to product contract. No universal auto-compression promise without evidence. Delivery proof has its separate 1–3 object limit. |
| NFR-04 | Reachable HTTPS API/QR, verified Google identity, server role/ownership enforcement, private sensitive Storage, bounded reads, protected secrets, audited critical commands and redacted public views. App stores no separate password. |
| NFR-05 | Revised prototype privacy: readable policy and accurate persisted acknowledgement, private access and manual administrator request contact. Full commercial compliance/export/delete tooling is deferred. |
| NFR-06 | Installable standalone APK with bundled JavaScript; real 5–7 inch Android check for guest/login, both journeys, camera/gallery, back/keyboard and profile/reviews. No Metro dependency for final use. |
| NFR-07 | Thai primary UI; observe discovery and Seller-listing usability in a rehearsal and report actual timings/limitations, rather than asserting targets from mock screens. |
| NFR-08 | Production 99.5% availability and 30-day backup policy deferred. Submission requires isolated backup/restore rehearsal, runtime health, restart/recovery and a concrete safe migration procedure. |
| NFR-09 | Production 50,000-product/20,000-account scale deferred. Retained reads are bounded/paginated with appropriate keys/indexes; no untested scalability guarantee. |
| NFR-10 | Retained revised lifecycle timing and scheduled recovery as defined below. |

## 8. Timing, money and failure rules

Unpaid expiry uses the persisted Order deadline derived from created_at + 30 minutes; it does not add another 30 minutes to that stored deadline. Seller no-ship cutoff is paid_at + 72 hours. Buyer receipt cutoff is confirmed readable TO_BUYER delivery proof time + 72 hours. Inspection target is three working days after center receipt: advance three Monday–Friday dates in Asia/Bangkok, preserving local time; weekends are excluded and no holiday calendar is claimed. Overdue inspection creates escalation only.

Eligibility is checked using fresh database wall-clock after obtaining the Order lock and after I/O/state revalidation. Before cutoff a Buyer receipt/report may write; at/after cutoff it fails even if HTTP arrived earlier and waited. Successful same-key replay remains readable. Workers target five-minute scans; actual completion is the first successful eligible scan, not a promise of exact completion at the cutoff. Missing/unreadable proof, outage or timely non-receipt keeps HELD and observable pending status.

Fees are original Order snapshots. Example THB: item1,200 + shipping50 + inspection100 = held1,350; Seller commission5% of item=60 and payout1,140. RELEASE allocations total1,350. REFUND returns1,350 with Seller/commission/inspection/shipping retained allocations zero. Real transfers, partial refund, new return fees and auto relisting are excluded.

Existing-Order lock order is Order then applicable Shipment then Escrow then Product. Migrations preserve existing data and have one expected Alembic head; shared databases are not reset or stamped. Parties, foreign keys, unique outcomes, allocations, replay and crash recovery need isolated PostgreSQL concurrency and failure evidence.

## 9. Acceptance and deliverables

QA-MATRIX.md Q01–Q28 is the mandatory evidence matrix. Unit/mocked checks are distinguished from isolated PostgreSQL, combined API and real Android/Google/private Storage/public QR checks. A release is not ready while mandatory real-service/device steps remain unrun.

Deliver one release manifest mapping app/API SHA, migration head, worker configuration, actual APK hash, runtime, evidence and known limitations. Supply setup/user guide, aligned rendered diagrams, requirement-to-test report, synthetic demo fixtures, editable presentation and PDF export, a Thai script, backup recording and rehearsal evidence. The teacher's acknowledgement of scope changes is recorded accurately, not presumed.

Implementation task packets 01–13 carry dependencies, ownership, prompts and acceptance checks. DOC-01 planning was prepared by Lead; final technical/teacher acceptance waits for the implemented release.
