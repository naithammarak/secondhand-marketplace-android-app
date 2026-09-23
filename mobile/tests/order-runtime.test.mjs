import test from 'node:test';
import assert from 'node:assert/strict';
import { isDirectProductIdEntryEnabled } from '../src/orders/order-runtime.ts';

/** ตั้งค่า __DEV__ และ env ชั่วคราวแล้วคืนค่าเดิมเสมอ เพื่อไม่ให้ test รบกวนกัน */
function withRuntime({ dev, value }, run) {
  const hadDev = '__DEV__' in globalThis;
  const previousDev = globalThis.__DEV__;
  const previousValue = process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY;

  globalThis.__DEV__ = dev;
  if (value === undefined) delete process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY;
  else process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY = value;

  try {
    run();
  } finally {
    if (hadDev) globalThis.__DEV__ = previousDev;
    else delete globalThis.__DEV__;
    if (previousValue === undefined) delete process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY;
    else process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY = previousValue;
  }
}

test('ทางเข้าด้วยรหัสสินค้าเปิดเฉพาะ build พัฒนาที่ตั้งค่าไว้ชัดเจน', () => {
  withRuntime({ dev: true, value: 'true' }, () => {
    assert.equal(isDirectProductIdEntryEnabled(), true);
  });
});

test('ค่าตั้งต้นคือปิด เมื่อไม่ได้ตั้ง env', () => {
  withRuntime({ dev: true, value: undefined }, () => {
    assert.equal(isDirectProductIdEntryEnabled(), false);
  });
});

test('build production เปิดไม่ได้แม้ตั้ง env มาเป็น true', () => {
  withRuntime({ dev: false, value: 'true' }, () => {
    assert.equal(isDirectProductIdEntryEnabled(), false);
  });
});

test('ค่าที่ไม่ใช่ true ทุกแบบถือว่าปิด', () => {
  for (const value of ['1', 'TRUE', 'yes', 'on', '', 'false']) {
    withRuntime({ dev: true, value }, () => {
      assert.equal(isDirectProductIdEntryEnabled(), false, `value=${value}`);
    });
  }
});
