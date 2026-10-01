# โครงพรีเซนต์ + demo script (draft)

เป้าหมาย 7–10 นาที · เตรียม 1 ต.ค. · **ยังไม่ใช่ slides หรือผลทดสอบฉบับ final**

## Slides

| หน้า | เนื้อหา / speaker cue | หลักฐานที่เติมหลัง release |
|---|---|---|
| 1 | 2NDHAND: ตลาดสินค้ามือสองที่มีศูนย์ตรวจและพักเงิน; ชื่อทีม/วิชา/วันที่ | รายชื่อจริงของทีม |
| 2 | ปัญหา: ความแท้/สภาพ/ข้อมูลไม่ตรง; เป้าหมายลดความไม่มั่นใจของ Buyer | ภาพสินค้า synthetic และ flow ก่อน/หลัง |
| 3 | UX: เปิดแอปหาสินค้าได้ทันที; loginเมื่อซื้อ; เริ่มBUYERและขอSellerในProfile | ภาพ Android guest/profile/verificationจริง |
| 4 | ขอบเขตส่ง: sale+returnครบ; basicprofile/reviews; payment/transport/payoutจำลองแบบpersisted | Scope revision และสถานะรับทราบจากอาจารย์ |
| 5 | Architecture: ExpoAndroid→FastAPI→PostgreSQL/Auth/privateStorage; publicHTTPSQR; schedulerแยก | architecture diagram + deployedcandidateSHA |
| 6 | State/data: Order/Shipment/Inspection/Certificate/Escrow/Settlement; หนึ่ง RELEASE หรือ REFUND | class/statediagramที่ตรงfinalschema |
| 7 | DemoA: ซื้อ→paid→center→PASS/cert→BuyerCONFIRM→Courierproof→receipt→payout→review | Order/certificate/settlement IDsที่ไม่เผยPII |
| 8 | DemoB: REJECT/negative→returnaddresssnapshot→returnproof→fullrefund; receiptเดิมอยู่ | refundreference/heldtotalจริงในdemo |
| 9 | ความถูกต้อง: roles/privateproof, replay/races,72hdeliverytimer, nonreceiptblocksAUTO | conciseQAevidenceจริง ไม่ใช้plannedtestcount |
| 10 | Profile/reviews/QR: ชื่อpersisted, reviewจากcompletedpurchase, publicmaskedreviewer, revokedQR | actualscreens + publicQRอีกเครื่อง |
| 11 | ผลทดสอบ/ส่งมอบ: Androidรุ่น/OS, app/API SHA, APKhash, passed/remainingcases | finaltestreportและactualAPK |
| 12 | ข้อจำกัด/อนาคต: providersจำลอง; push/chat/auction/wallet/advancedadmin/inspectratingเลื่อน | matchedSRSdeferredscope |

## Opening script

“โครงการของเราเป็นแอปซื้อขายสินค้ามือสองชื่อ 2NDHAND ผู้ใช้เปิดแอปเพื่อหาสินค้าได้ทันที และเข้าสู่ระบบเมื่อจะซื้อ จุดหลักคือสินค้าผ่านศูนย์ตรวจ มีใบรับรองที่ตรวจผ่าน QR ได้ และระบบพักเงินไว้จนถึงเงื่อนไขส่งมอบ วันนี้เราจะสาธิตทั้งการซื้อสำเร็จและการส่งคืนพร้อมคืนเงินครับ”

ถ้าครบ implementationแล้วจึงใช้ scriptนี้ประกอบactualdemo หาก flowยังไม่ครบให้บอกตรงๆ ว่าเป็น rehearsalและส่วนใดยังเป็นprototypeview ห้ามตัดต่อให้เหมือนธุรกรรมจริงผ่านแล้ว

## Demo preparation / sequence

1. เตรียม APK ที่ตรง finalmanifest, real testaccountsตามrole, HTTPSAPI/QR, syntheticdataสองชุด และภาพหลักฐานที่ไม่ใช้ข้อมูลบุคคลจริง
2. เริ่มด้วย guestsearch; loginBuyer; ดู quote/address/payment simulationlabel และ backend receipt
3. สลับ Seller/Inspector/Courierตามrunbook โดยใช้ Orderเดียว; ไม่แก้statusด้วยSQLเพื่อข้ามbusinessrules
4. หลัง positiveinspectionเปิดpublicQRจากอีกเครื่องก่อนBuyerตัดสินใจ เพื่อพิสูจน์certificateออกพร้อมresult
5. BuyerCONFIRMผลตรวจ → Courierproof→Buyerphysicalreceipt → ดูsettlement→review; Sellerดูpayoutจำลอง
6. ชุดคืนเงิน: resultnegativeหรือBuyerREJECT→returnproof→fullrefund; เปิดoriginalreceiptและrefundreference
7. แก้ชื่อprofile→reload, เปิดsellerreviewmodalเห็นคะแนนจริง; Adminrevokecertของอีกfixtureแล้วpublicQRขึ้นrevoked
8. Timer/race demonstrationsใช้preparedisolatedfixtures/clock evidence; อธิบาย72hproductionrule ไม่รอจริงและไม่เปิดforce-releaseAPI

## Handover / rehearsal gates

- [ ] ซ้อมสองjourneysโดยไม่พึ่งSQLหรือmocksuccess, จับเวลา 7–10 นาที
- [ ] เครื่องAndroidชาร์จพร้อม; API/Storage/workerhealthผ่าน; accounts/roleทำงาน
- [ ] Backuprecordingจากreleaseที่ผ่านจริง; QRและscreensไม่มีJWT/PII
- [ ] APK/guide/slides/PDF/testreportอยู่ในsubmissionfolderเดียวและเปิดได้
- [ ] Presenterอธิบายได้ว่าผลตรวจกับรับสินค้าเป็นคนละaction, refundเต็มยอด, payoutจำลอง, reportหยุดAUTO
- [ ] บันทึกscopeacknowledgementจากอาจารย์และข้อจำกัดที่ยังมีตามจริง
