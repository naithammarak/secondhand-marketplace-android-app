const path = require('node:path');
const { spawn } = require('node:child_process');

const project = path.resolve(__dirname, '..');
require('@expo/env').load(project);
const required = ['EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Live app configuration missing: ${missing.join(', ')}. Set mobile/.env.local before starting.`);
  process.exit(1);
}
// A live run must never inherit visual fixtures from a previous QA shell.
delete process.env.WONDEE_VISUAL_QA;
process.env.EXPO_PUBLIC_PRODUCT_CATALOG_MODE = 'api';
process.env.EXPO_PUBLIC_PRODUCT_MOCK_MODE = 'false';
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin', 'cli');
const child = spawn(process.execPath, [cli, 'start', '--web', ...process.argv.slice(2)], {
  cwd: project, env: process.env, stdio: 'inherit',
});
child.on('exit', code => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
