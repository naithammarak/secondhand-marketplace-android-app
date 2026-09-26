/**
 * ทางเข้าชั่วคราว "ซื้อด้วยรหัสสินค้า" (Decision Log D-16)
 *
 * ทางเข้าหลักคือปุ่ม "ซื้อสินค้านี้" ในหน้ารายละเอียดสินค้า ส่วนทางนี้เก็บไว้ทดสอบด้วยรหัสตรง ๆ
 * เท่านั้น จึงต้องปิดสนิทใน build ที่ส่งให้ผู้ใช้จริง: ต้องเป็น build สำหรับพัฒนา **และ**
 * ตั้ง EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY=true อย่างชัดเจน ค่าตั้งต้นคือปิด
 *
 * เงื่อนไข __DEV__ ทำให้ build production เปิดทางนี้ไม่ได้เลยแม้ตั้ง env มาผิด
 */
export function isDirectProductIdEntryEnabled(): boolean {
  return (
    typeof __DEV__ !== 'undefined'
    && __DEV__
    && process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY === 'true'
  );
}
