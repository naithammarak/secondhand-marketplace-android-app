/**
 * API ของงานสั่งซื้อและจ่ายเงินจำลอง ตาม doc/orders/contract.md
 * เงินทุกช่องเป็น string จาก backend และห้ามแปลงเป็น number เพื่อคำนวณในแอป
 */

/**
 * สถานะ ORDER และ INSPECT ที่แอปรุ่นนี้รองรับตามสัญญา backend
 * (ดู doc/orders/contract.md หัวข้อ 2)
 * แอปรุ่นเก่าต้องไม่พังเมื่อเจอค่าที่ยังไม่รู้จัก จึงแปลงเป็น 'UNKNOWN' แล้วแสดงข้อความกลางแทน
 */
export const KNOWN_ORDER_STATUSES = ['WAITING_PAYMENT', 'WAITING_SELLER_SHIP', 'SHIPPING_TO_CENTER', 'RECEIVED_AT_CENTER', 'INSPECTING', 'RESULT_NOTIFIED', 'CANCELLED'] as const;
export type KnownOrderStatus = (typeof KNOWN_ORDER_STATUSES)[number];
export type OrderStatus = KnownOrderStatus | 'UNKNOWN';
export type CancelReason = 'BUYER' | 'EXPIRED';
export type PaymentStatus = 'UNPAID' | 'PAID';
export type ViewerRole = 'buyer' | 'seller';
export type PaymentOutcome = 'SUCCESS' | 'FAILED';

export type ProductSnapshot = { id: number; name: string; condition: string; size: string };

export type ShippingAddress = {
  recipientName: string;
  phone: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
};

export type OrderAmounts = {
  currency: string;
  itemPrice: string;
  shippingFee: string | null;
  inspectionFee: string | null;
  totalAmount: string | null;
  commissionFee: string | null;
  sellerPayout: string | null;
};

export type PaymentAttempt = {
  id: number;
  outcome: 'SUCCEEDED' | 'FAILED';
  amount: string;
  createdAt: string | null;
};

export type OrderDetail = {
  id: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  viewerRole: ViewerRole;
  product: ProductSnapshot;
  amounts: OrderAmounts;
  shippingAddress: ShippingAddress | null;
  lastPaymentAttempt: PaymentAttempt | null;
  paidAt: string | null;
  receiptNo: string | null;
  canPay: boolean;
  canCancel: boolean;
  /** เส้นตายการชำระเงินจาก server หน้าจอนับถอยหลังตามค่านี้ ไม่คำนวณเส้นตายเอง */
  expiresAt: string | null;
  cancelledAt: string | null;
  cancelReason: CancelReason | null;
  createdAt: string | null;
};

export type OrderListItem = {
  id: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  viewerRole: ViewerRole;
  product: ProductSnapshot;
  totalAmount: string | null;
  sellerPayout: string | null;
  currency: string;
  expiresAt: string | null;
  cancelReason: CancelReason | null;
  createdAt: string | null;
  paidAt: string | null;
};

export type OrderPage = { items: OrderListItem[]; total: number; limit: number; offset: number };

export type CheckoutQuote = {
  product: ProductSnapshot;
  currency: string;
  itemPrice: string;
  shippingFee: string;
  inspectionFee: string;
  totalAmount: string;
};

export type PaymentResult = { attempt: PaymentAttempt; order: OrderDetail };

export type Receipt = {
  receiptNo: string;
  orderId: number;
  issuedAt: string | null;
  paymentMethod: string;
  currency: string;
  productName: string;
  itemPrice: string;
  shippingFee: string;
  inspectionFee: string;
  totalAmount: string;
};

export type OrderErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'conflict'
  | 'validation-error' | 'network-error' | 'timeout' | 'server-error' | 'unavailable';

export class OrderServiceError extends Error {
  readonly kind: OrderErrorKind;
  /** code จาก backend เช่น product_unavailable, already_ordered, order_expired */
  readonly code: string | null;
  readonly fields: Record<string, string>;
  /** Order เดิมของผู้ซื้อเมื่อได้ already_ordered */
  readonly orderId: number | null;

  constructor(kind: OrderErrorKind, options: {
    code?: string | null; fields?: Record<string, string>; orderId?: number | null;
  } = {}) {
    super(kind);
    this.name = 'OrderServiceError';
    this.kind = kind;
    this.code = options.code ?? null;
    this.fields = options.fields ?? {};
    this.orderId = options.orderId ?? null;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 15000;
const MONEY = /^-?\d+\.\d{2}$/;
const CANCEL_REASONS: CancelReason[] = ['BUYER', 'EXPIRED'];

const ADDRESS_API_FIELDS: Record<string, keyof ShippingAddress> = {
  recipient_name: 'recipientName',
  phone: 'phone',
  address_line: 'addressLine',
  subdistrict: 'subdistrict',
  district: 'district',
  province: 'province',
  postal_code: 'postalCode',
};

function bad(): never {
  throw new OrderServiceError('server-error');
}

function obj(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) bad();
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (typeof value !== 'string') bad();
  return value;
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) bad();
  return value;
}

/** เงินต้องเป็น string ทศนิยม 2 ตำแหน่งเสมอ ถ้าไม่ใช่ถือว่า backend ตอบผิดรูปแบบ */
function money(value: unknown): string {
  const text = str(value);
  if (!MONEY.test(text)) bad();
  return text;
}

function optMoney(value: unknown): string | null {
  return value === null || value === undefined ? null : money(value);
}

function toProduct(value: unknown): ProductSnapshot {
  const data = obj(value);
  return { id: int(data.id), name: str(data.name), condition: str(data.condition), size: str(data.size) };
}

function toStatus(value: unknown): OrderStatus {
  // ค่าที่ไม่ใช่ข้อความยังถือว่า backend ตอบผิดรูปแบบ แต่ข้อความที่ยังไม่รู้จักถือว่าเป็นสถานะใหม่
  const text = str(value);
  return KNOWN_ORDER_STATUSES.find(status => status === text) ?? 'UNKNOWN';
}

function toCancelReason(value: unknown): CancelReason | null {
  if (value === null || value === undefined) return null;
  return CANCEL_REASONS.find(reason => reason === value) ?? bad();
}

function toViewerRole(value: unknown): ViewerRole {
  if (value === 'buyer' || value === 'seller') return value;
  return bad();
}

function toAttempt(value: unknown): PaymentAttempt {
  const data = obj(value);
  if (data.outcome !== 'SUCCEEDED' && data.outcome !== 'FAILED') bad();
  return { id: int(data.id), outcome: data.outcome, amount: money(data.amount), createdAt: optStr(data.created_at) };
}

function toAddress(value: unknown): ShippingAddress | null {
  if (value === null || value === undefined) return null;
  const data = obj(value);
  return {
    recipientName: str(data.recipient_name),
    phone: str(data.phone),
    addressLine: str(data.address_line),
    subdistrict: str(data.subdistrict),
    district: str(data.district),
    province: str(data.province),
    postalCode: str(data.postal_code),
  };
}

export function toOrderDetail(value: unknown): OrderDetail {
  const data = obj(value);
  const amounts = obj(data.amounts);
  return {
    id: int(data.id),
    status: toStatus(data.status),
    paymentStatus: data.payment_status === 'PAID' ? 'PAID' : data.payment_status === 'UNPAID' ? 'UNPAID' : bad(),
    viewerRole: toViewerRole(data.viewer_role),
    product: toProduct(data.product),
    amounts: {
      currency: str(amounts.currency),
      itemPrice: money(amounts.item_price),
      shippingFee: optMoney(amounts.shipping_fee),
      inspectionFee: optMoney(amounts.inspection_fee),
      totalAmount: optMoney(amounts.total_amount),
      commissionFee: optMoney(amounts.commission_fee),
      sellerPayout: optMoney(amounts.seller_payout),
    },
    shippingAddress: toAddress(data.shipping_address),
    lastPaymentAttempt: data.last_payment_attempt ? toAttempt(data.last_payment_attempt) : null,
    paidAt: optStr(data.paid_at),
    receiptNo: optStr(data.receipt_no),
    canPay: data.can_pay === true,
    canCancel: data.can_cancel === true,
    expiresAt: optStr(data.expires_at),
    cancelledAt: optStr(data.cancelled_at),
    cancelReason: toCancelReason(data.cancel_reason),
    createdAt: optStr(data.created_at),
  };
}

function toListItem(value: unknown): OrderListItem {
  const data = obj(value);
  return {
    id: int(data.id),
    status: toStatus(data.status),
    paymentStatus: data.payment_status === 'PAID' ? 'PAID' : 'UNPAID',
    viewerRole: toViewerRole(data.viewer_role),
    product: toProduct(data.product),
    totalAmount: optMoney(data.total_amount),
    sellerPayout: optMoney(data.seller_payout),
    currency: str(data.currency),
    expiresAt: optStr(data.expires_at),
    cancelReason: toCancelReason(data.cancel_reason),
    createdAt: optStr(data.created_at),
    paidAt: optStr(data.paid_at),
  };
}

function toPage(value: unknown): OrderPage {
  const data = obj(value);
  if (!Array.isArray(data.items)) bad();
  return { items: data.items.map(toListItem), total: int(data.total), limit: int(data.limit), offset: int(data.offset) };
}

function toQuote(value: unknown): CheckoutQuote {
  const data = obj(value);
  return {
    product: toProduct(data.product),
    currency: str(data.currency),
    itemPrice: money(data.item_price),
    shippingFee: money(data.shipping_fee),
    inspectionFee: money(data.inspection_fee),
    totalAmount: money(data.total_amount),
  };
}

function toReceipt(value: unknown): Receipt {
  const data = obj(value);
  return {
    receiptNo: str(data.receipt_no),
    orderId: int(data.order_id),
    issuedAt: optStr(data.issued_at),
    paymentMethod: str(data.payment_method),
    currency: str(data.currency),
    productName: str(data.product_name),
    itemPrice: money(data.item_price),
    shippingFee: money(data.shipping_fee),
    inspectionFee: money(data.inspection_fee),
    totalAmount: money(data.total_amount),
  };
}

/** แปลงชื่อช่องจาก backend เป็นชื่อช่องในฟอร์ม และรับเฉพาะข้อความสั้น ๆ */
function toFieldErrors(detail: unknown): Record<string, string> {
  if (typeof detail !== 'object' || detail === null) return {};
  const fields = (detail as Record<string, unknown>).fields;
  if (typeof fields !== 'object' || fields === null) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 200) continue;
    result[ADDRESS_API_FIELDS[key] ?? key] = value;
  }
  return result;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toAddressPayload(address: ShippingAddress) {
  return {
    recipient_name: address.recipientName,
    phone: address.phone,
    address_line: address.addressLine,
    subdistrict: address.subdistrict,
    district: address.district,
    province: address.province,
    postal_code: address.postalCode,
  };
}

export function createOrderService(options: { baseUrl?: string; fetch?: FetchLike; timeoutMs?: number }) {
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const request = async (
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    if (!baseUrl) throw new OrderServiceError('unavailable');
    // แยก timeout ออกจากการยกเลิกโดยผู้ใช้ เพื่อให้หน้าจอรู้ว่า "ไม่รู้ผล" ต้องตรวจสถานะก่อน
    // timeout ครอบทั้งการรอ headers และการอ่าน body เพราะการเชื่อมต่ออาจค้างหลังได้ headers แล้ว
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    // บาง fetch (เช่นบน React Native) ไม่หยุดอ่าน body เมื่อ abort จึงแข่งกับสัญญาณ abort เอง
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    aborted.catch(() => {});
    let response: Response;
    let body: unknown;
    try {
      response = await Promise.race([fetcher(`${baseUrl}${path}`, { ...init, signal: controller.signal }), aborted]);
      body = await Promise.race([readJson(response), aborted]);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timedOut) throw new OrderServiceError('timeout');
      throw new OrderServiceError('network-error');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    // body ที่อ่านไม่ครบเพราะหมดเวลาต้องไม่ถูกตีความเป็นคำตอบ
    if (timedOut) throw new OrderServiceError('timeout');

    if (response.ok) return body;
    const detail = (body as { detail?: unknown } | null)?.detail;
    const detailObject = typeof detail === 'object' && detail !== null ? detail as Record<string, unknown> : {};
    const code = typeof detailObject.code === 'string' ? detailObject.code : null;
    const orderId = typeof detailObject.order_id === 'number' ? detailObject.order_id : null;
    if (response.status === 401) throw new OrderServiceError('unauthorized', { code });
    if (response.status === 403) {
      if (code === 'payment_simulation_disabled') throw new OrderServiceError('unavailable', { code });
      throw new OrderServiceError('forbidden', { code });
    }
    if (response.status === 404) throw new OrderServiceError('not-found', { code });
    if (response.status === 409) throw new OrderServiceError('conflict', { code, orderId });
    if (response.status === 422) {
      throw new OrderServiceError('validation-error', { code, fields: toFieldErrors(detail) });
    }
    if (response.status === 503) throw new OrderServiceError('unavailable', { code });
    throw new OrderServiceError('server-error', { code });
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  return {
    async getQuote(token: string, productId: number, signal?: AbortSignal): Promise<CheckoutQuote> {
      return toQuote(await request(`/orders/checkout-quote?product_id=${encodeURIComponent(productId)}`,
        { method: 'GET', headers: auth(token) }, signal));
    },

    async createOrder(
      token: string,
      input: { productId: number; address: ShippingAddress; idempotencyKey: string },
      signal?: AbortSignal,
    ): Promise<OrderDetail> {
      // ส่งเฉพาะสินค้าและที่อยู่ ยอดเงินและผู้ซื้อ server เป็นผู้กำหนด
      return toOrderDetail(await request('/orders', {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify({ product_id: input.productId, shipping_address: toAddressPayload(input.address) }),
      }, signal));
    },

    async listOrders(
      token: string,
      page: { limit: number; offset: number; role?: 'buyer' | 'seller' },
      signal?: AbortSignal,
    ): Promise<OrderPage> {
      return toPage(await request(`/orders?limit=${page.limit}&offset=${page.offset}${page.role ? `&role=${page.role}` : ''}`,
        { method: 'GET', headers: auth(token) }, signal));
    },

    async getOrder(token: string, orderId: number, signal?: AbortSignal): Promise<OrderDetail> {
      return toOrderDetail(await request(`/orders/${encodeURIComponent(orderId)}`,
        { method: 'GET', headers: auth(token) }, signal));
    },

    async simulatePayment(
      token: string,
      input: { orderId: number; outcome: PaymentOutcome; idempotencyKey: string },
      signal?: AbortSignal,
    ): Promise<PaymentResult> {
      const data = obj(await request(`/orders/${encodeURIComponent(input.orderId)}/payments/simulate`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify({ outcome: input.outcome }),
      }, signal));
      return { attempt: toAttempt(data.attempt), order: toOrderDetail(data.order) };
    },

    async cancelOrder(token: string, orderId: number, signal?: AbortSignal): Promise<OrderDetail> {
      // ไม่ต้องใช้ Idempotency-Key: คำขอนี้ไม่สร้างแถวใหม่และเรียกซ้ำได้ผลเดิม (contract D-18)
      return toOrderDetail(await request(`/orders/${encodeURIComponent(orderId)}/cancel`,
        { method: 'POST', headers: auth(token) }, signal));
    },

    async getReceipt(token: string, orderId: number, signal?: AbortSignal): Promise<Receipt> {
      return toReceipt(await request(`/orders/${encodeURIComponent(orderId)}/receipt`,
        { method: 'GET', headers: auth(token) }, signal));
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
