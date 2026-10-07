import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createFulfillmentService } from '/home/tmk/project/market-place-mobile-app/worktrees/ui2-staff-certificates/mobile/src/services/fulfillment-service.ts';
const adminSub = execFileSync('podman', ['exec', 'ui2-smoke-pg-20261003', 'psql', '-U', 'postgres', '-d', 'ui2smoke', '-tAc', "select supabase_user_id from users where role='ADMIN' limit 1"]).toString().trim();
const shipmentId = Number(execFileSync('podman', ['exec', 'ui2-smoke-pg-20261003', 'psql', '-U', 'postgres', '-d', 'ui2smoke', '-tAc', "select id from shipments where leg='TO_CENTER' order by id limit 1"]).toString().trim());
const b = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ sub: adminSub, aud: 'authenticated', iss: 'https://example-project.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 600 });
const token = `${h}.${p}.${createHmac('sha256', 'test-secret-key-for-jwt-testing-12345678901234567890').update(`${h}.${p}`).digest('base64url')}`;
const service = createFulfillmentService({ baseUrl: 'http://127.0.0.1:8082' });
try { await service.recordShippingEvent(token, shipmentId, { leg: 'TO_CENTER', event: 'DELIVERED', event_id: 'demo-off-check-01' }, 'demo-off-key-0001'); console.log('UNEXPECTED SUCCESS'); process.exit(1); }
catch (error) { console.log(`demo disabled -> ${error.status} ${error.code}`); process.exit(error.status === 403 && error.code === 'shipping_demo_disabled' ? 0 : 1); }
