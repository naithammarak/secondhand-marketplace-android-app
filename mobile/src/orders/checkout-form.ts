import type { ShippingAddress } from '../services/order-service';

export type AddressFormValues = ShippingAddress;
export type AddressFieldErrors = Partial<Record<keyof AddressFormValues, string>>;

export const emptyAddressForm: AddressFormValues = {
  recipientName: '',
  phone: '',
  addressLine: '',
  subdistrict: '',
  district: '',
  province: '',
  postalCode: '',
};

// ต้องตรงกับกติกาใน backend/app/api/orders.py (server ตรวจซ้ำเสมอ)
const TEXT_FIELDS: [keyof AddressFormValues, string, number, number][] = [
  ['recipientName', 'ชื่อผู้รับ', 2, 100],
  ['addressLine', 'ที่อยู่', 5, 255],
  ['subdistrict', 'ตำบล/แขวง', 2, 100],
  ['district', 'อำเภอ/เขต', 2, 100],
  ['province', 'จังหวัด', 2, 100],
];

function collapse(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(' ');
}

export function normalizeAddress(values: AddressFormValues): AddressFormValues {
  return {
    recipientName: collapse(values.recipientName),
    phone: values.phone.replace(/[\s-]/g, ''),
    addressLine: collapse(values.addressLine),
    subdistrict: collapse(values.subdistrict),
    district: collapse(values.district),
    province: collapse(values.province),
    postalCode: values.postalCode.trim(),
  };
}

export function validateAddress(values: AddressFormValues): AddressFieldErrors {
  const clean = normalizeAddress(values);
  const errors: AddressFieldErrors = {};
  for (const [field, label, min, max] of TEXT_FIELDS) {
    const text = clean[field];
    if (!text) errors[field] = `กรุณากรอก${label}`;
    else if (text.length < min) errors[field] = `${label}สั้นเกินไป`;
    else if (text.length > max) errors[field] = `${label}ยาวเกิน ${max} ตัวอักษร`;
  }
  if (!clean.phone) errors.phone = 'กรุณากรอกเบอร์โทรศัพท์';
  else if (!/^0\d{8,9}$/.test(clean.phone)) errors.phone = 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0';
  if (!clean.postalCode) errors.postalCode = 'กรุณากรอกรหัสไปรษณีย์';
  else if (!/^\d{5}$/.test(clean.postalCode)) errors.postalCode = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
  return errors;
}

/** รับเฉพาะข้อผิดพลาดของช่องที่อยู่ในฟอร์ม ช่องอื่นแสดงเป็นข้อความรวม */
export function pickAddressErrors(fields: Record<string, string>): AddressFieldErrors {
  const result: AddressFieldErrors = {};
  for (const key of Object.keys(emptyAddressForm) as (keyof AddressFormValues)[]) {
    if (fields[key]) result[key] = fields[key];
  }
  return result;
}
