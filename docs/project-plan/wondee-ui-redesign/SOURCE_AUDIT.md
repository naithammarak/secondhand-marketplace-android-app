# Source and baseline audit

ตรวจ 27 กันยายน 2026, เวลาเครื่อง Asia/Bangkok. นี่เป็น audit ของงานวางแผน ไม่ใช่ผลทดสอบ implementation ใหม่

## 1. Inputs

| Input | ผลตรวจ |
|---|---|
| `/home/tmk/Downloads/wondee-mobile-prototype/` | พบ README.txt, DESIGN_SPEC.md, index.html, mascot_showcase.html, tailwind.css, tailwindcss.min.js |
| `ui_ux_production_spec.md` ที่ผู้ใช้ระบุเป็น input | ไม่พบใน project/Downloads และ targeted filename search ของ Documents/Downloads/project (depth ≤6); ขอ path ผ่านคำถามแล้ว ใช้ DESIGN_SPEC.md เป็น available source ระหว่างรอ |
| Main output ชื่อเดียวกันในชุดนี้ | เขียนใหม่โดย Lead; ไม่ใช่การอ้างว่าอ่านไฟล์ input ที่ยังหาไม่พบแล้ว |
| Reference snapshot | สำเนา 6 ไฟล์ไม่แก้ไขใน `reference/`; hashes อยู่ `reference/SHA256SUMS` |

## 2. Repository and active work

Fetched origin และอ่าน GitHub PR metadata จริงระหว่างวางแผน. `origin/main` ณ snapshot = `8254f8d`; local HEAD = `b342523` (`feat/marketplace-design-ui`). Parent `/home/tmk/project/market-place-mobile-app` ไม่ใช่ Git checkout ของแอป

| PR | สถานะขณะตรวจ | Target/base | Implication |
|---|---|---|---|
| [#97 marketplace design](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/97) | MERGED | main | มี UI เดิม/catalog/category/login-return ที่ต้อง preserve |
| [#92 ORDER-08/09](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/92) | MERGED | main | cancellation/expiry/adminorders เป็น baseline ใหม่ |
| [#93 INSPECT storage](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/93) | MERGED | feat/order-08-cancel-expiry | targetbranch merge ภายหลัง#92 ไม่ทำให้ main ได้ commit อัตโนมัติ |
| [#94 INSPECT API](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/94) | MERGED | feat/inspect-01-storage | มี result/cert/courierAPI ใน featurebranch; main ยังไม่มี router |
| [#95 INSPECT mobile](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/95) | OPEN | feat/inspect-02-03-api | reuse เมื่อ integrate; head b64687d |
| [#96 local demo](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/96) | OPEN | feat/inspect-mobile-flow | demo tooling ไม่ใช่ productionreadiness |
| [#99 auth refresh](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/99) | MERGED | feat/inspect-02-03-api | อ่าน latestAPIbranch ที่มี authorizationfix ไม่ย้อนทับ |

ตรวจ issue [#100 CERT](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/100) และ [#98 FINISH-00](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/98): มี ownerfeature/contract/dependency แล้ว ไม่สร้างงานซ้ำหรือปิดจาก redesign. ข้อมูล metadata เหล่านี้เปลี่ยนได้ ให้ refresh ก่อนลงมือ

Untracked งานเดิมใน repo: `docs/features/UX-00-guest-first-marketplace-plan.md`, `docs/prototypes/`. ไม่มีการ edit/reset/stash/clean งานเหล่านี้ในการวางแผนนี้

## 3. Source code observations

Paths relative to apprepo; สำหรับของใหม่ใน main ใช้ `git show origin/main:<path>` อ่านโดยไม่สลับ checkout

| Evidence | Finding |
|---|---|
| `mobile/package.json`, `mobile/AGENTS.md` | Expo57/RN0.86.3/Router57/Reanimated4.5.1; instruction อ่าน exactSDKdocs |
| `mobile/src/constants/theme.ts`, hooks/theme, app/_layout | navytokens/4fonts เดิม; StyleSheet/stores ไม่ใช่ NativeWind/Query/Zustand |
| `mobile/src/app/profile.tsx` | ยัง export LoginScreen; ต้องแยก ProfileScreen |
| `mobile/src/components/marketplace-nav.tsx` | 4tabs เดิม home/orders/sell/profile; prototype3tabs ต้องรักษา sellentry ผ่าน profile |
| `mobile/src/services/product-catalog-service.ts`, `backend/app/schemas/product.py` | NEW/LIKE_NEW/GOOD/FAIR, decimalstringprices, publicsellerfield ยังไม่มี |
| `backend/app/api/auth.py`, `schemas/auth.py`, `models/user.py` | oldrole-selection/nullroles; User ID integer, authsubject UUID คนละ field |
| `backend/app/api/verifications.py`, schemas/admin APIs | GET /verifications/me + multipartPOST; Seller-only guard, no shop_name; privatebank/idcardflow เดิม |
| `backend/app/api/orders.py`, main pricing/schema | buyer-only purchaseguard บางจุด; owner-basedview; 50shipping+100inspection+5%commission; #92 adds cancellation/expiry |
| `origin/main:backend/app/main.py` | ไม่มี inspectionrouter ใน 8254f8d |
| `origin/feat/inspect-02-03-api:backend/app/api/inspections.py` | realintegerIDs, existingroutes, evidence1–5/summary10–2000, positivecertatomic, publiccertJSON |
| `origin/feat/inspect-mobile-flow:mobile/src/services/inspection-service.ts` | existingtypedclient/requesttimeouts/methods ที่ reuse ได้; ไม่สร้าง/api/v1parallelclient |
| installed Reanimated `lib/typescript/index.d.ts` | มี withSequence/withTiming/withRepeat/withDelay; ไม่มี withKeyframes ใน export ที่ตรวจ |
| Backend test fixtures | บาง PGsuite ล้าง schema; conftest โหลด.env ต้องแยก disposabletestDB ก่อนรัน |

## 4. Visual inspection and reference contradictions

เปิด HTML ผ่าน localhost read-only server ใน browser และตรวจภาพจริง representative screens: darkBuyerprofile, darkcatalog, lightverificationform; ตรวจ DOM หน้า Buyerresult และ navigation. ตรวจ source ของทุก screenID. ไม่ได้ทดสอบทุก prototypeinteraction หรือพิสูจน์ accessibility ทั้ง prototype

- พบ 17 `.screen-view` IDs; 16productviews/states + mascotshowcase. README อธิบาย 7features และ 5tabs ซึ่งไม่ตรง HTML ปัจจุบัน
- HTML แสดง bottomnav3 รายการ หน้าแรก/คำสั่งซื้อ/ฉัน. อ้างอิง spec เลือก 3 รายการอย่างชัดเจน
- Lightverificationform มี warningcopy สีอ่อนบนพื้นอ่อนอ่านยาก; placeholder/CTA คู่สีบางคู่ไม่ผ่าน contrast ตามที่ claim. คำนวณ sRGBcontrast และบันทึกคู่สีใน spec; ไม่อ้างเป็น fullWCAGaudit
- HTML ยังมี GoogleFonts/remoteimages. Tailwind ไฟล์ local ไม่ได้ทำให้ assets ทั้งหมด offline100%
- Prototype ใช้ fixedsamplepeople/stats/rolelinks/resultbuttons/claimscopy. ย้าย geometry/layout ได้แต่ต้องแทนด้วย serverdata/authorization และ copy ที่ตรง contract

## 5. Planning verification boundaries

ทำ: อ่าน reference/code/contracts, fetch และอ่าน metadata, browserinspection, screeninventory, contrastcalculations, referencehashcopy และตรวจเอกสาร/links ตาม validation report.

ไม่ได้ทำ: เปลี่ยน appcode, dependencyinstall/upgrade, runappunittests, API/DBmutations, migrate ฐาน, จริง Googlelogin, Androiddeviceacceptance, push/merge/publish. เอกสารเก่าที่บอก tests ผ่านใช้เป็น regressioncontext เท่านั้น ไม่รายงานเป็นผลทดสอบครั้งนี้

Historical planning context: parent `../PROJECT-REVIEW-2026-09-26.md`, `../NEXT-WORK-SPEC-2026-09-26.md`, `../FULFILLMENT-00-delivery-proof-and-deadlines.md`, `../INSPECT-spec.md`, `../CERT-spec.md`, `../FINISH-spec.md`; newredesignspec บันทึกข้อ override เพื่อให้ session ไม่เลือกกฎตาม mock เอง
