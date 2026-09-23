# ลอง INSPECT บน Android ด้วยฐานข้อมูลจริงแบบแยก

โหมดนี้ใช้ PostgreSQL `inspect_demo_local` ในเครื่อง, API จริง และ private evidence directory ใต้ `%TEMP%` ไม่มี mock ของ Order/Inspection/Certificate และไม่แตะ `backend/.env` ที่ชี้ฐานทีม บัญชี Buyer/Seller/Inspector เป็นตัวตนทดลองที่ใช้ได้เฉพาะฐานนี้ ไม่ใช่บัญชี Supabase จริง

## เปิดบริการ

บน Windows เครื่องที่มี local PostgreSQL จากงาน INSPECT และ backend virtual environment แล้ว:

1. เปิด PowerShell ที่ราก repo แล้วรัน `./scripts/start-inspect-demo-api.ps1` ปล่อยหน้าต่างนี้เปิดไว้ คำสั่งตรวจชื่อฐานให้ตรง `inspect_demo_local`, migrate ถึง head, seed สินค้าทดลองสองชิ้น และพิมพ์รหัสทดลอง 12 ตัวใหม่ทุกครั้ง
2. ถ้า Android อยู่ Wi-Fi เดียวกัน เปิด PowerShell อีกหน้าต่างแล้วรัน `./scripts/start-inspect-demo-mobile.ps1` จากนั้นใช้ Expo Go สแกน QR ที่ Expo แสดง
3. ถ้า Android อยู่นอกวง Wi-Fi ให้เปิด HTTPS tunnel ของ API ก่อน แล้วเริ่ม API ใหม่ด้วย `-PublicOrigin <HTTPS API URL>` เพื่อให้ Certificate ใช้ URL เดียวกัน จากนั้นรัน `./scripts/start-inspect-demo-mobile.ps1 -PublicApiOrigin <HTTPS API URL> -Tunnel` ซึ่งใช้ Expo tunnel ปล่อยทุก terminal เปิดไว้ตลอดการทดลอง คำสั่ง Cloudflare Quick Tunnel และ Expo tunnel อยู่ใน [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) และ [Expo CLI docs](https://docs.expo.dev/more/expo-cli/)

`INSPECT_DEMO_ENABLED` ทำงานเฉพาะ `APP_ENV=development` พร้อม PostgreSQL host ในเครื่องและชื่อฐาน `inspect_demo_local`; API ต้องใช้ secret/issuer ของ demo และรหัสที่ผู้ใช้กรอกเอง หากเงื่อนไขไม่ครบ `/__inspect_demo/session/{role}` คืน 404/403 ห้ามใช้ tunnel นี้กับฐานทีม

## กดเส้นทางจริง

1. เข้า Buyer ด้วยรหัสทดลอง เลือกสินค้า `Inspect demo PASS item` แล้วสร้าง Order และกดจ่ายจำลองสำเร็จ จดเลข Order
2. ออกจากระบบ เข้า Seller เปิดคำสั่งซื้อดังกล่าว กรอกขนส่ง/เลขติดตามสมมติ แล้วกดแจ้งส่งเข้าศูนย์
3. ออกจากระบบ เข้า Inspector เปิดคิว รับสินค้า เริ่มตรวจ เลือกรูปจากเครื่อง อัปโหลด เลือกรูปหลักฐาน กรอก summary อย่างน้อย 10 ตัว และเลือก `PASS` บันทึกผล
4. ออกจากระบบ เข้า Buyer เปิด Order เดิม กดรีเฟรช เห็น `RESULT_NOTIFIED`, summary, รูปที่เลือก และลิงก์ Certificate ตอนนี้ลิงก์แสดง JSON ยืนยัน ไม่ใช่หน้า QR
5. ทำซ้ำกับ `Inspect demo negative item` โดยเลือก `FAKE` หรือ `NOT_AS_DESCRIBED`; Buyer ต้องเห็นผลและรูปโดยไม่มี Certificate

ถ้ากลับเข้าบทบาทเดิมหลังออกจากระบบ ให้ใช้รหัสทดลองเดิมขณะ API ยังเปิดอยู่ ทุกครั้งที่เริ่ม API ใหม่จะได้รหัสใหม่ บัญชี demo ไม่มีข้อมูลส่วนตัว; ใช้ที่อยู่และเลขติดตามสมมติเท่านั้น หลังทดลองเสร็จปิด Expo, API และ tunnel; ชุดข้อมูลในฐานทดลองคงไว้เพื่อวิเคราะห์ข้อผิดพลาด โดยไม่ reset ฐานทีม

## หลักฐานปัจจุบัน

ยืนยัน API session ของสามบทบาทผ่าน HTTPS tunnel แล้ว, รหัสผิดถูกปฏิเสธ 403, Android Expo manifest/bundle ตอบ 200, migration/seed ผ่านบนฐานแยก, PostgreSQL flow 7 scenarios และ demo guard test ผ่าน อย่างไรก็ตามยังไม่ได้กดบนเครื่อง Android จริงจากฝั่งนี้ จึงต้องบันทึกภาพหน้าจอและ error ที่เกิดขณะลองก่อนเรียกว่า E2E บนมือถือผ่าน
