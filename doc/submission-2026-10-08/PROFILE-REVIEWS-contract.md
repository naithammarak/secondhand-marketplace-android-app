# Profile / Reviews v1 — contract ที่เลือกก่อนทำ code

สอดคล้อง [DOC-01](DOC-01-scope.md) ณ 1 ตุลาคม 2026 **เป็น contract เป้าหมาย ยังไม่มี routes เหล่านี้ใน baseline** ถ้า release base มี equivalent ให้บันทึก mapping และ reuse; ห้ามสร้าง endpointซ้ำ

## Common rules

- ใช้ auth dependency / error envelope เดิม; integer IDs; UTC ISO 8601; strict Pydantic JSON `extra=forbid`; ไม่มี email/PII ใน public responses
- GET ของตนต้อง authenticated; writes ต้อง ACTIVE; BUYER หรือ approved SELLER ที่เป็นเจ้าของ Order ใช้สิทธิ์ Buyer ได้ ไม่ตรวจเพียง `role == BUYER`
- ป้องกัน IDOR, account-switch stale requests, mutation retries, user-entered markup ด้วย safe text rendering; ไม่มี `dangerouslySetInnerHTML`
- UI ต้องแสดง error/loading/empty/retry และ clear account cache หลัง logout/account change; ห้ามนำ mock reviews มาปน API mode

## PROFILE-01

### API

| Route | Request / response |
|---|---|
| `GET /profile` | private own projection `{id,full_name,email,role,status,privacy_policy_version,privacy_acknowledged_at}`; last two nullable |
| `PATCH /profile` | `{ "full_name":"ชื่อที่ผู้ใช้แก้" }` → 200 projection เดียวกัน; strip ขอบ, 1–100 Unicode chars, ไม่รับ control chars; update ownUser only |
| `POST /profile/policy-acknowledgement` | `{ "policy_version":"submission-2026-10-01" }` → 200 projection; version ต้องตรง supportedcurrent policy; first acknowledgement sets DB UTC timestamp; same version retryไม่เลื่อน timestamp |

ไม่มี user_id ใน body; `role`, `status`, `email`, `supabase_user_id`, `phone`, address และ arbitrary fields → 422 ห้ามเกิด privilege change ชื่อที่แก้แล้วไม่ถูก Google login เดิม overwrite

Persistence: เพิ่ม nullable `users.privacy_policy_version` (String ≤64), `users.privacy_acknowledged_at` (timezone aware) แบบ paired-null constraint; legacy users ไม่ backfill ยินยอมปลอม ไม่เปลี่ยน schema ของ `/auth/me` ที่มี consumers อยู่โดยไม่จำเป็น ยึด `GET /profile` เป็นข้อมูลหน้านี้

Policy acknowledgement คือการรับทราบนโยบายเดโม ไม่เรียกเป็น blanket consent สำหรับการใช้รูป/เอกสารนอกการให้บริการ ข้อมูล seller verification ยังต้องมี notice และ private access ตาม flow เดิม ลบ optional photo reuse checkbox และคำสัญญา export/delete ที่ยังทำไม่ได้จาก prototype

UI: ใช้ข้อมูลบัญชีจริง, edit name form และปุ่ม save; provider email/role/status readonly; buyer สมัครผู้ขายผ่าน existing verification CTA; seller เห็นสถานะเดิมและซื้อได้; guest login CTA; policy/terms textอ่านได้ + acknowledgement recorded; accountinactiveแสดงสถานะและ disablewrites ตาม existing auth/read policy

### Acceptance

- Save→reload/relogin/API GET เห็นชื่อใหม่; invalid/empty/overlong/control rejected; extra role/email/id rejected; userAแก้userBไม่ได้
- Same version acknowledgement retryเก็บเวลาเดิม; unsupportedversion422; legacyuserไม่มีfakeack
- FE failedsaveไม่โชว์ชื่อว่าสำเร็จ, duplicatepressไม่ส่งซ้ำโดยไม่จำเป็น; logout/accountchangeไม่เห็นข้อมูลคนก่อน

## REVIEW-01

### Data

`reviews`: id, **unique order_id**, buyer_id/seller_id/product_id ที่ server derive จาก locked Order, rating integer 1–5, comment String ≤1000 (canonical empty string), created_at UTC DB timestamp บังคับ FK/constraints ตรงกับ Order หรือ service + negative PostgreSQL tests ถ้า composite FK ต้องเพิ่ม unique key ให้ Order ก่อนตาม migration owner ไม่รับ recipientจาก client

Reviewable เมื่อ orderเป็น `COMPLETED` และ terminal settlement `RELEASE`/Escrow `RELEASED`; refunded/cancelled/disputed/inspection-only ไม่ reviewable; actor = actual Order buyer และ ACTIVE; ไม่เปิด reviewเมื่อ UI เพียงแค่แสดงว่า delivered; existingimmutable reviews ไม่ถูกลบเพราะ role/status เปลี่ยนภายหลัง

### API

| Route | Request / response |
|---|---|
| `GET /orders/{id}/review` | own Buyer, 200 `{order_id,can_review,review}`; review null หรือ private submitted review; can_review derived server-side; unknown/nonowner ใช้ existing 404/redaction policy |
| `POST /orders/{id}/review` | `{ "rating":5, "comment":"แพ็กดี สินค้าตรงภาพ" }`; requires `Idempotency-Key` ตาม FINISH; 201 persisted review; actor/order/recipients derivedserver |
| `GET /sellers/{seller_id}/reviews?limit=20&offset=0` | public projection `{seller_id,summary:{count,average_rating,distribution},items,total,limit,offset}`; only publiceligible seller; limit1–100, offset≥0; newest created_at/id DESC |

Public item: `{id,rating,comment,created_at,reviewer_label,product_name}`. ใช้ privacy-safe labelคงที่ **"ผู้ซื้อที่ยืนยันการซื้อ"**; ไม่มี buyer/order IDs, full_name, email, phone, address, inspector identity, object keys. Product name มาจาก Order/product snapshot ที่มีอยู่ ไม่เพิ่มรูป/URL uploadช่องใหม่

Summary: countจาก DB; average_ratingเป็นnumber rounded1decimalหรือnullเมื่อcount0; distributionเป็นobject keys`"1".."5"`มีค่า0ได้; sumdistribution=count, total=count, paginationไม่นำ page lengthไปคำนวณaggregate; ทำ consistent query snapshot เพื่อไม่ให้ summary/list ขัดกันตอนเขียน concurrent

Same actor/order/key + canonicalpayload replay→existing201และ `Idempotent-Replayed:true`; samekeydifferentpayload409`idempotency_key_reused`; differentkeyเมื่อมีreviewแล้ว409`review_already_exists`; uniqueorderกันparallel duplicate. Ineligible state409`order_not_reviewable`; invalidrating/comment422. auth/roles/readonlyตามcommonpolicy; don't leak other buyerreview in errors

### UI changes

- ปุ่มรีวิวจาก completedOrder เท่านั้น และใช้ can_reviewจากserver; sellerที่ซื้อ Orderคนอื่นก็reviewได้
- ปรับ `review-modal.tsx` และ route `/orders/[orderId]/review` ให้เหลือ sellerstars + optionalcomment; submitเรียกAPIจริง สำเร็จจึงกลับหน้าและrefresh; errorยังเก็บinput/retrykey; แสดง submittedreview เมื่อมีแล้ว
- ปรับ `seller-reviews-modal.tsx` ที่ productdetailใช้ให้โหลดsummary/itemsจริง; ไม่มี `INITIAL_SELLER_REVIEWS`, คะแนน4.8หรือจำนวน29ใน APImode; ถ้า0รีวิวแสดง "ยังไม่มีรีวิว" และไม่มีaverageปลอม
- เอา productStars/inspectionStars/tags/hasPhoto ออกจาก form/payload; ไม่มีuploadที่ไม่ได้ทำจริง

### Acceptance

- Owned completedRELEASEorder create1review→DB/GET/reload/seller modalเห็นตรงกัน; fakepending/refunded/nonowner/inactive/recipientinjection rejected
- Parallel duplicate + replay + keyreuse mismatch → one row/one review; one-time insertไม่เพิ่ม event/aggregateซ้ำ
- Rating1/5valid,0/6/floatinvalid; comment1000valid1001invalid; safeUnicode/rendering; publicPIInegative assertion
- Count/avg/distributionตรงแม้ paginate; nozeroaverage/nonexistentfake data; FE networkfailure/accountswitch tests
