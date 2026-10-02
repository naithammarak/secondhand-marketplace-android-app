# 2NDHAND — Submission Software Requirements Specification

> Backend candidate, 2 October 2026: EXTERNAL_V2 for new Orders; LEGACY_V1 for existing records. See [current API mapping](reports/EXTERNAL-SHIPPING-API-MAPPING.md) and [R1 evidence](reports/EXTERNAL-SHIPPING-R1.md). Local PostgreSQL evidence is separate from independent, E, shared and Android acceptance.

Version: submission-2026-10-02-external-shipping · Target: Thursday, 8 October 2026 · Timezone: Asia/Bangkok

Status: Scope selected by the project owner on 1 October 2026. The backend candidate has local implementation evidence; independent and full release acceptance remain pending. Teacher acknowledgement of revised scope is not established by this document.

## 1. Purpose and authority

2NDHAND is an Android prototype for fixed-price secondhand clothing/accessory sales with central inspection, public digital certificates, held funds and evidence-based delivery. The submission demonstrates both a successful sale and an actual-return refund following the persisted policy/cause.

This specification replaces conflicting submission rules in the historical SRS revision 1.5 dated 25 August 2026. The original PDF remains a historical reference. DOC-01-scope.md records the owner's selected changes; PROFILE-REVIEWS-contract.md defines the new APIs; Current amendment scope and EXTERNAL-SHIPPING-API-MAPPING.md define changed policy/routes; references/FINISH-spec.md retains historical transaction/error context for legacy behavior.

Requirement IDs FR-01–FR-49 and NFR-01–NFR-10 are preserved for traceability. A revised or deferred requirement is a scope change, not evidence that the original requirement was fulfilled. Every retained behavior needs evidence on the combined release and a real Android APK.

## 2. Scope, users and external systems

The retained system includes public catalog discovery, Google authentication, default Buyer registration, seller approval, fixed-price listings, persisted simulated payment/receipt/escrow, center inspection, certificates, Buyer result decisions, final delivery/return, exactly-once release/refund, lifecycle jobs, basic profile, seller reviews and minimal operational Admin actions.

Guest users browse/search/detail/reviews and public certificates without login. New Google users are BUYER. Approved SELLER users keep Buyer capabilities and can publish/manage eligible products. INSPECTOR and ADMIN are assigned staff roles; COURIER is retained only for legacy Orders; clients cannot select them. Active account and resource-ownership authorization is enforced on the server, not only by navigation.

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
| FR-14 | New-policy Seller dispatches TO_CENTER and assigned Inspector dispatches the server-selected final leg with carrier/tracking and immutable destination. Actual recipients confirm receipt; no Courier account or shipping photo is required. Historical Courier/proof policy remains for legacy Orders. |
| FR-15 | Authorized active center Inspector records actual center receipt through POST /inspections/{id}/receive using a matching audited command and fresh server time. New policy requires no Courier proof; private inspection evidence remains required for final results. |
| FR-16 | Assigned Inspector evaluates authenticity, condition and description match. Final result is PASS, MINOR_ISSUE, NOT_AS_DESCRIBED or FAKE. |
| FR-17 | Final result and required private evidence are persisted with valid ownership and immutable final history. |
| FR-18 | Buyer reads the committed result/evidence through the authorized result screen and refresh. Push/email/inbox delivery is not claimed. |
| FR-19 | Owning Buyer records one CONFIRM or REJECT for PASS/MINOR_ISSUE strictly before persisted atomic result availability+72h. At/after cutoff SYSTEM timeout authorizes TO_SELLER without creating a Buyer decision, dispatch or settlement. Negative results return directly; committed replay remains readable. |
| FR-20 | PASS/MINOR_ISSUE certificate is issued atomically with final inspection, before Buyer decision. Negative results never issue a qualifying certificate. |
| FR-21 | Certificate uses an opaque public token/QR pointing to the reachable HTTPS certificate origin. |
| FR-22 | Any person verifies public certificate status without login. Public views exclude identity/address/private evidence. Invalid tokens are not valid certificates. |
| FR-23 | Active Admin revokes an incorrect certificate through a reasoned audited command. Public/native views show REVOKED. Revocation does not rewrite inspection, receipt or settlement. |
| FR-24 | New-policy owning Buyer confirms actual receipt after authorized TO_BUYER dispatch even without a carrier event, subject to an existing deadline. AUTO requires trusted Admin demo TO_BUYER delivered time+72h and no missing report. One RELEASE preserves the original 5% item commission; legacy proof policy remains. |
| FR-25 | New-policy positive-result rejection or SYSTEM result timeout refunds the item snapshot only after actual Seller or scoped audited Admin return receipt, retaining original inspection/shipping fees once with payout/commission zero. Negative-result, no-ship, Admin non-receipt and legacy refunds remain full. Original Payment/Receipt stays immutable; Product becomes CANCELLED. |
| FR-26 | Successful persisted simulated charge creates a retrievable receipt. A refund has a separate settlement reference. No legally issued tax invoice is represented. |
| FR-37 | Revised: actual active Order Buyer submits one seller rating 1–5 and optional purchase/item-experience comment after COMPLETED plus RELEASED. No separate product/inspection scores, photos, tags or replies. |
| FR-41 | Retain Seller approval, necessary assignment, scoped audited delivery/return exceptions, Admin demo shipping events and certificate revocation. General user administration and automatic suspension refunds are deferred; existing account guards remain. |

## 4. Additional retained lifecycle requirements

- Each new Order snapshots EXTERNAL_V2; all pre-migration Orders retain LEGACY_V1, including unpaid/paid/terminal rows. Clients cannot submit policy, parties, amounts or timestamps. Shipment and settlement policy must match the immutable Order.
- Positive final result and certificate become available atomically. Persist availability and exactly +72h decision deadline. Timely CONFIRM permits TO_BUYER; REJECT or SYSTEM timeout permits TO_SELLER. Timeout is audited and creates no Buyer decision, shipment or financial outcome. Negative results permit only TO_SELLER.
- Seller sends TO_CENTER; authorized Inspector confirms actual center receipt and assigned Inspector records carrier/tracking for the final leg. Destinations remain frozen Order snapshots. New shipping requires no Courier account or image; legacy selected private-proof rules remain intact.
- Explicitly configured active Admin demo DELIVERED events persist source, event identity, shipment/leg and server time. Event identity cannot move to another Order/leg. Transport delivery is distinct from actual recipient receipt. TO_CENTER events do not receive at center; TO_SELLER events do not refund.
- Actual owning Buyer receipt is allowed after correct dispatch without waiting for a transport event, subject to an existing deadline. A missing report after dispatch keeps HELD and blocks any later AUTO. AUTO requires the trusted TO_BUYER event and its exact +72h deadline. Scoped audited Admin resolves non-receipt with same-case evidence/reason.
- Actual owning Seller or scoped audited Admin confirms returned receipt. RETURNED_TO_SELLER plus HELD commits first; a separate financial transaction invokes the same settlement service. Failure remains pending and retries without losing receipt or charging fees twice.
- One immutable RELEASE or REFUND conserves held money. Positive rejection/timeout item-only refunds retain original inspection/shipping once; other specified causes and legacy policy remain full. Original successful Payment/Receipt never changes.
- Six bounded no-HTTP jobs preserve old cursor ownership/fairness and add result timeout as ID6. Dry-run writes no commands, decisions, shipments, money or progress. Storage failure remains relevant to legacy proof flows; a report prevents AUTO under either policy.

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
| FR-42 | General unrestricted Order/refund/dispute administration is deferred. Retain only scoped audited non-receipt resolution, return-confirmation exceptions with same-case evidence/reason and explicitly configured Admin demo shipping events; clients cannot choose amounts or recipients. |
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
| NFR-03 | Product images retain the existing up-to-10, 5 MiB each validated contract. New-policy shipping photos are optional and no Courier photos are required; legacy delivery confirmation retains 1–3 selected private proofs. Private inspection/identity images still require authorization. |
| NFR-04 | Reachable HTTPS API/QR, verified Google identity, server role/ownership enforcement, private sensitive Storage, bounded reads, protected secrets, audited critical commands and redacted public views. App stores no separate password. |
| NFR-05 | Revised prototype privacy: readable policy and accurate persisted acknowledgement, private access and manual administrator request contact. Full commercial compliance/export/delete tooling is deferred. |
| NFR-06 | Installable standalone APK with bundled JavaScript; real 5–7 inch Android check for guest/login, both journeys, camera/gallery, back/keyboard and profile/reviews. No Metro dependency for final use. |
| NFR-07 | Thai primary UI; observe discovery and Seller-listing usability in a rehearsal and report actual timings/limitations, rather than asserting targets from mock screens. |
| NFR-08 | Production 99.5% availability and 30-day backup policy deferred. Submission requires isolated backup/restore rehearsal, runtime health, restart/recovery and a concrete safe migration procedure. |
| NFR-09 | Production 50,000-product/20,000-account scale deferred. Retained reads are bounded/paginated with appropriate keys/indexes; no untested scalability guarantee. |
| NFR-10 | Six bounded restart-safe no-HTTP jobs: unpaid expiry, receipt release, Seller no-ship refund, return-refund retry, inspection overdue escalation and positive-result decision timeout. Preserve old progress IDs 1–5 and add result-timeout ID6; dry-run writes nothing; fresh DB clock after locks governs cutoffs. |

## 8. Timing, money and failure rules

Unpaid expiry is persisted created_at+30 minutes. Seller no-ship is paid_at+72h. New-policy result decision is atomic result_available_at+72h; result_timed_out_at records a separate SYSTEM outcome. New-policy AUTO receipt is trusted TO_BUYER transport event confirmed_at+72h; tracking entry and first app opening start neither timer. Legacy Buyer receipt uses confirmed private Courier proof time+72h. Inspection target advances three Monday–Friday dates in Asia/Bangkok after actual center receipt, preserving local time, with no holiday calendar; escalation creates no result or money.

Fresh PostgreSQL clock_timestamp() is sampled after Order→Shipment→Escrow→Product locks as applicable and after I/O/state revalidation. Decision and receipt/report writes are strictly before their cutoff; at/after fails even if HTTP arrived earlier and waited. Committed authorized replay remains readable. Workers target five-minute scans; successful eligible processing can occur later after outage or locked-row skip. A missing report blocks AUTO; no trusted new-policy delivery event means no AUTO release.

Fees are immutable Decimal snapshots. Example THB held1,350 = item1,200+shipping50+inspection100. RELEASE = payout1,140+commission60+inspection100+shipping50. New positive-rejection/result-timeout REFUND = Buyer1,200+retained inspection100+retained shipping50, with Seller/commission0; never refund1,050 by deducting fees again. Negative/no-ship/Admin non-receipt and legacy REFUND = Buyer1,350 with all other allocations0. No extra return fee, actual provider transfer or automatic relisting is inferred.

Migration r01e20261002 follows c08f20261002 with one head. It preserves legacy rows/financial evidence and safely downgrades/re-upgrades when no new-policy data exists; it explicitly refuses downgrade when new-policy Orders/events cannot be represented without loss. Shared databases are not reset, stamped or migrated by these checks.

## 9. Acceptance and deliverables

QA-MATRIX.md Q01–Q28 is the mandatory evidence matrix. Unit/mocked checks are distinguished from isolated PostgreSQL, combined API and real Android/Google/private Storage/public QR checks. A release is not ready while mandatory real-service/device steps remain unrun.

Deliver one release manifest mapping app/API SHA, migration head, worker configuration, actual APK hash, runtime, evidence and known limitations. Supply setup/user guide, aligned rendered diagrams, requirement-to-test report, synthetic demo fixtures, editable presentation and PDF export, a Thai script, backup recording and rehearsal evidence. The teacher's acknowledgement of scope changes is recorded accurately, not presumed.

Implementation task packets 01–13 carry dependencies, ownership, prompts and acceptance checks. DOC-01 planning was prepared by Lead; final technical/teacher acceptance waits for the implemented release.
