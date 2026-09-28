const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
if (process.env.WONDEE_VISUAL_QA === '1') {
  const aliases = {
    '@/auth/auth-provider': 'providers',
    '@/verification/verification-provider': 'providers',
    '@/orders/orders-provider': 'providers',
    '@/admin/review-provider': 'providers',
    '@/products/product-catalog-instance': 'catalog',
    '@/services/product-service': 'products',
  };
  config.resolver.resolveRequest = (context, name, platform) => context.resolveRequest(
    context, aliases[name] ? path.join(__dirname, 'visual-tests/shims', aliases[name] + '.tsx') : name, platform,
  );
}
module.exports = config;
