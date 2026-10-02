# UX/UI contract สำหรับฉบับส่ง

> **Backend candidate 2 ต.ค.:** R1–R4 ใช้ `EXTERNAL_V2` สำหรับ Order ใหม่และคง `LEGACY_V1` สำหรับข้อมูลเดิม ดู [API mapping](reports/EXTERNAL-SHIPPING-API-MAPPING.md) และ [รายงาน R1](reports/EXTERNAL-SHIPPING-R1.md) ผล local PostgreSQL ไม่ใช่ independent PASS, E UI, shared rollout หรือ Android acceptance

ใช้ visual system และงาน UI ล่าสุดของทีม ชื่อแสดงใน release เลือก **2NDHAND**; identifiers `com.kmutnb.secondhandmarketplace` และ scheme เดิมคงไว้เพื่อลด OAuth migration; UI/สี/iconปรับตาม themeเดิม ไม่มี visual rewrite เพิ่ม

## Navigation และ role

| ผู้ใช้ | ทางเข้าหลักและสิทธิ์ |
|---|---|
| Guest | Home/search/productdetail/sellerreviews/publiccertificate; profileมีLoginCTA; ซื้อ/ขาย/Orderต้องlogin |
| BUYER | Home, Ordersของตน, Profile/name/policy, สมัครSeller; checkoutและdecision/receipt/reviewของOrderตน |
| approved SELLER | Buyer capabilities + Myproducts/Newproduct/verification + sales/center/return/payout; แยกซื้อของตนเองจากขาย |
| INSPECTOR | Workqueue/centerreceive/inspectionphotos/result/outbound; ไม่เห็นcustomerfinancialdetailที่ไม่จำเป็น |
| COURIER (legacy) | คงข้อมูลย้อนหลัง; ไม่สร้าง workspace หรือกำหนดให้บริษัทภายนอกล็อกอินใน flow ใหม่ |
| ADMIN | Verification/necessaryassignment/scoped delivery-return exceptions/revoke + shipping demo events ที่ระบุว่าจำลอง; ไม่ต้องมีgeneraluserdashboard |

สิทธิ์จาก backend เท่านั้น ปุ่มหรือ routeguardบนclientไม่ใช่authorization ไม่มีrolepickerที่เปิดSELLER/ADMINได้เอง

## สอง journeys บังคับ

### ขายสำเร็จ

Browse → loginเมื่อซื้อ → Order/quote/addresssnapshot → จ่ายเงินจำลองแบบpersisted → Sellerระบุreturnaddress/carrier/trackingก่อนshipcenter → Inspectorยืนยันรับ → InspectorบันทึกPASSหรือMINOR_ISSUEพร้อมcertificateatomic → Buyer **ยอมรับผลตรวจภายใน72h** → Inspectorส่งTO_BUYERพร้อมcarrier/tracking → Buyer **ยืนยันได้รับสินค้า** (หรือ eligible AUTO หลัง trusted delivery event +72h) → COMPLETED/RELEASED → Review → Sellerpayoutหัก5%ที่บันทึกไว้

### คืนเงิน

Paid/center/inspection → PASS/MINOR_ISSUEที่BuyerREJECTหรือไม่ตอบ72h **หรือ** FAKE/NOT_AS_DESCRIBED → TO_SELLERที่ใช้returnaddresssnapshot → Sellerยืนยันรับคืนหรือscoped audited Admin confirmation → RETURNED_TO_SELLER/HELDถ้ารอsettlement → REFUNDEDตามcause/policy: BuyerREJECT/result timeoutคืนเฉพาะค่าสินค้า; negativeinspectionคงเต็มยอด → originalreceiptยังดูได้ + refundreference; ProductCANCELLED

## Screen rules

- Home: guestusable, searchทำงาน, card/price/stockจากAPI, boundedpagination, loading/error/emptyretry
- Checkout: แสดงsnapshotfees, simulationlabel, idempotencykeyคงเดิมต่อattempt, networkuncertainให้refetch persistedOrder/Payment; receiptออกจากsuccessfulbackendstateเท่านั้น
- Inspectionresult: certificateเมื่อpositivefinalresultทันที; CONFIRM/REJECTเฉพาะeligiblepositiveก่อนserverdeadline; แสดง72hผลตรวจ→หมดเวลาส่งคืน ไม่มีautoaccept; negativeแสดงreturnflow ไม่มีconfirm
- Delivery: carrier/trackingและสถานะtrusted event/ผู้รับยืนยันแยกกัน; ไม่มีCourierworkspaceใหม่หรือรูปบังคับ; countdownจากserverdeadline; receiptbuttonกับnotreceivedreportแยกaction; ที่/หลังdeadlinewritesถูกปฏิเสธตามDBclock; trackingของSellerไม่เริ่มAUTO; ใช้refreshแสดงจริง อย่าทำsettlementในclienttimer
- Pendingretry: ถ้าactualreturnreceiptcommittedแต่refundล้มเหลว แสดง "รับคืนแล้ว กำลังดำเนินการคืนเงิน" ไม่เรียกREFUNDED; workeroutageยังHELD ไม่ปล่อยเงินเอง
- Adminresolution: scopedcase/evidence refs/reasonrequired; ต้องเห็นsame-case report/return evidenceและaudit; ไม่เลือกยอด/ผู้รับเอง
- Reviews/profile: [API contract](PROFILE-REVIEWS-contract.md); เอาฟิลด์/mockstatsที่อยู่นอกscopeออก; persistedชื่อและคะแนนเท่านั้น
- Certificate: publicHTTPSopaqueQR, ไม่ต้องlogin, noPII; REVOKEDแสดงชัดและinvalidtokennotfound; ไม่เผยprivatereasonnotes
- Permissions: save/error/loading/disabledactionsตามserverflags, staleaccountguard, retryไม่duplicate, imagepermissionsมีคำอธิบายตรงproduct/verification/proofuse
- Privacy: publicreviewsไม่เผยrealname; privateproof/identityviewอยู่หลังauthorization; policytextไม่อ้างdelete/exportUIที่ยังไม่มี

## ข้อความที่ต้องตรงกัน

| กรณี | ข้อความแนะนำ |
|---|---|
| Payment | "ชำระเงินจำลองสำหรับต้นแบบ" |
| Payout | "ยอดจ่ายให้ผู้ขายจำลองที่บันทึกในระบบ" |
| Refund: reject/timeout ใหม่ | "คืนค่าสินค้าจำลอง {amount} บาท; ไม่คืนค่าตรวจ {inspection} และค่าส่ง {shipping}" ใช้ยอดจากAPI ไม่หักซ้ำ |
| Refund: cause อื่น | "คืนเงินจำลอง {amount} บาท" และรายละเอียดcause/allocationsจากAPI |
| Resultdecision | "ยอมรับผลการตรวจ" / "ปฏิเสธผลการตรวจและส่งคืน" |
| Receipt | "ยืนยันว่าได้รับสินค้าแล้ว" |
| Nonreceipt | "แจ้งว่ายังไม่ได้รับสินค้า" |
| Receiptwindow | "เมื่อระบบได้รับสถานะขนส่งว่าส่งถึงแล้ว โปรดยืนยันรับหรือแจ้งไม่ได้รับภายในเวลาที่แสดง; ระบบประมวลผลเมื่อถึงเกณฑ์" สถานะขนส่งเดโมต้องมีป้ายจำลอง |
| Resultwindow | "โปรดยอมรับหรือปฏิเสธผลตรวจภายในเวลาที่แสดง หากไม่ตอบ ระบบจะเปลี่ยนเป็นขั้นตอนส่งคืนผู้ขาย" |
| Zeroreviews | "ยังไม่มีรีวิวจากผู้ซื้อที่ซื้อสำเร็จ" |

## Diagrams

[Class](diagrams/class-core.puml), [Order state](diagrams/order-state.puml), [Successful sale sequence](diagrams/sale-sequence.puml), [Return/refund sequence](diagrams/return-sequence.puml), [Use cases](diagrams/use-cases.puml), [Architecture](diagrams/architecture.puml) อธิบาย targetrelease ไม่ใช่หลักฐานว่า codeครบ R1 ปรับ sources/rendered ให้ตรงกับ backend candidate แล้ว; E และงาน13ยังต้องตรวจ UI/final release ก่อนส่งจริง
