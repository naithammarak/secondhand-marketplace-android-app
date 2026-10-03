/**
 * Route targets for the whole app (UI1 milestone UI1-01).
 *
 * UI1 owns customer/seller routes. Staff targets below are the names UI2 implements
 * behind its own screens; they are listed here so both owners navigate with one table
 * instead of hand-written paths. Navigation is convenience only: every screen still
 * relies on the server for authorization.
 */
import type { Href } from 'expo-router';

const id = (value: number | string) => String(value);

export const routes = {
  home: '/' as const,
  login: '/login' as const,
  profile: '/profile' as const,
  sellerVerification: '/seller-verification' as const,
  myProducts: '/product/mine' as const,
  newProduct: '/product/new' as const,
  editProduct: (productId: number | string): Href => ({ pathname: '/product/[id]/edit', params: { id: id(productId) } }),
  product: (productId: number | string): Href => ({ pathname: '/products/[id]', params: { id: id(productId) } }),
  checkout: (productId: number | string): Href => ({ pathname: '/checkout/[productId]', params: { productId: id(productId) } }),
  buyerOrders: '/orders?view=buyer' as const,
  sellerOrders: '/orders?view=seller' as const,
  order: (orderId: number | string): Href => ({ pathname: '/orders/[orderId]', params: { orderId: id(orderId) } }),
  orderInspection: (orderId: number | string): Href => ({ pathname: '/orders/[orderId]/inspection', params: { orderId: id(orderId) } }),
  shipToCenter: (orderId: number | string): Href => ({ pathname: '/orders/[orderId]/ship-to-center', params: { orderId: id(orderId) } }),
  orderReview: (orderId: number | string): Href => ({ pathname: '/orders/[orderId]/review', params: { orderId: id(orderId) } }),
  receipt: (orderId: number | string): Href => ({ pathname: '/receipt/[orderId]', params: { orderId: id(orderId) } }),
  publicCertificate: (token: string): Href => ({ pathname: '/certificates/[token]', params: { token } }),
} as const;

/** Staff route targets implemented by UI2. UI1 only links to them; it never renders staff work. */
export const staffRoutes = {
  inspectorQueue: '/inspections' as const,
  inspectorWork: (inspectionId: number | string): Href => ({ pathname: '/inspections/[inspectionId]', params: { inspectionId: id(inspectionId) } }),
  adminVerifications: '/admin-verifications' as const,
  adminDeliveries: '/admin-deliveries' as const,
  adminCertificates: '/admin-certificates' as const,
  adminCertificate: (certificateId: number | string): Href => ({ pathname: '/admin-certificates/[certificateId]', params: { certificateId: id(certificateId) } }),
} as const;

export type StaffRole = 'INSPECTOR' | 'ADMIN';

/** Workspace entry shown on Profile for provisioned staff roles. Role comes from the backend account only. */
export function staffWorkspaceFor(role: string | null | undefined): { label: string; href: Href }[] {
  if (role === 'INSPECTOR') return [{ label: 'งานตรวจสินค้า', href: staffRoutes.inspectorQueue }];
  if (role === 'ADMIN') {
    return [
      { label: 'คำขอเปิดร้าน', href: staffRoutes.adminVerifications },
      { label: 'เคสจัดส่งและรับคืน', href: staffRoutes.adminDeliveries },
      { label: 'ใบรับรองผลตรวจ', href: staffRoutes.adminCertificates },
    ];
  }
  return [];
}
