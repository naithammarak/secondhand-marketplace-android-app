# Seller Verification Design

**Issue:** VERIFY-00 / GitHub Issue #34

**Feature:** GitHub Issue #33 - Seller approval

**Source requirements:** SRS FR-04, FR-05, FR-41, NFR-04, and NFR-05

**Scope:** Prototype

## Goal

Allow a user whose role is `SELLER` to submit synthetic identity and bank-account data for manual review by an `ADMIN`. A seller may publish products only after the request is approved.

## Prototype decisions

- The prototype uses synthetic identity images, account names, account numbers, and bank names only. Team members must not use real identity or bank data.
- Seller verification is separate from the user's role. Login assigns the `SELLER` role; approval determines the derived `Seller.isVerified` value.
- Verification uses manual review. No external e-KYC provider is integrated.
- The existing core class diagram remains authoritative: one Seller owns zero or one `SellerVerification` record.
- A rejected seller may correct the same record and resubmit it. `AuditLog` records the transition history; the system does not retain a full copy of every submitted payload.
- A pending or approved request cannot be submitted again.
- Approval does not expire in the prototype.
- The seller uploads one synthetic identity-document image. Bank evidence images are not required.
- Product publishing must require an active `SELLER` with an approved verification.

## Roles and permissions

| Action | SELLER | ADMIN | BUYER / INSPECTOR |
|---|---:|---:|---:|
| Submit the seller's own request | Yes | No | No |
| Read the seller's own status | Yes | No | No |
| List pending requests | No | Yes | No |
| Read review details and identity evidence | No | Yes | No |
| Approve or reject | No | Yes | No |
| Publish a product | Only when approved | No | No |

All actions also require `User.status == ACTIVE`. The backend derives the actor from a verified access token and never trusts a `userId`, role, reviewer ID, or status supplied by Mobile.

## Data contract

The existing `SellerVerification` concept is preserved with these meanings:

| Field | Rule |
|---|---|
| `verificationId` | Primary key |
| `userId` | Unique Seller owner; one row per Seller |
| `idCardImageUrl` | Private storage reference; it is never a permanent public URL |
| `bankAccountName` | Required synthetic value |
| `bankAccountNo` | Required synthetic value |
| `bankName` | Required synthetic value |
| `status` | `PENDING`, `APPROVED`, or `REJECTED` |
| `submittedAt` | Set on initial submission and updated on resubmission |
| `reviewedAt` | Set whenever Admin approves or rejects |
| `verifiedAt` | Set only when approved; otherwise null |
| `reviewedByUserId` | Admin who made the latest decision |
| `rejectReason` | Required only when rejected |
| `purgeAfter` | Data-removal deadline derived from the retention policy |

`Seller.isVerified` is derived and true only when the related verification has `status == APPROVED`.

Submission requires an active `Consent` with type `SELLER_VERIFICATION_DATA`. The Consent record belongs to the authenticated User as shown in the core class diagram. When `consent_accepted` is true, the submission service creates or renews this Consent in the same operation and records the consent ID in the AuditLog without copying consent timestamps into `SellerVerification`.

Database constraints must enforce:

- one verification row per `userId`;
- allowed verification status values;
- a rejected row has `reviewedAt`, `reviewedByUserId`, and a non-empty `rejectReason`;
- an approved row has `reviewedAt`, `reviewedByUserId`, and `verifiedAt`, with no rejection reason;
- a pending row has no reviewer, review time, verified time, or rejection reason.

## State transitions

```text
No record --submit--> PENDING --approve--> APPROVED
                         |
                         +--reject--> REJECTED --correct and resubmit--> PENDING
```

- `NOT_SUBMITTED` is an API presentation state returned when no record exists. It is not stored in the database.
- `APPROVED` is terminal for the prototype.
- On resubmission, the service updates the same row, replaces the old synthetic evidence file, sets `submittedAt` to the current time, and clears review fields.
- Every submit, resubmit, approve, and reject operation writes an `AuditLog` entry. Audit logs contain IDs, action names, actors, and timestamps, but no bank account number or evidence URL.

The detailed flow is recorded in `docs/diagrams/seller-verification-state.puml`.

## API contract

### Submit or resubmit

`POST /verifications`

Authentication: active Seller.

Content type: `multipart/form-data`.

Fields:

- `id_card_image`: one JPEG or PNG synthetic image, maximum 10 MB;
- `bank_account_name`: required, trimmed, 2-255 characters;
- `bank_account_number`: required, digits only, 6-20 digits;
- `bank_name`: required, trimmed, 2-255 characters;
- `consent_accepted`: must be `true`.

Success response (`201` for first submission, `200` for resubmission):

```json
{
  "verificationId": 42,
  "status": "PENDING",
  "submittedAt": "2026-09-18T10:30:00Z"
}
```

The response must not contain the bank account number or evidence reference.

### Read own status

`GET /verifications/me`

Authentication: active Seller.

Success response when no record exists:

```json
{
  "status": "NOT_SUBMITTED"
}
```

Success response when a record exists:

```json
{
  "verificationId": 42,
  "status": "REJECTED",
  "submittedAt": "2026-09-18T10:30:00Z",
  "reviewedAt": "2026-09-18T11:00:00Z",
  "rejectReason": "รูปเอกสารไม่ชัดเจน"
}
```

The seller never receives `reviewedByUserId`, the evidence reference, or bank data from this endpoint.

### List requests for review

`GET /admin/verifications?status=PENDING&page=1&pageSize=20`

Authentication: active Admin. The endpoint returns summary fields only and defaults to pending requests ordered by oldest `submittedAt` first.

### Read review details

`GET /admin/verifications/{verificationId}`

Authentication: active Admin. The response contains the submitted bank fields and a short-lived signed evidence URL. The signed URL must expire within five minutes and must not be written to logs.

### Record a decision

`POST /admin/verifications/{verificationId}/review`

Request:

```json
{
  "decision": "REJECTED",
  "rejectReason": "รูปเอกสารไม่ชัดเจน"
}
```

`decision` accepts `APPROVED` or `REJECTED`. `rejectReason` is required and non-empty for rejection and must be absent for approval.

The update succeeds only when the current status is `PENDING`. A conditional database update or row lock prevents two Admins from reviewing the same request successfully.

## Error contract

| HTTP | Code | Meaning |
|---:|---|---|
| 401 | `AUTH_REQUIRED` | Token is missing, invalid, or expired |
| 403 | `SELLER_ONLY` / `ADMIN_ONLY` | Authenticated role is not allowed |
| 403 | `ACCOUNT_INACTIVE` | User is suspended or closed |
| 404 | `VERIFICATION_NOT_FOUND` | Admin requested an unknown record |
| 409 | `VERIFICATION_PENDING` | Seller attempted to submit while pending |
| 409 | `VERIFICATION_APPROVED` | Seller attempted to submit after approval |
| 409 | `VERIFICATION_ALREADY_REVIEWED` | Admin attempted to review a non-pending request |
| 413 | `IMAGE_TOO_LARGE` | Image exceeds 10 MB |
| 422 | `CONSENT_REQUIRED` | Seller did not grant required consent |
| 422 | `INVALID_IMAGE` | File type or image content is invalid |
| 422 | `INVALID_BANK_DATA` | Required bank fields are invalid |

User-facing messages are in Thai. Logs may contain the error code, actor ID, verification ID, and request ID, but must not contain tokens, bank data, evidence paths, or signed URLs.

## Evidence storage and retention

- Store evidence in a private Supabase Storage bucket.
- Use a server-generated object key; do not include a name, email, account number, or original filename.
- Only the backend service role may create signed read URLs.
- Seller status responses never expose evidence.
- When a rejected seller resubmits, upload the replacement first, update the database transactionally, then delete the superseded object. Failed cleanup is retried and logged without exposing the object key to Mobile.
- For the prototype, every submitted identity and bank value is synthetic.
- `purgeAfter` follows the SRS policy: verification evidence is removed within 90 days after account closure. Audit logs remain non-sensitive.

## Data flow

1. Seller opens verification; Mobile reads `GET /verifications/me`.
2. Mobile displays the correct state and collects synthetic data plus consent.
3. Backend verifies the token, active account, Seller role, consent, form fields, and image.
4. Backend stores the image privately, creates or updates the single verification row as `PENDING`, and records an AuditLog.
5. Admin lists pending requests and opens one request using a short-lived evidence URL.
6. Backend conditionally applies one review decision and records the Admin in the AuditLog.
7. Seller refreshes status. Rejected sellers see the public rejection reason and may resubmit; approved sellers become eligible to publish products.
8. Product creation rechecks approval in the backend for every request.

## Verification and acceptance tests

- A new active Seller can submit valid synthetic data and receives `PENDING`.
- Buyer, Inspector, Admin, and inactive users cannot submit.
- Missing consent, invalid bank data, invalid files, and files over 10 MB are rejected without leaving orphaned storage objects.
- A pending or approved Seller cannot submit again.
- A rejected Seller can replace data and resubmit the same record; review fields are cleared.
- Seller status never exposes bank data, evidence references, or internal review notes.
- Only Admin can list or open review details.
- Rejection without a reason and approval with a rejection reason are rejected.
- Two simultaneous Admin decisions result in exactly one successful transition.
- Product publishing rejects Sellers without an approved verification even if Mobile hides or bypasses the button.
- Audit logs exist for submission, resubmission, approval, and rejection and contain no sensitive values.

## Out of scope

- Real identity or bank data;
- automated e-KYC;
- bank-account ownership verification;
- approval expiration and renewal;
- an appeal workflow;
- Seller dashboard, withdrawals, notifications, and automatic purge jobs;
- changing the core class diagram.
