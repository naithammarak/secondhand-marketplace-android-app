/** Seller seven-field return address: saved before ship-to-center, read-only once frozen. */
import { useState } from 'react';
import { View } from 'react-native';
import { emptyAddressForm, normalizeAddress, validateAddress, type AddressFieldErrors, type AddressFormValues } from '@/orders/checkout-form';
import { formatDateTime } from '@/orders/order-format';
import type { ReturnAddress, ReturnAddressView } from '@/orders/order-journey';
import type { ActionFailure } from '@/orders/action-errors';
import { Button } from './order-ui';
import { ThemedText } from './themed-text';
import { TextField } from './wondee/primitives';
import { ActionNotice, SectionCard } from './wondee/status';

const LABELS: [keyof AddressFormValues, string, string][] = [
  ['recipientName', 'ชื่อผู้รับคืน', 'recipient_name'], ['phone', 'เบอร์โทรศัพท์', 'phone'], ['addressLine', 'ที่อยู่', 'address_line'],
  ['subdistrict', 'ตำบล/แขวง', 'subdistrict'], ['district', 'อำเภอ/เขต', 'district'], ['province', 'จังหวัด', 'province'], ['postalCode', 'รหัสไปรษณีย์', 'postal_code'],
];

export const toReturnAddress = (values: AddressFormValues): ReturnAddress => {
  const clean = normalizeAddress(values);
  return { recipient_name: clean.recipientName, phone: clean.phone, address_line: clean.addressLine, subdistrict: clean.subdistrict,
    district: clean.district, province: clean.province, postal_code: clean.postalCode };
};
const fromReturnAddress = (address: ReturnAddress | null): AddressFormValues => address ? {
  recipientName: address.recipient_name, phone: address.phone, addressLine: address.address_line, subdistrict: address.subdistrict,
  district: address.district, province: address.province, postalCode: address.postal_code,
} : emptyAddressForm;

/** Map server snake_case field errors onto the form. */
function serverFieldErrors(fields: Record<string, string>): AddressFieldErrors {
  const result: AddressFieldErrors = {};
  for (const [key, , api] of LABELS) if (fields[api] || fields[key]) result[key] = fields[api] ?? fields[key];
  return result;
}

export function ReturnAddressForm({ view, busy, failure, onSave }: {
  view: ReturnAddressView; busy: boolean; failure: ActionFailure | null; onSave(address: ReturnAddress): Promise<boolean>;
}) {
  const [values, setValues] = useState<AddressFormValues>(() => fromReturnAddress(view.address));
  const [editing, setEditing] = useState(!view.address);
  const [attempted, setAttempted] = useState(false);
  const local = attempted ? validateAddress(values) : {};
  const remote = failure ? serverFieldErrors(failure.fields) : {};
  if (view.frozen || (view.address && !editing)) {
    const address = view.address;
    return <SectionCard title={view.frozen ? 'ที่อยู่รับสินค้าคืน' : '2. ที่อยู่รับสินค้าคืน'} testID={view.frozen ? 'return-address-frozen' : 'return-address-saved'}>
      {address ? <View style={{ gap: 2 }}>
        <ThemedText type="small">{address.recipient_name} · {address.phone}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{address.address_line} {address.subdistrict} {address.district} {address.province} {address.postal_code}</ThemedText>
        {view.savedAt ? <ThemedText type="small" themeColor="textSecondary">บันทึกเมื่อ {formatDateTime(view.savedAt)}</ThemedText> : null}
      </View> : <ThemedText type="small" themeColor="textSecondary">คำสั่งซื้อนี้ไม่มีที่อยู่รับคืนที่บันทึกไว้</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">{view.frozen ? 'เริ่มจัดส่งแล้ว ที่อยู่นี้ถูกล็อกเป็นปลายทางส่งคืนของคำสั่งซื้อนี้' : 'แก้ไขได้จนกว่าจะแจ้งส่งสินค้าเข้าศูนย์'}</ThemedText>
      {!view.frozen ? <Button label="แก้ไขที่อยู่รับคืน" onPress={() => setEditing(true)} /> : null}
    </SectionCard>;
  }
  return <SectionCard title="2. ที่อยู่รับสินค้าคืน" testID="return-address-form">
    <ThemedText type="small" themeColor="textSecondary">ถ้าผลตรวจไม่ผ่านหรือผู้ซื้อปฏิเสธ ศูนย์จะส่งสินค้าคืนที่อยู่นี้ ต้องบันทึกก่อนแจ้งส่งเข้าศูนย์ และแก้ไม่ได้หลังเริ่มจัดส่ง</ThemedText>
    {LABELS.map(([key, label]) => <TextField key={key} label={label} value={values[key]} editable={!busy}
      keyboardType={key === 'phone' || key === 'postalCode' ? 'number-pad' : 'default'}
      onChangeText={text => setValues(current => ({ ...current, [key]: text }))} error={local[key] ?? remote[key]} />)}
    <ActionNotice failure={failure && failure.next !== 'fix-input' ? failure : null} onRetry={() => submit()} retrying={busy} />
    <Button label="บันทึกที่อยู่รับคืน" variant="primary" busy={busy} onPress={submit} />
  </SectionCard>;

  function submit() {
    setAttempted(true);
    if (Object.keys(validateAddress(values)).length > 0) return;
    void onSave(toReturnAddress(values)).then(saved => { if (saved) setEditing(false); });
  }
}
