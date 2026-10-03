const config = require('./app.json').expo;
// The fixture router exists only when explicitly starting the local QA server.
// Normal web/Android exports use src/app and do not import visual-tests.
module.exports = () => ({
  ...config,
  name: '2NDHAND Marketplace',
  experiments: { ...config.experiments, typedRoutes: process.env.WONDEE_VISUAL_QA !== '1' },
  plugins: config.plugins.map(plugin => plugin === 'expo-router' && process.env.WONDEE_VISUAL_QA === '1'
    ? ['expo-router', { root: './visual-tests/app' }] : plugin),
});
