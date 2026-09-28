import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { initialCheckoutState } from '../../src/orders/checkout-store';
import { initialOrderDetailState } from '../../src/orders/order-detail-store';
import { product, photos } from './catalog';
const noop = () => {};
const read = async () => {};
const unavailable = 'QA fixture: การเปลี่ยนข้อมูลถูกปิดไว้';
// These fixtures are wired only by metro.config.js in the explicit QA process.
// They never claim that a mutation succeeded and cannot contact an API.
const Context = createContext<any>(null);
export function FixtureProvider({ scene, children }: PropsWithChildren<{ scene: string }>) {
  const value = useMemo(() => {
    const role = scene.startsWith('inspector') ? 'INSPECTOR' : scene === 'admin' ? 'ADMIN' : ['seller','approved','mine','create','edit','orders-sales','orders'].includes(scene) ? 'SELLER' : 'BUYER';
    const status = scene === 'pending' ? 'PENDING' : scene === 'rejected' ? 'REJECTED' : ['seller', 'approved', 'mine', 'create', 'edit'].includes(scene) ? 'APPROVED' : 'NOT_SUBMITTED';
    const auth = { initializing: false, session: ['guest','login'].includes(scene) ? null : { user: { id: 'qa-owner' }, access_token: 'qa-preview-not-a-credential' }, account: { role, source: 'backend', fullName: 'สมใจ ส่งต่อดี' }, accountChecking: false, accountError: null, retryAccount: read, logout: read, selectRole: read };
    const record = { id: status === 'NOT_SUBMITTED' ? null : 1, status, canSubmit: ['REJECTED','NOT_SUBMITTED'].includes(status), shopName: status === 'NOT_SUBMITTED' ? null : 'วนกลับมารัก · ร้านตัวอย่าง QA', bankName: status === 'NOT_SUBMITTED' ? null : 'ธนาคารตัวอย่าง', bankAccountName: 'สมใจ ส่งต่อดี', bankAccountLast4: '4567', rejectReason: status === 'REJECTED' ? 'รูปบัตรประชาชนไม่ชัดเจน กรุณาถ่ายใหม่ให้เห็นข้อมูลครบทั้งใบ และตรวจสอบชื่อบัญชีให้ตรงกับผู้ยื่นคำขอ โดยไม่ให้มีแสงสะท้อนบังตัวอักษร' : null, reviewedAt: status === 'APPROVED' ? '2026-09-27T06:00:00Z' : null };
    const verification = { owner: 'qa-owner', record, loading: false, refreshing: false, fieldErrors: scene === 'form-errors' ? { shopName: 'กรุณาระบุชื่อร้าน 2–100 ตัวอักษร', bankAccountNumber: 'กรุณากรอกตัวเลข 10–15 หลัก' } : {}, submitting: false, submitError: null, loadError: null };
    const verificationStore = { load: read, refresh: read, retry: read, clearFieldError: noop, submit: read, getSnapshot: () => verification };
    const amounts = { itemPrice: '590.00', shippingFee: '50.00', inspectionFee: '100.00', totalAmount: '740.00', commissionFee: '29.50', sellerPayout: '560.50', currency: 'THB' };
    const item = { id: 7, name: product.productName, condition: 'GOOD', size: 'M' };
    const paid = ['order-paid','receipt'].includes(scene);
    const order = { id: 42, product: item, amounts, status: paid ? 'WAITING_SELLER_SHIP' : 'WAITING_PAYMENT', paymentStatus: paid ? 'PAID' : 'UNPAID', viewerRole: 'buyer', shippingAddress: { recipientName: 'ผู้รับตัวอย่าง', phone: '0800000000', addressLine: 'บ้านเลขที่ตัวอย่าง สำหรับ QA เท่านั้น', district: 'บางซื่อ', province: 'กรุงเทพมหานคร', postalCode: '10800' }, createdAt: '2026-09-27T06:00:00Z', updatedAt: '2026-09-27T06:05:00Z', paidAt: paid ? '2026-09-27T06:05:00Z' : null, cancelledAt: null, expiresAt: null, receiptNo: paid ? 'QA-RC-0042' : null, canPay: !paid, canCancel: !paid, lastPaymentAttempt: null };
    const detail = { ...initialOrderDetailState, owner: 'qa-owner', orderId: 42, order, receipt: scene === 'receipt' ? { ...amounts, orderId: 42, receiptNo: 'QA-RC-0042', productName: product.productName, issuedAt: '2026-09-27T06:05:00Z' } : null };
    const detailStore = { open: read, close: noop, refresh: read, pay: read, cancel: read, retryUncertain: read, loadReceipt: read };
    const checkout = { ...initialCheckoutState, owner: 'qa-owner', productId: 7, quote: { ...amounts, product: item }, submitError: scene === 'checkout-error' ? 'network-error' : null, uncertain: scene === 'checkout-error' };
    const checkoutStore = { open: read, close: noop, reloadQuote: read, submit: read, retryUncertain: read, clearFieldError: noop };
    const list = { owner: 'qa-owner', view: scene === 'orders-sales' ? 'seller' : 'buyer', items: scene === 'orders-empty' || scene === 'orders-error' || scene === 'orders-loading' ? [] : [{ ...order, totalAmount: '740.00', sellerPayout: '560.50', viewerRole: scene === 'orders-sales' ? 'seller' : 'buyer' }], loaded: scene !== 'orders-loading', loading: scene === 'orders-loading', refreshing: false, error: scene === 'orders-error' ? 'network-error' : null };
    const listStore = { load: read, refresh: read, loadMore: read, setView: read, hasMore: () => false };
    const review = { owner: 'qa-owner', status: 'PENDING', loaded: true, items: [{ id: 1, status: 'PENDING', sellerId: 2, sellerName: 'สมใจ ส่งต่อดี', sellerEmail: 'qa@example.invalid', shopName: record.shopName ?? 'วนกลับมารัก', bankName: 'ธนาคารตัวอย่าง', bankAccountName: 'สมใจ ส่งต่อดี', bankAccountLast4: '4567', submittedAt: '2026-09-27T06:00:00Z', hasIdCardImage: false }], total: 1, selectedId: 1, evidence: null, evidenceError: 'not-found', rejectReason: '', deciding: null, decisionError: null, loading: false, refreshing: false };
    const reviewStore = { load: read, refresh: read, retry: read, setStatus: read, select: noop, loadEvidence: read, setRejectReason: noop, decide: read };
    return { auth, verification: { state: verification, store: verificationStore }, checkout: { state: checkout, store: checkoutStore }, detail: { state: detail, store: detailStore }, list: { state: list, store: listStore }, review: { state: review, store: reviewStore } };
  }, [scene]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() { return useContext(Context).auth; }
export function useVerification() { return useContext(Context).verification; }
export function useCheckout() { return useContext(Context).checkout; }
export function useOrderDetail() { return useContext(Context).detail; }
export function useOrdersList() { return useContext(Context).list; }
export function useReview() { return useContext(Context).review; }
export { photos, unavailable };
