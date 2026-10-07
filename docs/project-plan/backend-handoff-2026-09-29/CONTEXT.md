# Context กลาง — snapshot 29 กันยายน 2026

อ่านไฟล์นี้ก่อน task ที่ได้รับมอบหมาย สถานะ GitHub/branch เปลี่ยนได้ ให้ตรวจซ้ำก่อนเริ่ม ไม่ถือผลทดสอบที่ผู้อื่นเขียนไว้ว่าเป็นผลที่ session นี้รันเอง

## เป้าหมายและข้อจำกัดจากเจ้าของ

โครงการตลาดสินค้ามือสอง: Expo/React Native + FastAPI + PostgreSQL/Supabase private Storage มี Google login; payment/shipping เป็น prototype simulation แต่สิทธิ์ สถานะข้อมูล การจอง และหลักฐานต้องเป็นข้อมูลจริงที่ persist ได้

เจ้าของกำลังให้ frontend session ปรับ UI ใน `/home/tmk/.codex/worktrees/a234/secondhand-marketplace-android-app` **ทุก task ในแพ็กนี้อ่าน a234 ได้อย่างเดียว** ห้ามแก้/stage/commit/stash/reset/checkout/ติดตั้ง dependency/สร้าง test artifacts/รัน server หรือ tests ที่เขียนไฟล์ในนั้น ห้ามแตะ dirty file ของ session เดิม

ห้ามเปลี่ยนพฤติกรรมหรือปิดบริการ/port/database ที่ frontend session ใช้ งานใหม่สร้าง checkout/worktree แยกและใช้ PostgreSQL ทิ้งได้แยกต่อ session เครื่องเพื่อนใช้ path ของตัวเองได้ ไม่ต้องมี path ของเจ้าของ

การแจกงานนี้อนุญาต local implementation ตามขอบเขต F1/F2, local integration ตาม L1, QA ตาม F3 และเอกสารตาม L2/L3 ไม่ได้สั่งส่งข้อความให้ทีม, สร้าง/ปิด GitHub Issue, push, merge remote, deploy, apply migration หรือ seed/เปลี่ยน role บนฐานร่วม

## กติกาผลิตภัณฑ์ที่ต้องรักษา

1. Guest เปิดแอปแล้วค้นหา/ดูสินค้าได้ Login ตอนใช้สิทธิ์ส่วนตัว
2. ผู้ใช้ใหม่เป็น BUYER โดย server; ขอเป็นผู้ขายจาก Profile; อนุมัติแล้วจึง SELLER และลงขายได้
3. SELLER ซื้อสินค้าคนอื่นได้ ตรวจบทบาทผู้ซื้อของ Order จาก `buyer_id` ร่วมกับ account policy; ห้ามให้เจ้าของร้านเห็น private data ของผู้ซื้อเพียงเพราะมีบทบาท SELLER
4. Staff เป็น operator provisioned; ADMIN/INSPECTOR/COURIER ไม่ได้สิทธิ์ซื้อจากการผ่อน guard นี้
5. ผู้ซื้อยอมรับผลตรวจ CERT แยกจากยืนยันรับสินค้า FINISH; CERT CONFIRM ไม่ปล่อยเงิน
6. PASS/MINOR_ISSUE ออกใบรับรองพร้อมผลตรวจใน transaction เดียว; ผลลบไม่มีใบรับรอง/CONFIRM และไปทางคืน
7. FINISH ใช้ settlement service เดียว หนึ่ง Order/Escrow มี RELEASE หรือ REFUND อย่างใดอย่างหนึ่งครั้งเดียว; ยอดจาก snapshot เดิม, คืนเงินเต็มยอดจำลอง, ไม่ลบ Payment/Receipt เดิม
8. ไม่เพิ่ม cart, chat, push,เงินจริง, provider จริง หรือระบบ wallet ในงานชุดนี้

เอกสารเก่าบางส่วนยังพูดถึงเลือก role ตอนสมัคร, BUYER-only หรือ INSPECT ยังไม่เชื่อม ใช้กติกา Wondee ข้างบนสำหรับบทบาท และบันทึก contract amendment ที่จุดตรวจรับ ไม่ใช้ข้อความประวัติเพื่อลด capability ที่เจ้าของเลือกแล้ว ส่วน inactive historical-read policy ต้องเทียบ contract ปัจจุบันแยกตาม endpoint ไม่เปลี่ยนทั้งหมดโดยเหมารวม

## Repository และฐานที่ตรวจแล้ว

Repository: https://github.com/naithammarak/secondhand-marketplace-android-app

| แหล่ง | revision ที่อ่าน | ความหมาย |
|---|---|---|
| a234 `codex/wondee-ui-redesign` | `d02408ff048f3e1aece9dfbb34db3e9c07305f21` | session ที่กำลังทำงาน; dirty files อยู่นอก commit ดูรายการอัปเดตด้านล่าง |
| PR #108 `feat/inspect-01-storage` | `f0d1494c223d4e2317ff32f9bc44926e6885f233` | OPEN; INSPECT backend; base main |
| PR #109 `feat/cert-01-storage` | `09118fe2f4b05ac3a3a89432d51945f63b14a7fc` | OPEN; base #108; CERT DB; diff ยังมี mobile หลายไฟล์ |
| PR #110 `feat/cert-02-atomic-issue` | `f958f8424a2b5707ed2113fb21acf3519ecaa7b6` | OPEN; base #109; atomic certificate |
| PR #111 `feat/cert-03-public-page` | `07e8aa6cee6852140c941b1ed5140ca855c21e8d` | OPEN/DRAFT; base #110; public HTML |
| PR #112 `feat/cert-04-buyer-decision` | `5e54428fbb46c616b51d14d18e9ddf17bc9f9174` | OPEN/DRAFT; base #111; one-time buyer decision; F1 เริ่มจากนี่ |
| PR #113 `codex/wondee-live-integration-pr` | `9a3313757675848fe542085e3173fd5ea34fd445` | OPEN/DRAFT; base #108; Wondee integration; F2 เริ่มจากนี่ |

PR URL ใช้ `https://github.com/naithammarak/secondhand-marketplace-android-app/pull/<number>`

**#113 ไม่ใช่ snapshot เดียวกับ a234:** ผล diff ที่อ่านมี mobile ต่างกัน และ backend สองไฟล์ คือ `backend/migrations/versions/e8b2c490a713_merge_wondee_inspect.py`, `backend/tests/test_product_upload_schema.py` ตรวจ diff แล้วความต่าง backend ณ SHA คู่นี้เป็นเพียงการจัดบรรทัด/ช่องว่าง ไม่มีการเปลี่ยน migration graph หรือ assertions; ไม่ต้องสร้างงานแก้ migration เพราะ diff นี้ ส่วนการรวม CERT migrations กับ Wondee ยังเป็นงานจริงของ L1

GitHub Issue ปัจจุบัน: #98 FINISH-00; #100 CERT feature; #101–106 CERT-01…06; #50 PRODUCT-08; #63 ORDER-06; #65 INSPECT-06 งานที่ยัง OPEN อาจมี implementation แล้ว ต้องดู code/PR/acceptance ก่อนสร้างงานซ้ำ

### การเปลี่ยนแปลงที่พบระหว่างจัดแพ็ก

การอ่านครั้งแรกพบ dirty เฉพาะ orders-list-screen; อ่านท้ายรอบพบ session เดิมแก้ต่อโดย HEAD ยังเป็น d02408f:

- `backend/app/api/orders.py`
- `backend/app/schemas/order.py`
- `backend/tests/test_orders_api.py`
- `mobile/src/components/orders-list-screen.tsx`
- `mobile/src/services/order-service.ts`
- untracked `mobile/src/hooks/use-product-image.ts`

Diff backend ที่อ่านเพิ่มเป็นรูปสินค้าใน Order/Quote (`ProductSnapshot.image_url` และ image lookup/signing) เป็น **งานของ session เดิมที่ยังไม่ commit และยังไม่ได้ review/test ในแพ็กนี้** ไม่คัดลอกลง handoff ไม่ถือว่าอยู่ใน #113 หรือ baseline ของเพื่อน F1/F2 แก้บน SHA ของตัวเองได้ แต่ L1 ต้องรับ commit จากเจ้าของส่วนนี้ก่อนรวม final candidate และรักษา image contract/tests ที่ผ่าน review; ห้ามให้สอง session เขียนทับ shared file หรือหยิบ dirty code มารวมเอง

## วิธีเริ่มบนเครื่องเพื่อน

ใช้ clone ของตัวเอง ตรวจ AGENTS.md ที่ใช้กับ paths ที่จะทำงาน ตรวจ dirty files/branch และสร้าง branch/worktree ใหม่จาก SHA ของ task ถ้า checkout ที่เปิดอยู่คือ a234 ให้สร้าง clone แยกก่อนเขียนอะไร

ตัวอย่างคำสั่งอ่าน/dึงฐานจาก clone ของตัวเอง:

```sh
git remote -v
git status --short
gh pr view 112 --json headRefOid,headRefName,baseRefName,state,isDraft
git fetch origin feat/cert-04-buyer-decision codex/wondee-live-integration-pr
git show --no-patch --format=fuller 5e54428fbb46c616b51d14d18e9ddf17bc9f9174
```

F1 ใช้ branch ของตัวเองจาก SHA #112; F2 ใช้ SHA #113 ไม่มีการแก้ branch ที่เพื่อนกำลังทำอยู่ ใช้ชื่อ branch/worktree ที่ยังไม่ถูกใช้ ห้าม force/reset หรือ reuse directory ที่มีงานคนอื่น ถ้า branch เคลื่อนไปแล้ว เปรียบเทียบ delta; หาก fix ถูกทำแล้วให้ verify/report แทนการแก้ซ้ำ ถ้า commit หาไม่ได้ให้ fetch refs ที่เกี่ยวข้องใน clone ของตัวเองก่อน แล้วรายงาน base mismatch แทนเริ่มบน main โดยเงียบ

F1/F2 ต้องทำ diff เฉพาะจาก base ของ task รายการ mobile ที่อยู่ใน ancestry ของ CERT ไม่ใช่งานของ task และต้องไม่ถูกย้ายเข้ารอบ integration โดยอัตโนมัติ L1 เป็นเจ้าของรวมโค้ด

## หลักฐานจาก source ที่อ่านรอบนี้

- a234 `backend/app/api/orders.py::require_buyer` รับ BUYER/SELLER
- a234 `backend/app/api/inspections.py::read_evidence` และ `read_delivery_proof` ยังมี BUYER-only branch
- #112 `buyer_inspection`, `decide_inspection`, `_fresh_actor` ที่ใช้กับ buyer decision และ private proof/evidence ยังต้อง reconcile กับ Seller-as-buyer
- a234 มี `services/order_expiry.py` และ `scripts/release_expired_orders.py`; ยังไม่พบ recurring runner ใน source ที่ตรวจ สคริปต์เดิมมีทั้ง expired orders และ orphan-product repair ซึ่ง F2 ต้องไม่เปิด repair เพิ่มโดยไม่ตั้งใจ
- a234 มี Courier/Shipment proof แต่ API `_courier_shipment` จำกัด TO_CENTER; schema มีชื่อ leg TO_BUYER/TO_SELLER ไม่ได้พิสูจน์ว่า outbound/return flow ใช้งานแล้ว
- a234 ยังไม่มี buyer decision/FINISH settlement; #112 มี decision แล้วแต่ยังไม่ได้รวมกับ UI candidate นี้
- เอกสาร rollout ใน repo รายงาน shared migration/Storage และ browser login ที่เคยทดสอบ; แพ็กนี้ไม่ได้ตรวจ runtime/DB/account ซ้ำและไม่อ้างผลนั้นเป็น live proof ปัจจุบัน

## Test และ environment

อ่าน test configuration ก่อน import/run: `backend/tests/conftest.py` โหลด `.env` ได้ ห้ามใช้ credentials/DB URL ของ frontend runtime เป็นค่าทดสอบ คัดลอกเฉพาะ example config และกำหนด connection ของ disposable localhost DB โดยชัดเจน ไม่คัดลอก `.env` จริงลงแพ็ก/commit

ชื่อที่พบใน baseline: `INSPECT_FLOW_TEST_DATABASE_URL`, `ORDER_TEST_DATABASE_URL`, `WUI_TEST_DATABASE_URL` ชุด CERT และชุด migration อื่นให้ตรวจ environment variable จาก source จริงเพิ่มเติม ไม่เดาชื่อ หลายชุดต้องมี empty database แยกกัน อย่ารัน migration suites พร้อมกันบนฐานเดียว

คำสั่งและ dependencies ใช้จาก revision ที่ทำงานจริง ตรวจ requirements/config ก่อนติดตั้ง ไม่สมมติว่ามี `backend/pyproject.toml` ผล skipped เพราะไม่มี PostgreSQL ไม่ใช่ PASS ของ constraints/races ต้องใช้ independent DB connections สำหรับ race test และแยก mock-auth/local-storage proof จาก Google OAuth/Supabase/device acceptance

## เอกสารอ้างอิงในแพ็ก

`references/project-plan/`: FINISH-spec, FINISH-AI-handoff, FULFILLMENT-00, CERT-spec, INSPECT-spec, GitHub_Prototype_Backlog และ diagram ที่เกี่ยวข้อง เป็นสำเนาเอกสารเดิม; baseline เก่าในเอกสารยังเป็นประวัติ ไม่ใช่ฐานใหม่

`references/repository/`: Order contract, Wondee UX/rollout, VERIFY contract ที่อ่านจาก a234 แหล่งต้นฉบับและ hash อยู่ใน `REFERENCE-MANIFEST.json` Relative links ภายในสำเนาที่ชี้ source code ให้เปิดจาก checkout ของผู้รับตาม repository path ไม่ใช่คาดว่ามี source code ในแพ็ก

เมื่อ code/contract ขัดกัน บันทึกชื่อไฟล์+revision+ผลต่อ task; เดินงานอิสระต่อได้ แต่ไม่เดาผลลัพธ์การเงิน สิทธิ์ หรือ migration history ที่ขัดกันโดยเงียบ
