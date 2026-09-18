import type { IdCardFile, VerificationInput } from '../services/verification-service';

export type VerificationFormValues = {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  idCard: IdCardFile | null;
};

export type VerificationFieldErrors = Partial<Record<keyof VerificationFormValues, string>>;

export const emptyVerificationForm: VerificationFormValues = {
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  idCard: null,
};

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 255;
const MIN_ACCOUNT_DIGITS = 10;
const MAX_ACCOUNT_DIGITS = 15;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** ชื่อช่องที่ backend ใช้ เพื่อจับคู่ข้อผิดพลาดรายช่องกลับมาที่ฟอร์ม */
const FIELD_BY_API_NAME: Record<string, keyof VerificationFormValues> = {
  bank_name: 'bankName',
  bank_account_name: 'bankAccountName',
  bank_account_number: 'bankAccountNumber',
  id_card_image: 'idCard',
};

export function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

function validateName(value: string, label: string): string | undefined {
  const text = value.trim();
  if (!text) return `กรุณากรอก${label}`;
  if (text.length < MIN_NAME_LENGTH) return `${label}สั้นเกินไป`;
  if (text.length > MAX_NAME_LENGTH) return `${label}ยาวเกิน ${MAX_NAME_LENGTH} ตัวอักษร`;
  return undefined;
}

export function validateVerificationForm(values: VerificationFormValues): VerificationFieldErrors {
  const errors: VerificationFieldErrors = {};

  const bankName = validateName(values.bankName, 'ชื่อธนาคาร');
  if (bankName) errors.bankName = bankName;

  const accountName = validateName(values.bankAccountName, 'ชื่อบัญชี');
  if (accountName) errors.bankAccountName = accountName;

  const rawAccount = values.bankAccountNumber.trim();
  const digits = digitsOf(rawAccount);
  if (!rawAccount) errors.bankAccountNumber = 'กรุณากรอกเลขที่บัญชี';
  else if (/[^\d\s-]/.test(rawAccount)) errors.bankAccountNumber = 'เลขที่บัญชีต้องเป็นตัวเลขเท่านั้น';
  else if (digits.length < MIN_ACCOUNT_DIGITS || digits.length > MAX_ACCOUNT_DIGITS) {
    errors.bankAccountNumber = `เลขที่บัญชีต้องมี ${MIN_ACCOUNT_DIGITS}-${MAX_ACCOUNT_DIGITS} หลัก`;
  }

  const idCard = values.idCard;
  if (!idCard) errors.idCard = 'กรุณาแนบรูปบัตรประชาชน';
  else if (!ALLOWED_IMAGE_TYPES.includes(idCard.type)) errors.idCard = 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP';
  else if (typeof idCard.size === 'number' && idCard.size > MAX_IMAGE_BYTES) {
    errors.idCard = 'ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB';
  }

  return errors;
}

export function toVerificationInput(values: VerificationFormValues): VerificationInput | null {
  if (!values.idCard) return null;
  return {
    bankName: values.bankName.trim(),
    bankAccountName: values.bankAccountName.trim(),
    bankAccountNumber: digitsOf(values.bankAccountNumber),
    idCard: values.idCard,
  };
}

export function mapApiFieldErrors(fields: Record<string, string>): VerificationFieldErrors {
  const errors: VerificationFieldErrors = {};
  for (const [apiName, message] of Object.entries(fields)) {
    const field = FIELD_BY_API_NAME[apiName];
    if (field) errors[field] = message;
  }
  return errors;
}
