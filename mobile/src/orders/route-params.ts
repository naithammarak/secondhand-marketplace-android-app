/** อ่าน id จาก URL รับเฉพาะจำนวนเต็มบวกในช่วงของ Integer ใน PostgreSQL ค่าอื่นถือว่าไม่ถูกต้อง */
export function parseRouteId(value: string | string[] | undefined): number | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text || !/^[1-9]\d{0,9}$/.test(text)) return null;
  const id = Number(text);
  return id <= 2147483647 ? id : null;
}
