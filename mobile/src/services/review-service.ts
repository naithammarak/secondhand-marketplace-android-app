import { createPrivateApi } from './profile-review-api.ts';

export type ReviewInput = { rating: number; comment: string };
export type SubmittedReview = ReviewInput & { id: number; order_id: number; created_at: string };
export type OrderReview = { order_id: number; can_review: boolean; review: SubmittedReview | null };
export type PublicReview = ReviewInput & { id: number; created_at: string; reviewer_label: string; product_name: string };
export type SellerReviews = { seller_id: number; summary: { count: number; average_rating: number | null; distribution: Record<string, number> };
  items: PublicReview[]; total: number; limit: number; offset: number };

export function createReviewService(options: Parameters<typeof createPrivateApi>[0]) {
  const request = createPrivateApi(options);
  return {
    get: (token: string, orderId: number, signal?: AbortSignal) => request<OrderReview>(`/orders/${orderId}/review`, token, {}, signal),
    submit: (token: string, orderId: number, input: ReviewInput, key: string, signal?: AbortSignal) =>
      request<SubmittedReview>(`/orders/${orderId}/review`, token, { method: 'POST', headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ rating: input.rating, comment: input.comment }) }, signal),
    publicList: (sellerId: number, offset = 0, limit = 20, signal?: AbortSignal) =>
      request<SellerReviews>(`/sellers/${sellerId}/reviews?limit=${limit}&offset=${offset}`, null, {}, signal),
  };
}
