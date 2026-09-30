# Wondee — UI/UX Production Implementation Specification

Revision 1.0 · 27 September 2026 · Lead planning handoff

**เป้าหมาย:** เปลี่ยนแอป Expo เดิมให้ใช้ภาพลักษณ์ Wondee จาก prototype ที่ผู้ใช้ให้ ครอบคลุมหน้าผู้ใช้ทั่วไป ผู้ขาย ผู้ตรวจ และหน้าระบบเดิมที่ต้องรักษาไว้ พร้อม flow ที่ใช้ API จริงและเกณฑ์รับงานที่ตรวจซ้ำได้ ไม่สร้างแอปใหม่

คำว่า production ในชื่อหมายถึงคุณภาพ implementation และความพร้อมส่งต่อ ไม่ได้อนุญาตให้ deploy ใช้งานจริง หรือเปลี่ยน payment/shipping จำลองเป็นเงินจริง

## 1. ขอบเขตและวิธีอ่าน

### 1.1 สิ่งที่ session ลงมือต้องส่ง

1. Design system มรกต/teal ทั้ง dark/light, ฟอนต์ไทย, shared components, mascot และ loading states ตามข้อ 4
2. Guest-first catalog → detail → login → checkout; profile ใหม่พร้อมขอเปิดร้าน, verification states, Seller ซื้อสินค้าอื่นและมีมุมมองซื้อ/ขาย
3. เปลี่ยนหน้าปัจจุบันทั้งหมดที่ผู้ใช้เข้าถึงใน flow นี้ รวม create/edit product, receipts, Admin verification แม้ไม่มีภาพเฉพาะใน prototype
4. เตรียมหน้าตา inspection/seller ship/result/certificate ตามต้นแบบ และเชื่อม implementation เดิมเมื่อมีในฐานที่ผ่าน gate ข้อ 3.2; ระหว่าง dependency ยังไม่พร้อม หน้าจอต้องแสดง unavailable อย่างตรงไปตรงมาและมี preview/test coverage แยกจาก production
5. Regression tests สำหรับพฤติกรรมที่เปลี่ยน, screenshots เปรียบเทียบ, รายงานสิ่งที่ verified / blocked / not run พร้อม build SHA

**สมมติฐานขอบเขตที่ Lead เลือกสำหรับ handoff:** รวม backend เฉพาะที่จำเป็นต่อ UX (default Buyer, ขอเปิดร้าน, promotion เป็น Seller, Seller ซื้อได้, public shop name). การสร้าง CERT decision/FINISH settlement/worker เต็มระบบไม่รวมในงาน redesign นี้; เป็น dependency ของ feature เดิม ถ้าผู้ใช้เลือกขอบเขตอื่นให้ปรับข้อ 1 และ prompt ให้ตรงกันก่อนลงมือ

### 1.2 สิ่งที่ไม่เพิ่มในรอบ redesign

ไม่สร้าง cart, chat, wishlist, coupon, review, notification backend/push, address book, wallet, payment provider, shipping provider, barcode scanner, การถอนเงินจริง, บังคับถ่ายวิดีโอ 4K หรือแก้ SRS PDF. ใช้ address form ของ checkout เดิม. Prototype controls สำหรับสลับ role/result/approval, ตัวเลขสถิติปลอม, mock checkout success และ showcase ไม่ปรากฏใน production

การเสร็จ UI ทั้งชุดกับการเสร็จระบบซื้อขายทั้งโครงการเป็นคนละเกณฑ์. ห้ามรายงาน full release complete หาก INSPECT/CERT/FINISH ยังมี dependency ค้าง

### 1.3 แหล่งอ้างอิงและลำดับตัดสิน

| เรื่อง | ลำดับอ้างอิง |
|---|---|
| ขอบเขตของงานนี้ | คำสั่งผู้ใช้ล่าสุด → ข้อเลือกที่ระบุในเอกสารนี้ |
| กฎเงิน/สิทธิ์/ผลตรวจ/ขนส่ง | `../FULFILLMENT-00-delivery-proof-and-deadlines.md`, `../INSPECT-spec.md`, `../CERT-spec.md`, `../FINISH-spec.md` และ contract ที่ผ่าน review ของ feature นั้น |
| Layout/ลักษณะการ์ด/mascot | `reference/index.html` และ `reference/mascot_showcase.html`; ข้อยกเว้นในข้อ 2 ชนะข้อความและ controls สาธิต |
| Design tokens/motion | `reference/DESIGN_SPEC.md` ตามข้อแก้ไข accessibility/SDK ในเอกสารนี้ |
| API ที่มีอยู่จริง | Source/router/schema/tests ของ integration SHA; เมื่อไม่ตรง spec ให้ลง gap พร้อม test ไม่แก้กฎธุรกิจจากรูป mock |
| เอกสารเดิม | `docs/features/UI-01-marketplace-design.md` ใช้เป็น regression baseline; `UX-00-guest-first-marketplace-plan.md` ใช้เป็นเป้าหมายใหม่ ไม่ใช้ตารางสถานะโค้ดเก่าของแผนนั้นเป็นข้อเท็จจริงปัจจุบัน |

`DESIGN_SPEC.md` ที่แนบไม่ใช่ schema/migration contract ที่นำไปรันได้ทันที. ห้ามคัด SQL, `/api/v1/*`, mock state machine หรือ code snippets เข้าแอปโดยไม่เทียบ repository

## 2. Decision register — ข้อขัดแย้งที่ตัดสินแล้วสำหรับงานนี้

| ID | ต้นฉบับ/ความขัดแย้ง | ข้อเลือกสำหรับ implementation |
|---|---|---|
| D01 | README/Design Spec บอก 5 tabs; HTML จริงใช้ 3 | ใช้ **หน้าแรก / คำสั่งซื้อ / ฉัน** ตาม HTML. หมวดหมู่เป็นชิปหน้าแรก; งานตรวจและขายเข้าผ่าน profile/order ตามสิทธิ์. ไม่สร้างแท็บว่างเพิ่ม |
| D02 | Spec ใช้ `/product/[id]` แต่แอป public detail เป็น `/products/[id]` | รักษา route เดิมและ deep links; ไม่ย้าย auth callback. ใช้ชื่อ route ตามตารางข้อ 5 |
| D03 | Prototype ให้ Buyer ขอเปิดร้าน แต่ API เดิมรับเฉพาะ Seller | ทำ UX backend prerequisite ในข้อ 6 ก่อนเปิดเส้นทางใหม่นี้จริง; frontend ไม่กำหนด role เอง |
| D04 | Prototype มี self-switch Buyer/Seller/Inspector | Role มาจาก `/auth/me` เท่านั้น. สวิตช์ซื้อ/ขายเป็นมุมมองของ order ไม่เปลี่ยนสิทธิ์. Staff/operator ไม่สมัครจาก UI |
| D05 | ตรวจสินค้าเป็น opt-in +150, ค่าส่ง 60, โปรฟรี | คงตรวจตาม flow โครงการ; อ่าน server quote/snapshot. Baseline ค่าส่ง 50.00 + ตรวจ 100.00, commission 5% หัก Seller. ไม่มี switch ปิดตรวจหรือคำนวณยอดจาก mock |
| D06 | PromptPay/บัตร/ธนาคารในต้นแบบ | แสดงช่องทาง **ชำระเงินจำลอง** ตาม existing payment API; ไม่สร้าง QR รับเงินจริง. Certificate QR เป็นคนละส่วน |
| D07 | Seller SLA 48h ใน spec | ใช้ 3 วันจากการจ่ายตาม FULFILLMENT. Countdown ต้องมาจาก server deadline; หาก API ยังไม่มี ไม่ทำ client timer ที่อ้างว่าระบบ enforce แล้ว |
| D08 | ผล PASS ส่งต่อทันที; ผลลบยอมรับได้/คืนทันที | PASS/MINOR รอ Buyer ตัดสินผล; NOT_AS_DESCRIBED/FAKE ไม่มีปุ่ม CONFIRM และไม่มีใบรับรอง; ส่งคืนก่อน refund ตาม FINISH. ไม่ยิง settlement จากปุ่ม UI |
| D09 | `UNDER_INSPECTION`, outcome เป็น order state | ใช้ `INSPECTING`; ผลทั้งสี่เป็น result แยกจาก order status. `CANCELLED` + reason EXPIRED ของ #92 ต้องคงอยู่ |
| D10 | SQL ใช้ UUID users/orders และตารางใหม่ | ตัวหลักจริงใช้ integer IDs; reuse `verifications`, `shipments`, `inspections`, `certificates` เมื่อมี. ไม่สร้าง `seller_applications`/`inspection_records` คู่ขนาน |
| D11 | Condition มี EXCELLENT/ตัวเลขเปอร์เซ็นต์ | คง NEW/LIKE_NEW/GOOD/FAIR; label ใหม่ตามข้อ 4.5. ไม่ map GOOD ไป EXCELLENT และไม่เติม % |
| D12 | อ้าง WCAG AAA แต่กำหนด 4.5:1; บางสีไม่ผ่าน | ใช้เกณฑ์ AA 4.5:1 สำหรับข้อความปกติ, 3:1 ข้อความใหญ่ตามเกณฑ์และส่วนควบคุมที่เกี่ยวข้อง; ไม่กล่าวอ้าง AAA. ปรับคู่สีตามข้อ 4.2 |
| D13 | `withKeyframes` ใน snippet | package Reanimated 4.5.1 ที่ตรวจไม่มี export นี้; ใช้ API ที่ติดตั้งจริง เช่น withSequence/withTiming/withRepeat + cleanup/reduced motion |
| D14 | NativeWind + Query + Zustand; repo ใช้ StyleSheet/stores | คงโครงสร้าง state/service/store/provider เดิม; ไม่ย้าย state library เพื่อเปลี่ยนหน้าตา. อนุญาตเพิ่ม SVG/gradient/ฟอนต์เท่าที่จำเป็นผ่าน Expo-compatible versions |
| D15 | Offline-ready 100% ใน README | HTML ยังโหลด Google Fonts และ remote images. Native bundle ฟอนต์/brand assets locally; ภาพสินค้ามาจาก API พร้อม fallback. ไม่รับรองว่า offline ซื้อสินค้าได้ |
| D16 | “ของแท้ 100%”, “คืนทันที”, “เข้ารหัส 256-bit”, PDPA และ review stars | ใช้ข้อความที่ contract รองรับ เช่น “ผ่านการตรวจตามรายงาน”, “เงินจำลองพักไว้”, “ดูสถานะการคืนเงิน”. ไม่คัดคำรับประกัน/มาตรฐานที่ไม่มีหลักฐาน. Buyer ไม่มีดาวรีวิว |
| D17 | ผลตรวจ Seller เห็นเหมือน Buyer ใน spec | คง owner/role privacy contract: Seller ดู progress; private final evidence เฉพาะ Buyer เจ้าของ/Inspector ผู้รับงานตาม API. ไม่ขยายสิทธิ์เพราะภาพ mock |
| D18 | สินค้า mock มีราคาขีดทับ ชื่อร้าน ยอดขาย | ราคาเดิม/ส่วนลด/สถิติต้องมี API field จริง; ถ้าไม่มีให้ไม่แสดง. เพิ่มเฉพาะ public seller projection ข้อ 6.4 |

ข้อเลือกเรื่อง 3 tabs, dark default และการรวม UX backend เป็นข้อเลือก Lead เพื่อให้เริ่มได้ ไม่ใช่มติ review จากทั้งทีมแล้ว. บันทึกการเปลี่ยนหากผู้ใช้ให้คำตอบต่างจากนี้

## 3. ฐานโค้ด การรักษางานเดิม และ dependency gates

### 3.1 ข้อเท็จจริงที่ตรวจ 27 ก.ย. 2026

- Repository: `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app`
- Checkout ตอนวางแผน: `feat/marketplace-design-ui` @ `b342523`; มี untracked `docs/features/UX-00-guest-first-marketplace-plan.md` และ `docs/prototypes/` ต้องรักษาไว้
- Fetched `origin/main`: `8254f8d` มี PR #97 UI เดิมและ #92 cancellation/expiry/admin orders. เริ่มงานจาก main ล่าสุดและตรวจอีกครั้ง ไม่ใช้ checkout เก่าเป็นฐานส่ง PR
- PR #93 MERGED **เข้า `feat/order-08-cancel-expiry`** และ #94 MERGED **เข้า `feat/inspect-01-storage`**; ไม่เท่ากับ merged to main. Main SHA ข้างต้นยังไม่ register inspection router
- PR #95 `feat/inspect-mobile-flow` @ `b64687d` ยัง OPEN บน `feat/inspect-02-03-api`; #96 เป็น demo เพิ่มเติม. Read/reuse เมื่อ dependency พร้อม ไม่เปิดงานซ้ำจากศูนย์
- CERT Feature #100 และ FINISH-00 #98 มีอยู่แล้ว. หลักฐานในรายงาน 26 ก.ย.เป็น historical baseline บางส่วนล้าสมัยแล้ว
- Stack ติดตั้ง: Expo ~57.0.21, Router ~57.0.20, RN 0.86.3, React 19.2.3, Reanimated 4.5.1. ไม่ downgrade Router ไป v4 ตามข้อความในต้นฉบับ

### 3.2 Gate ก่อนเชื่อมหน้า inspection/CERT

1. Refresh refs, issue/PR states; บันทึก SHA ของ main และ dependency ที่ใช้. ตรวจ containment ของ commit ไม่ใช้แค่คำว่า MERGED
2. ถ้า INSPECT อยู่ใน target base และ schemas/API/router ครบ ให้ปรับหน้าที่มีจาก #95 ต่อ พร้อม verify Order regressions; ไม่แทนที่ด้วย implementation ใหม่
3. ถ้ายังไม่มี ให้ทำ presentational components พร้อม explicit fixtures สำหรับ QA และ production unavailable states. ห้าม merge/cherry-pick active feature stack ทั้งชุดโดยถือว่า UI redesign อนุญาต integration/migration reconciliation โดยปริยาย
4. ใส่รายการงานเชื่อมต่อที่ค้างพร้อม file/API/PR/criteria ใน delivery report. ห้ามเรียก mock preview ว่า API-backed inspection หรือปิด #52/#100/#98 จากงานนี้
5. ถ้าผู้ใช้มอบหมาย integration เพิ่ม: แยก worktree/branch integration, ใช้ `../NEXT-WORK-SPEC-2026-09-26.md` INT-01 และ read current code. #92/#93 เปลี่ยน `orders.status` CHECK จาก predecessor เดียวกัน; no-op Alembic merge อย่างเดียวไม่พอ. ทดสอบ union states และ upgrade จาก branch revisions บน disposable PostgreSQL ก่อน UI binding

ความสามารถของ inspection UI เป็น configuration ของ build ที่ผูกกับ verified backend revision ไม่ได้เดาจาก role หรือ HTTP 500. ใช้ manifest ขนาดเล็กใน `mobile/src/features/feature-capabilities.ts` หรือ config เดิมที่เทียบเท่า แยก `inspection`, `certificatePublicHtml`, `certificateDecision`, `fulfillment` ไม่เปิดทุกอย่างด้วย flag เดียว ค่าเริ่มต้น false สำหรับความสามารถที่ยังไม่มี dependency; true ได้เมื่อ source/router/schema/QA ของความสามารถนั้นตรงกันและบันทึก backend revision ใน delivery report. เมื่อ true แล้ว API fail ต้องแสดง error/retry ห้าม fallback mock หรือปิด flag เงียบ ๆ. Flag ไม่ใช่ authorization; backend ตรวจ token/owner เสมอ

### 3.3 ระเบียบทำงาน

สร้าง worktree ใหม่จาก refreshed origin/main; ไม่ reset/clean/สลับ branch ทับ checkout ของผู้ใช้. ตรวจ AGENTS.md ทุก directory ที่แก้. การเปลี่ยนแปลงใน scope ทำต่อได้โดยไม่รออนุมัติย่อย; shared DB migration/deploy/remote merge/ส่งข้อความให้ทีมอยู่นอกขอบเขต prompt นี้

## 4. Design system ที่นำไปเขียนได้

### 4.1 Layout และ typography

- Android-first, Expo Web ใช้ตรวจ responsive; content max width 800dp ตามโครงเดิม, จอกว้างจัดกึ่งกลาง. ตรวจ 320/390/430/768px. ไม่วาด phone frame/status bar ปลอมจาก prototype ในแอป
- Spacing scale 4/8/12/16/20/24/32dp; screen gutter 20dp (16dp ที่ 320px), grid gap 12dp; card radius 16dp, highlighted profile card 24dp; input/button radius 12dp; pill 999dp
- 2-column catalog; ที่ text scale สูงมากซึ่งอ่านสองคอลัมน์ไม่ได้ ให้เปลี่ยนเป็นหนึ่งคอลัมน์อย่างตั้งใจ. Image aspect ratio 1:1 บน card และ 4:3 หน้า detail
- Minimum touch target 48×48dp, CTA height min 48dp; safe area บน/ล่างและ keyboard inset ต้องรวมใน layout. Sticky CTA ห้ามบัง field/error/แถวสุดท้าย; stack detail ไม่แสดง bottom nav ซ้อน CTA
- ฟอนต์ Prompt สำหรับไทยและเนื้อหา, Plus Jakarta Sans สำหรับ wordmark/ตัวเลขละตินที่เหมาะสม. Bundle weights 400/500/600/700/800 ที่ใช้จริงพร้อม license; ใช้ expo-font เดิม. ระหว่าง font error มี system/ฟอนต์ไทยเดิม fallback และไม่ค้าง splash
- Scale: Display 28/34 weight800, H1 22/28 700, H2 18/24 700, H3 16/22 600, body 14/20 400–500, caption 12/16 500. Micro 10/14 ใช้เฉพาะตกแต่ง; ข้อมูลสำคัญและ error อย่างน้อย 12. ไม่ปิด font scaling เพื่อให้ภาพเหมือน mock

### 4.2 Tokens และ contrast overrides

ให้คงชื่อ Colors ที่ consumer เดิมใช้แล้วเพิ่ม semantic aliases; migration ทั้งแอปใช้ theme source เดียวกัน รวม Navigation Theme/StatusBar/modal/input/web focus. ไม่ hardcode สีซ้ำในแต่ละหน้า

| Token | Dark | Light |
|---|---|---|
| canvas / background | #0c0e14 | #f8fafc |
| surface / card | #161b26 | #ffffff |
| container | #0f131c | #f1f5f9 |
| elevated | #1e2433 | #ffffff |
| border subtle (decorative) | #1e293b | #e2e8f0 |
| text primary | #f8fafc | #0f172a |
| text secondary | #94a3b8 | #475569 |
| brand decorative | #10b981 | #059669 |
| CTA fill | #10b981 | #047857 |
| CTA text | #022c22 | #ffffff |
| price / actionable text | #34d399 | #047857 |
| input fill | #1e293b | #ffffff |
| input text | #f8fafc | #0f172a |
| input placeholder | #94a3b8 | #475569 |
| input boundary | #64748b | #64748b |
| focus | #10b981 | #047857 |

Warning/danger/info ใช้ colored icon + text + soft background ที่ตรวจ contrast ต่อคู่จริง; ความหมายไม่อาศัยสีอย่างเดียว. Profile upgrade card light ใช้ #ecfdf5 → #ffffff, border #a7f3d0, text #064e3b; dark ใช้ dark emerald → surface พร้อม text สว่าง. Gradient เป็นตกแต่ง ไม่วาง body สีอ่อนบน mint อ่อน

คู่สีต้นฉบับที่คำนวณได้: white/#10b981 = 2.54:1; white/#059669 = 3.77:1; #94a3b8/white = 2.56:1; #64748b/#1e293b = 3.07:1. ห้ามใช้กับ body/placeholder สำคัญ. Overrides white/#047857 = 5.48:1, #94a3b8/#1e293b = 5.71:1 และ #475569/white = 7.58:1. ต้องตรวจ actual composited colors ของ gradient/opacity ด้วย

Theme preference เก็บ `system|dark|light` ใน AsyncStorage สำหรับการแสดงผลเท่านั้น; first install default **dark** ตาม design, ผู้ใช้เปลี่ยนใน profile ได้. `system` ต้องติดตาม OS จริง. Hydration ไม่ทำ theme flash ชัดเจน; ไม่เก็บ token/private data ใน theme store

### 4.3 Shared components และตำแหน่งเสนอ

คง `mobile/src/components/` และ provider/store pattern. แยก reusable files เมื่อมีหลาย consumer จริง:

- `wondee/ScreenShell`, `Header`, `BottomNav`, `Card`, `Button`, `TextField`, `StatusBadge`, `EmptyState`, `ErrorState`, `Skeleton`, `ImageViewer`, `ConfirmationSheet`
- `wondee/WondeeLogo`, `WondeeMascot`, `WondeeWordmark`; SVG จากต้นฉบับเป็น geometry assets ไม่ใช้ emoji เป็น brand asset หลัก
- `profile-screen.tsx` แยกจาก `login-screen.tsx`; `profile.tsx` ปัจจุบัน export LoginScreen ต้องแก้ให้ตรงหน้าที่
- ใช้ `marketplace-nav.tsx`, `marketplace-header.tsx`, `marketplace-icon.tsx`, `product-catalog-ui.tsx`, `order-ui.tsx` เป็น adapter/consumer ของชุดใหม่ ไม่ทิ้ง duplicate system สองชุด
- ไฟล์ presentation สำหรับ inspection ที่มีใน #95 (`inspection-order-panel.tsx`, app routes/services) ให้ reuse หากรวมแล้ว; ถ้าไม่รวมให้เขียน component props สำหรับ state จริงและ fixtures ใน testing เท่านั้น ไม่เรียก nonexistent API

### 4.4 Mascot และ motion

- Geometry: emerald rounded/drop body, mint leaf #00baa7, eyes #022c22, สองเท้า; selected Me tab solid, inactive outline. Icon artwork 28–32dp ใน target 48dp; profile 64dp; hero/result 80–96dp
- Variants: neutral/nav, courier, inspector, pass, minor, discrepancy, fake, certificate seal. Decorative SVG ไม่อ่าน path ทีละชิ้นผ่าน screen reader; มี text result บอกความหมาย
- Nav blink cycle 2500ms: ค่า scaleY 1 ที่ 0–72%, .12 ที่ 78%, 1 ที่ 84%, .12 ที่ 90%, 1 ที่ 100%. ใช้ valid animation API; cancel ตอน unmount/background/inactive screen. ไม่ใช้ setInterval ทำ React re-render ทุกเฟรม
- Respect reduced-motion: ตานิ่ง ไม่ bob/shimmer/sweep; loading ใช้ static skeleton พร้อมข้อความ/สถานะ busy. Stop offscreen animation; วัดความลื่นจริงก่อนอ้าง 60fps
- Skeleton sweep 1400ms, dark base #1e293b + white .18 beam; light #cbd5e1 + white .95. ขนาดรูป/card/text reservation เท่ากับ real layout, ห้ามใส่ artificial loading delay หรือบัง cached content ทุก refresh

### 4.5 Content mapping

| API condition | Label ที่แสดง |
|---|---|
| NEW | สภาพใหม่ |
| LIKE_NEW | สภาพเหมือนใหม่ |
| GOOD | สภาพดี |
| FAIR | สภาพพอใช้ |

Unknown enum = ข้อมูลสภาพไม่พร้อมใช้งาน; ไม่อ้างว่า GOOD. ไม่มี % ใน condition badge; ค่าธรรมเนียม 5% ที่ถูกต้องไม่ใช่ condition. Money เก็บ decimal strings เดิมและ format เพื่อแสดงเท่านั้น; ไม่คำนวณ quote จาก float. วันที่เก็บ UTC และแสดงตาม locale/timezone ผู้ใช้; ไม่ hardcode เดือน/วัน mock

## 5. Screen/route map และพฤติกรรมบังคับ

17 screen IDs ใน HTML มี 16 screens/states ของผลิตภัณฑ์ + 1 showcase. ไม่ตีความเป็น 17 API features หรือ 17 routes แยก. ตารางนี้ครอบคลุมทุก ID และหน้าปัจจุบันที่ต้องรักษา

| ID ใน prototype | Route/component เป้าหมาย | ข้อกำหนดหลัก |
|---|---|---|
| profile-buyer | `/profile` → ProfileScreen | ชื่อจริงจาก me, role จริง, upgrade card/status, orders, display settings, logout; no buyer stars/fake counters |
| profile-guest | `/profile` (guest state) | Google CTA → `/login`; home browse ได้; ไม่เรียก private verification/orders ก่อน login |
| login | `/login`, `/auth/callback` เดิม | Google flow เดิมพร้อม loading/cancel/error; เอา role chooser ออกเมื่อ UX backend พร้อม; successful return ไม่สร้าง order อัตโนมัติ |
| verify-form | `/seller-verification` | Shop name + bank fields + card upload; labels ชัด; keyboard/focus/field errors; same private upload flow |
| verify-status-pending | `/seller-verification`, profile summary | PENDING, เวลา server, refresh; ห้ามส่งซ้ำ/ลงขาย; ยังซื้อได้ |
| verify-status-approved | routes เดิม | APPROVED หลัง me refresh แล้วมี Seller; CTA ลงสินค้า/My products; ห้ามเปลี่ยน role optimistic |
| verify-status-rejected | routes เดิม | เหตุผลจริง, แก้และส่งใหม่; ไม่ทำ fake approve timer |
| product-list | `/`, `/products` | public 2-column grid, search debounce/stale protection/pagination เดิม, categories จาก API, failed images fallback |
| product-detail | `/products/[id]` | gallery 4:3, full title, price, condition, seller projection, description, inspection info; full-width “ซื้อสินค้า”; no chat |
| checkout | `/checkout/[productId]` | real quote, address editing, simulated payment copy, deliberate submit; preserve idempotency/uncertain outcome handling |
| orders-list | `/orders` | BUYER/Seller purchase view + Seller sales view, correct endpoint role, account-isolated rows; filter จากข้อมูล/API ที่มีเท่านั้น |
| order-detail | `/orders/[orderId]` | snapshot/receipt/timeline/actions from server; preserve #92 cancel/expiry/retry and unknown-state safety |
| seller-ship | `/orders/[orderId]/ship-to-center` (new screen wrapper) | owner Seller + correct state; carrier/tracking API; registered only as real integration when gate passes; missing capability → unavailable |
| buyer-result | `/orders/[orderId]/inspection` (new wrapper) | orderId เป็น integer จริง; owner Buyer-as-capability; 4 outcomes/private evidence/cert data; decision only with CERT capability |
| inspector-queue | `/inspections` ตาม #95 | staff-only, API queue/offset pagination/filter; no Buyer entry to staff view |
| inspector-work | `/inspections/[inspectionId]` ตาม #95 | receive → start → upload → final; server transitions; result summary 10–2000/evidence 1–5 |
| mascot-showcase | dev preview/QA only | ไม่เพิ่มเป็น route สาธารณะใน release; แสดง variants สำหรับตรวจภาพ |
| ไม่มีภาพเฉพาะ | `/sell` | entry compatibility; Seller approved ไป mine/new, Buyer ไป apply, pending/rejected ไป status; ไม่ทำ self-elevation |
| ไม่มีภาพเฉพาะ | `/product/new`, `/product/mine`, `/product/[id]/edit` | theme เดียวกัน; retain 1–10 JPEG/PNG product images, upload binding, edit/cancel/draft/recovery |
| ไม่มีภาพเฉพาะ | `/receipt/[orderId]` | server receipt/history after payment; monetary snapshot unchanged |
| ไม่มีภาพเฉพาะ | `/admin-verifications` | role guard, private evidence, approve/reject; shop name ใหม่; ใช้ tokens ใหม่ |
| ไม่มีภาพเฉพาะ | `/buy-by-product-id` | คง compatibility ถ้ายังมีลิงก์; ไม่เป็นเส้นทางซื้อหลักของ catalog |

### 5.1 Navigation และ login-return contract

- Bottom nav แสดงบน root Home/Orders/Profile เท่านั้น; current selection ตรง route. Android back จากรายละเอียดคืนหน้าต้นทางและ query/category ที่เหมาะสม
- Preserve `auth/marketplace-return*`: expiry 30min, allowlist internal destinations, consume ครั้งเดียวหลัง server verification, clear เมื่อ cancel/logout/account mismatch; ไม่รับ arbitrary URL
- Guest กด buy → login → review checkout ของ product เดิม. ถึงจุดนี้ยังไม่มี POST create order. Product unavailable หลัง login ต้องแสดง conflict/back ไม่ส่งรายการซื้อเอง
- Orders/Sell/Inspection entry ที่ต้อง auth ใช้ guard เดิม; direct route ต้องตรวจด้วย ไม่ใช่แค่ซ่อนปุ่ม. Suspended/closed account ไม่มี private/mutation access
- Profile เป็น hub สำหรับ `สินค้าของฉัน`, `ลงสินค้า`, `คำสั่งซื้อ`, `งานตรวจ` ตาม capability. ห้ามเอา Inspector controls ใน mock มาแสดงแก่ Buyer

### 5.2 Catalog/detail

ค้นหา/เปลี่ยนหมวดใช้ store เดิม, reset page ตาม contract, ไม่โหลดทุกหน้ามากรองเอง. `q`/`category_id` มาจาก input/options ที่ถูกต้อง; no hardcoded category IDs. Preserve public visibility AVAILABLE/active approved Seller และ expiry release ของ main

Hero inspection ถ้าจะใส่ตาม Design Spec ให้ใช้ข้อความ “เลือกซื้อพร้อมกระบวนการตรวจสภาพตามเงื่อนไขบริการ” และ CTA เปิดข้อมูลบริการจริง; ไม่อ้างว่าสินค้าทุกชิ้นตรวจผ่านก่อนขาย. Product detail แสดง “ตรวจหลังชำระเงินตามขั้นตอนของระบบ” แทน badge certified ก่อนมีผลตรวจ

### 5.3 Checkout/order

คง create order และ payment เป็นการกระทำที่ server แยกกัน. UI ใช้ “ยืนยันคำสั่งซื้อ” ก่อนสร้างและ “ชำระเงินจำลอง” ในขั้น payment. Double tap/timeout ไม่สร้าง key ใหม่จนแก้ uncertain state; refresh/replay ตาม existing store. ไม่ยุบเป็น fake one-click success

Timeline เป็น view model จาก **สถานะและ timestamps จริง**. ไม่ mark completed step จากลำดับ array อย่างเดียวเมื่อ CANCELLED/REFUNDED/unknown. Payment ดู `paid_at`/receipt capability ไม่ใช้ `status !== WAITING_PAYMENT`. Countdown ถึงศูนย์ให้ refresh; client ไม่เปลี่ยน order เป็น cancelled เอง

### 5.4 Inspection/result/certificate presentation

- Seller form carrier/tracking trim 1–100; barcode icon เอาออกเมื่อไม่มี implementation. ไม่บังคับ 4K หรือ 4-sided photos เพิ่มจาก accepted contract
- Inspector รับได้หลัง Courier TO_CENTER proof ตาม current API; Seller แจ้งส่ง ≠ Courier ส่งถึง ≠ Inspector รับ. UI บอกเหตุผลเมื่อยังรับไม่ได้
- Work step 1 receive; step 2 start + inspect/evidence; step 3 choose result/summary/review. Final action: positive ใช้ “บันทึกผลและออกใบรับรอง”; negative ใช้ “บันทึกผลตรวจ”. Confirm sheet แสดง outcome/summary/photo count; POST สำเร็จจึง lock
- รูปตรวจ JPEG/PNG/WebP แบบนิ่ง ≤5MiB/รูป จำนวน selected 1–5; ไม่สับสน product images 1–10 หรือ courier proof 1–3. ไม่มีภาพสุดท้ายที่ upload ล้มเหลวปนใน evidence_ids
- PASS: “ผ่านการตรวจตามรายงาน”; MINOR: “ผ่านการตรวจ พบข้อสังเกต”; NOT_AS_DESCRIBED: “พบข้อมูลไม่ตรงประกาศ”; FAKE: “ผลตรวจระบุว่าไม่ผ่านการตรวจความแท้”. แสดง summary จริง ไม่ใส่รอย/อุปกรณ์ขาดตาม mock
- Image viewer รองรับขยาย/ปิด/back/accessibility; fetch authorized evidence ตาม origin ที่ยอมรับ ไม่แนบ bearer ไป arbitrary URL; ล้างภาพ/requests ทันทีเมื่อ account เปลี่ยน
- Certificate modal อ่าน certificate_no/public_url/issued_at/result จริง; positive เท่านั้น. QR ต้อง encode URL token ที่ backend ตั้งไว้ ไม่ generate certificate number/token ฝั่ง UI และไม่ใช้รูป QR จำลอง. ห้ามเรียก public URL ว่า HTML พร้อมใช้ถ้า endpoint ยังคืน JSON
- เมื่อ CERT-04 พร้อม แสดง CONFIRM/REJECT ผลตรวจเฉพาะ `can_decide` จริง; reject มีเหตุผลและ confirmation; replay/409 refresh. ถ้ายังไม่มี endpoint ซ่อน action พร้อมข้อความ “การตัดสินผลตรวจยังไม่เปิดใช้งานในรุ่นนี้”; ไม่บันทึก local decision แทน
- FINISH controls “ยืนยันว่าได้รับสินค้า/ยังไม่ได้รับสินค้า” เป็นคนละส่วนกับ inspection decision; แสดงเฉพาะ backend capabilities ที่มีจริง. ไม่ใช้ event รับรองผลไปเปิด shipment/release/refund เอง

### 5.5 Standard states ทุก data screen

`initial loading`, `success`, `empty`, `refreshing-with-data`, `pagination loading/error`, `offline/network error`, `server error`, `unauthorized/expired`, `forbidden`, `not found`, `submitting`, `uncertain mutation`, `capability unavailable` แยกความหมายตามที่เกี่ยวข้อง. Error ไม่กลายเป็น empty; backend fail ไม่ fallback mock. Preserve harmless draft เมื่อ retry; clear private draft/cache ต่อ identity boundary. Form errors อยู่ใกล้ field และมี summary ที่อ่านได้

## 6. Backend/DB prerequisite เฉพาะ UX ใหม่

เป็น **target contract ใหม่** ของ redesign ไม่ใช่สิ่งที่ baseline ทำได้แล้ว. ทำพร้อม tests/migration/เอกสาร `VERIFY-00` และ auth compatibility; ห้ามทำแค่ UI ซ่อน role chooser แล้วปล่อย new user role=null

### 6.1 Identity และการซื้อ

- `POST /auth/google`: new customer ได้ BUYER จาก server; returning account คง role/status เดิม. Legacy optional role ใน body ต้องไม่ให้ self-elevate: ยอมรับเพื่อ compatibility แต่เพิกเฉยต่อการกำหนดสิทธิ์; new client ไม่ส่ง field นี้. Regression ทดสอบ role=SELLER/ADMIN ที่ปลอมมาไม่เกิด privilege escalation (invalid enum ยัง 422 ได้)
- Legacy `POST /auth/role`: ปิด self-select Seller. ถ้าค่า BUYER และบัญชี BUYER อยู่แล้ว replay current profile ได้; ถ้า legacy role=null ให้ normalize เป็น BUYER แบบ atomic. คำขอเปลี่ยนเป็น Seller หรือทับ role เดิมตอบ `409` code `role_selection_closed`; auth service แปล code นี้ได้โดยไม่ logout ผู้ใช้ผิด ๆ
- `/auth/me` คง response fields เดิม, source of role/status จาก DB; callback/login-controller ไม่เก็บ pending role selection อีกหลัง rollout
- Active BUYER หรือ SELLER ซื้อสินค้าอื่นได้; self-purchase ถูกปฏิเสธตามเดิม. การอ่าน/จ่าย/ยกเลิก/receipt ตรวจ **order.buyer_id + active customer** ไม่ hardcode UserRole.BUYER อย่างเดียว
- `GET /orders?role=buyer|seller` เป็นมุมมองเท่านั้น, ownership filter จาก token. ตรวจทั้ง `require_buyer`, `viewer_role_for`, payment/receipt/cancel และ inspection evidence หากรวม stack แล้ว; เปลี่ยน guard ให้ครบก่อนเปิด Seller purchasing
- ADMIN/INSPECTOR/COURIER ไม่ได้รับสิทธิ์ซื้อ/สมัคร Seller ผ่าน UX นี้. Existing staff provisioning ไม่เปลี่ยน

### 6.2 Seller application

ใช้ endpoints เดิม: `GET /verifications/me`, `POST /verifications` (multipart), Admin `/admin/verifications/*`. ไม่สร้าง `/api/v1/seller/apply` ใหม่

| Multipart field | Contract |
|---|---|
| shop_name | ใหม่: trim, 2–100 characters, nonempty, ไม่ unique; reject ไม่แก้ชื่อเงียบ |
| bank_name | คง validation เดิม; text/bank choices ไม่จำกัดแค่ 4 ปุ่ม mock |
| bank_account_name | คง field และ validation เดิม |
| bank_account_number | คง digit normalization/length/error เดิม; UI mask หลังส่ง |
| id_card_image | upload flow/size/MIME/private storage เดิม; permission denied/cancel มีข้อความ |

**ไม่เก็บเลขบัตร 13 หลักเพิ่ม** จาก sample SQL. รูปบัตร/private path ไม่อยู่ใน public projection. ไม่กล่าวอ้าง encryption/compliance ที่ยังไม่ได้ตรวจ. หากมี consent ในระบบเดิมให้รักษา; ไม่แต่งนโยบายกฎหมายขึ้นเอง

Active BUYER และ legacy SELLER อ่าน/ส่งได้ตามสถานะ. ไม่มี record → NOT_SUBMITTED, pending/approved → `can_submit=false`, rejected → `can_submit=true`. Pending/Rejected Buyer ยัง BUYER และซื้อได้. Concurrent submit ต้องคง one-pending constraint/cleanup uploaded orphan เดิม

Admin approve latest PENDING: lock แบบลำดับเดียวกันใน submit/review, recheck actor ACTIVE/ADMIN และ target ACTIVE/customer, เปลี่ยน verification เป็น APPROVED + target BUYER→SELLER ใน **transaction เดียว**. Reject ไม่ promote. Concurrent approve/reject มี winner เดียว; approved old Seller คง Seller. Stale/non-latest review ไม่เปลี่ยน role. Refresh me หลัง review/focus/relaunch ก่อนแสดง selling controls

Response เพิ่ม `shop_name: string|null` ให้ VerificationResponse และ AdminVerificationItem/detail. ค่า legacy null แสดง placeholder ที่บอกไม่ระบุ; ไม่ย้ายข้อมูล sample ลง DB. Validation error ใช้ envelope เดิมและ `detail.fields.shop_name`

### 6.3 Migration/deployment compatibility

- เพิ่ม `verifications.shop_name VARCHAR(100) NULL` พร้อม constraint null หรือ trimmed 2–100; record เก่าไม่ถูกสมมติชื่อ. New submissions ต้องมีชื่อ; client เก่าที่ขาดชื่อได้ 422 พร้อม field error ไม่ promote เอง
- Backfill เฉพาะ users.role IS NULL → BUYER และตั้ง default ที่เหมาะสมหลังตรวจ stored enum; ไม่เปลี่ยน BUYER/SELLER/operator/status เดิม. ไม่สร้าง duplicate role/capability table
- Forward migration append จาก **head จริงที่เลือก**; ถ้า union migration ยังไม่พร้อมไม่เดา parent. ทดสอบ old data/empty/nonempty DB, constraints และ supported downgrade behavior บน PostgreSQL แยก
- Data backfill เลือกเป็น **forward-only normalization**: schema downgrade คง role ที่ normalize เป็น BUYER ไว้และบันทึกข้อจำกัดนี้; ห้าม rollback ทุก BUYER เป็น null หรือสมมติว่าแยกบัญชีใหม่กับ legacy ได้. การลด schema ที่มี shop_name แล้วทำได้เฉพาะการทดสอบฐาน disposable ใน session นี้; operator recovery ของข้อมูลจริงใช้ forward fix/backup ตามแผนแยก
- Rollout backend + schema compatibility ก่อน client ใหม่; new seller flow ต้องพร้อมทั้ง BE/FE. ห้าม deploy รอบนี้โดยอัตโนมัติ; ให้เอกสาร operator handoff. ฝั่ง client เก่าที่เคยเลือก Seller ต้องรายงานข้อจำกัด compatibility แทนการคืนช่องยกระดับสิทธิ์

### 6.4 Public seller projection

เพิ่มแบบ additive ใน public catalog item/detail:

```json
{"seller":{"display_name":"ร้านวนดีตัวอย่าง","verified":true}}
```

`display_name` อ่าน shop_name จาก latest APPROVED verification ที่ใช้ตรวจ public eligibility; legacy ไม่มีชื่อใช้ **“ร้านค้าที่ได้รับอนุมัติ”** แทนเปิด full_name เพิ่มเอง. นี่เป็นข้อปรับจาก fallback full_name ใน UX-00 เพื่อลดการเปิดเผยข้อมูลโดยไม่จำเป็น. `verified` หมายถึง seller approval เท่านั้น ไม่ใช่ตรวจสินค้าชิ้นนั้นแล้ว

ห้ามส่ง email/โทรศัพท์/ที่อยู่/เลขบัญชี/รูปบัตร/storage key. Existing consumers ที่ยังไม่มี seller field render ไม่มีชื่อร้าน/ข้อความ generic ได้; ห้าม fabricate verified badge. Frontend decoder รองรับ additive field และทดสอบ privacy response. Query ใช้ latest approval เดียวกับ filter ไม่ N+1 query ทุก card

## 7. API mapping และสถานะงานเชื่อมต่อ

| UI purpose | API เดิม/เป้าหมายที่ต้องใช้ | Availability ณ baseline |
|---|---|---|
| Auth/profile | `/auth/google`, `/auth/me`, compatibility `/auth/role` | main มี; ต้องปรับ UX default/promotion |
| Catalog | `GET /products?q=&category_id=&page=&page_size=`, `/products/{id}`, `/categories`, `/brands` | main มี; add seller projection |
| Seller application | `/verifications/me`, multipart `/verifications`, `/admin/verifications/*` | main มี; expand customer guard/shop_name |
| Product write | existing product service/upload endpoints | main มี; preserve contract |
| Quote/create/list/detail/pay/receipt/cancel | existing order-service methods/routes และ #92 | main มี; expand owner customer guards |
| Ship/progress | `/orders/{order_id}/ship-to-center`, `/orders/{order_id}/inspection-progress` | INSPECT branch; not registered in main 8254f8d |
| Inspector work | `/inspections`, `/{id}`, `/{id}/receive`, `/{id}/start`, `/{id}/evidence`, `/{id}/result` | INSPECT branch |
| Buyer result/evidence | `/orders/{order_id}/inspection`, `/inspection-evidence/{id}` | INSPECT branch; Seller-as-buyer guard ต้อง audit เมื่อเปิด UX |
| Public certificate | `/certificates/{token}` | #94 มี JSON; HTML/QR readiness อยู่ CERT #100 |
| Buyer decision | `POST /orders/{id}/inspection/decision` ตาม CERT spec | future contract; อย่า fake endpoint response |
| Courier/receipt/settlement/refund/timers | current integrated FINISH/COURIER contract | dependency #98/feature work; ไม่สร้างใหม่ใน redesign |

Domain error shapes เดิมต่างกัน: product `{error:{code,message,fields,request_id}}`, order/inspection `{detail:{code,message,...}}`, verification มี envelope เดิมของตน. Normalize ที่ service adapters ไม่ rewrite ทุก backend error เพื่อ UI. ทุก mutation เดิมรักษา idempotency/retry/timeouts (รวมอ่าน response body); status 401 refresh token ตามระบบ ไม่ loop retry business 403/409

## 8. Implementation map และลำดับลงมือ

Paths ต่อไปนี้ relative to app repo เว้นระบุเป็น parent planning docs. IDs `WUI-*` เป็น local planning IDs ไม่ใช่ GitHub issue numbers

| ID | งาน/ไฟล์หลัก | Dependency / Done |
|---|---|---|
| WUI-00 | worktree/baseline audit, record source snapshot, update UI handoff decisions | อ่านเอกสารครบ, main/PR containment และ untracked ชัด; ไม่แก้ runtime ก่อน |
| WUI-01 | `mobile/src/constants/theme.ts`, `hooks/use-theme.ts`, `app/_layout.tsx`, `global.css`, assets/fonts, new theme provider/shared components | theme/font/contrast/motion primitive ใช้ได้ทั้ง native/web; same theme source |
| WUI-02 | `backend/app/api/auth.py`, `schemas/auth.py`, `models/user.py`; auth services/provider/controller/callback; migration | default BUYER + role escalation tests; ไม่มี dangling role chooser |
| WUI-03 | `backend/app/api/verifications.py`, `admin_verifications.py`, `schemas/verification.py`, `models/verification.py`; services/verification/provider/forms/screens; migration | Buyer request → admin approval → role+approval atomic; private upload เดิม |
| WUI-04 | `backend/app/api/orders.py`, pricing/guards ที่เกี่ยวข้อง; public product serializer; mobile product/order services/stores | Seller-as-buyer owner authorization + projection; #92 tests still pass |
| WUI-05 | profile/login/sell/nav/header/catalog/detail/forms/order/checkout/receipt/admin screens + thin app routes | WUI01–04; complete live-supported core journeys |
| WUI-06 | inspection/seller ship/result/certificate views; reuse `inspection-service.ts`/#95 routes เมื่อพร้อม | ข้อ 3.2 gate; visual coverage ทุก outcome; API-backed ส่วนที่มี; exact dependencies ส่วนที่ยังไม่มี |
| WUI-07 | `mobile/component-tests`, `mobile/tests`, `backend/tests`, visual review, QA report/contracts | regression/build/migration เฉพาะที่แก้; evidence แยกประเภท |

ลำดับที่แนะนำ: baseline → tokens/primitives → UX contract DB/BE + adapters → screen rollout → inspection gate/binding → QA/cleanup. ทำทั้งหมดใน session เดียวตาม dependency ไม่หยุดหลังส่งแผน. ไม่ต้องเปลี่ยน architecture หรือ upgrade dependencies ทั้งชุด

การแบ่งความรับผิดชอบหากทีมรับต่อ: Lead ตรวจ D01–D18/ขอบเขต, FE รับ WUI01/05/06, BE+DB รับ WUI02–04, QA รับ WUI07 โดยให้ DB อีกคนตรวจ migration และ transaction. สำหรับ one-shot ให้ AI session เดียวทำงาน implementation เหล่านี้ต่อเนื่อง; ตารางนี้ระบุคนทบทวนและจุดส่งต่องาน ไม่ได้สั่งให้สร้างหลาย session

เมื่อแก้ role capabilities ใน repo ที่รวม INSPECT แล้ว ต้อง audit every `UserRole.BUYER` equality รวม private evidence, buyer decisions, receipts และ FINISH ownership; อย่าขยาย staff rights ไปด้วย. หาก dependency ไม่รวมให้ลง exact guard follow-up ใน integration report ไม่อ้างว่าผ่าน cross-feature Seller buyer acceptance

## 9. Verification และ definition of done

รายละเอียด scenario อยู่ [QA_ACCEPTANCE.md](QA_ACCEPTANCE.md). Commands จาก mobile package ที่ตรวจ:

```bash
cd /path/to/implementation-worktree/mobile
npm ci
npm run typecheck
npm run lint
npm run test:logic
npm run test:components -- --silent
npx expo export --platform web --output-dir dist/web
npx expo export --platform android --output-dir dist/android
```

ใช้ runtime ที่ตรง SDK 57; อ่าน `mobile/AGENTS.md` และ Expo versioned docs ก่อนเขียน mobile code. เมื่อเพิ่ม native dependency ใช้ `npx expo install` ตาม compatibility ไม่ `npm update` ทั้งโปรเจกต์

Backend รัน pytest suites สำหรับ auth/verification/admin/product reads/orders ที่แก้และ existing security/concurrency regressions. PostgreSQL migration/concurrency ใช้ disposable local DB; อ่าน fixture ก่อนเพราะบางชุด DROP SCHEMA. `.env` จริงไม่ใช่ test sandbox. `ORDER_TEST_DATABASE_URL` และตัวแปรชุดอื่นต้องชี้ฐานแยกที่สร้างสำหรับการทดสอบเท่านั้น; ไม่แสดง URL/secret ในรายงาน. เก็บผล skipped แยกจาก passed

Core redesign done เมื่อ UI+UX prerequisite ใช้งานจริงตามข้อ 1, automated checks ผ่าน, key screens reviewed ทั้งธีม/sizes, navigation และ private states ไม่รั่ว, delivery report มี exact artifacts. **Full visual coverage** ต้องครบ 16 product screens/states แม้บางส่วนยังถูก dependency gate. **Full integration complete** ต้องไม่มี pending API gates และมีหลักฐานจริงตาม feature นั้น; fixture screenshots/build export ไม่แทน Android/OAuth/Storage evidence

ส่งรายงาน `docs/features/WONDEE-UI-REDESIGN-DELIVERY.md` ใน implementation worktree: SHA/branch, decisions applied, changed files, screen→route→API table, test command/results, screenshots location, automated vs real integration vs device checks, unresolved dependency พร้อม next action. ห้ามปิด GitHub issue/publish/merge จากการผ่านงานเอกสารหรือ mock อย่างเดียว

## 10. เอกสารเทคนิคทางการที่ตรวจ

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) — ใช้ versioned docs และ install compatible modules
- [Reanimated withSequence](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSequence/) — ใช้ animation composition API ที่ตรงกับ installed exports
- [W3C Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — เกณฑ์ contrast; 4.5:1 ไม่ใช่คำรับรอง AAA

ข้อมูล SDK/API อาจเปลี่ยนหลังวันที่ตรวจ; implementation session ต้องอ่าน installed versions และ docs ตรงรุ่นซ้ำเมื่อเพิ่ม dependency
