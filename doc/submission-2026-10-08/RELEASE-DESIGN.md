# UX/UI contract สำหรับฉบับส่ง

ใช้ visual system และงาน UI ล่าสุดของทีม ชื่อแสดงใน release เลือก **2NDHAND**; identifiers `com.kmutnb.secondhandmarketplace` และ scheme เดิมคงไว้เพื่อลด OAuth migration; UI/สี/iconปรับตาม themeเดิม ไม่มี visual rewrite เพิ่ม

## Navigation และ role

| ผู้ใช้ | ทางเข้าหลักและสิทธิ์ |
|---|---|
| Guest | Home/search/productdetail/sellerreviews/publiccertificate; profileมีLoginCTA; ซื้อ/ขาย/Orderต้องlogin |
| BUYER | Home, Ordersของตน, Profile/name/policy, สมัครSeller; checkoutและdecision/receipt/reviewของOrderตน |
| approved SELLER | Buyer capabilities + Myproducts/Newproduct/verification + sales/center/return/payout; แยกซื้อของตนเองจากขาย |
| INSPECTOR | Workqueue/centerreceive/inspectionphotos/result/outbound; ไม่เห็นcustomerfinancialdetailที่ไม่จำเป็น |
| COURIER | Assignedqueue/legaddress/captureprivateproof/confirmdelivery; ไม่ใช้ unrestrictedOrderdetail |
| ADMIN | Verification/assignment/nonreceiptcase/revoke; ไม่ต้องมีgeneraluserdashboard |

สิทธิ์จาก backend เท่านั้น ปุ่มหรือ routeguardบนclientไม่ใช่authorization ไม่มีrolepickerที่เปิดSELLER/ADMINได้เอง

## สอง journeys บังคับ

### ขายสำเร็จ

Browse → loginเมื่อซื้อ → Order/quote/addresssnapshot → จ่ายเงินจำลองแบบpersisted → Sellerระบุreturnaddressก่อนshipcenter → Courierproof/Inspectorreceive → InspectorบันทึกPASSหรือMINOR_ISSUEพร้อมcertificateatomic → Buyer **ยอมรับผลตรวจ** → Inspectorส่งTO_BUYER → AssignedCourierconfirmproof → Buyer **ยืนยันได้รับสินค้า** → COMPLETED/RELEASED → Review → Sellerpayoutที่บันทึกไว้

### คืนเงิน

Paid/center/inspection → PASS/MINOR_ISSUEที่BuyerREJECT **หรือ** FAKE/NOT_AS_DESCRIBED → TO_SELLERที่ใช้returnaddresssnapshot → proofconfirmreturn → RETURNED_TO_SELLER/HELDถ้ารอsettlement → REFUNDEDเต็มยอด → originalreceiptยังดูได้ + refundreference; ProductCANCELLED

## Screen rules

- Home: guestusable, searchทำงาน, card/price/stockจากAPI, boundedpagination, loading/error/emptyretry
- Checkout: แสดงsnapshotfees, simulationlabel, idempotencykeyคงเดิมต่อattempt, networkuncertainให้refetch persistedOrder/Payment; receiptออกจากsuccessfulbackendstateเท่านั้น
- Inspectionresult: certificateเมื่อpositivefinalresultทันที; CONFIRM/REJECTเฉพาะeligiblepositive; negativeแสดงreturnflow ไม่มีconfirm; ไม่มีcountdownผลตรวจautoaccept
- Delivery: countdownจากserverdeadline; receiptbuttonกับnotreceivedreportแยกaction; ที่/หลังdeadlinewritesถูกปฏิเสธตามDBclock; ใช้refreshแสดงจริง อย่าทำsettlementในclienttimer
- Pendingretry: ถ้าreturnproofcommittedแต่refundล้มเหลว แสดง "ส่งคืนแล้ว กำลังดำเนินการคืนเงิน" ไม่เรียกREFUNDED; workeroutageยังHELD ไม่ปล่อยเงินเอง
- Adminresolution: scopedcase/evidence refs/reasonrequired; ต้องเห็นreport/proofจริงและaudit; ไม่เลือกยอด/ผู้รับเอง
- Reviews/profile: [API contract](PROFILE-REVIEWS-contract.md); เอาฟิลด์/mockstatsที่อยู่นอกscopeออก; persistedชื่อและคะแนนเท่านั้น
- Certificate: publicHTTPSopaqueQR, ไม่ต้องlogin, noPII; REVOKEDแสดงชัดและinvalidtokennotfound; ไม่เผยprivatereasonnotes
- Permissions: save/error/loading/disabledactionsตามserverflags, staleaccountguard, retryไม่duplicate, imagepermissionsมีคำอธิบายตรงproduct/verification/proofuse
- Privacy: publicreviewsไม่เผยrealname; privateproof/identityviewอยู่หลังauthorization; policytextไม่อ้างdelete/exportUIที่ยังไม่มี

## ข้อความที่ต้องตรงกัน

| กรณี | ข้อความแนะนำ |
|---|---|
| Payment | "ชำระเงินจำลองสำหรับต้นแบบ" |
| Payout | "ยอดจ่ายให้ผู้ขายจำลองที่บันทึกในระบบ" |
| Refund | "คืนเงินจำลองเต็มยอด {amount} บาท" |
| Resultdecision | "ยอมรับผลการตรวจ" / "ปฏิเสธผลการตรวจและส่งคืน" |
| Receipt | "ยืนยันว่าได้รับสินค้าแล้ว" |
| Nonreceipt | "แจ้งว่ายังไม่ได้รับสินค้า" |
| Receiptwindow | "ยืนยันรับหรือแจ้งไม่ได้รับภายในเวลาที่แสดง หลัง Courier ยืนยันส่งถึง; ระบบประมวลผลอัตโนมัติเมื่อถึงเกณฑ์" |
| Zeroreviews | "ยังไม่มีรีวิวจากผู้ซื้อที่ซื้อสำเร็จ" |

## Diagrams

[Class](diagrams/class-core.puml), [Order state](diagrams/order-state.puml), [Successful sale sequence](diagrams/sale-sequence.puml), [Return/refund sequence](diagrams/return-sequence.puml), [Use cases](diagrams/use-cases.puml), [Architecture](diagrams/architecture.puml) อธิบาย targetrelease ไม่ใช่หลักฐานว่า codeครบ งาน13ต้องปรับรายละเอียดจากfinalimplementationและexportสำหรับส่งอีกครั้ง
