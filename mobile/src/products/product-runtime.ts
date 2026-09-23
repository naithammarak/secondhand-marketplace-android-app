/** Product mocks are opt-in and limited to development builds. */
export function isProductMockModeEnabled(): boolean {
  return typeof __DEV__ !== 'undefined'
    && __DEV__
    && process.env.EXPO_PUBLIC_PRODUCT_MOCK_MODE === 'true';
}
