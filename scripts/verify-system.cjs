const assert = require('node:assert/strict');
const { randomBytes, scryptSync, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { loadEnvConfig } = require('@next/env');
const { PrismaClient } = require('../src/generated/prisma');
loadEnvConfig(process.cwd());
const db = new PrismaClient();
const base = 'http://localhost:3111';
const tag = 'verify-' + randomUUID();
let ownerId, clientId, employeeId, projectId, salaryId, credentialId, server, checks = 0, cookie = '';
function check(name, condition) { assert.ok(condition, name); checks++; console.log('PASS ' + name); }
async function call(path, body, credential = cookie) { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(credential ? { Cookie: credential } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(30000) }); return { response: r, body: r.headers.get('content-type')?.includes('application/json') ? await r.json() : null }; }
async function save(body) { const result = await call('/api/workspace', body); assert.equal(result.response.status, 200, result.body?.error); return result.body.result; }
(async () => {
  const password = randomBytes(18).toString('hex'), salt = randomBytes(16).toString('hex'), email = tag + '@example.invalid';
  const owner = await db.owner.create({ data: { name: tag, email, passwordHash: salt + ':' + scryptSync(password, salt, 64).toString('hex') } }); ownerId = owner.id;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3111'], { env: { ...process.env, VERCEL: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); server.stdout.resume(); server.stderr.resume();
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/login', { signal: AbortSignal.timeout(1000) }); break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); } }
  check('private workspace rejects unauthenticated reads', (await call('/api/workspace', null, '')).response.status === 401);
  check('exports reject unauthenticated requests', (await call('/api/export', null, '')).response.status === 401);
  const login = await call('/api/auth', { action: 'login', email, password }, ''); check('owner login succeeds', login.response.status === 200); cookie = login.response.headers.get('set-cookie').split(';')[0];
  const foreign = await fetch(base + '/api/workspace', { method: 'POST', headers: { Origin: 'https://other.example', Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' }); check('cross-origin mutations rejected', foreign.status === 403);
  const client = await save({ action: 'client', name: tag, email: 'client@example.invalid', phone: '03000000000' }); clientId = client.id;
  const project = await save({ action: 'project', name: tag, clientId, agreedAmount: '1000.00', currency: 'USD', source: 'UPWORK', status: 'ACTIVE', deadline: '2026-12-31' }); projectId = project.id; check('client and project save durably', !!projectId);
  check('invalid calendar deadline rejected', (await call('/api/workspace', { action: 'project', id: projectId, name: tag, clientId, agreedAmount: '1000', currency: 'USD', source: 'UPWORK', deadline: '2026-02-30' })).response.status === 400);
  const paymentBody = { action: 'payment', projectId, amount: '300.00', platformFee: '30.00', paidAt: '2026-10-14', method: 'UPWORK', idempotencyKey: randomUUID() };
  const payment = await save(paymentBody); await save(paymentBody); check('payment retry does not duplicate', await db.payment.count({ where: { projectId } }) === 1);
  check('fee above payment rejected', (await call('/api/workspace', { ...paymentBody, amount: '10', platformFee: '11', idempotencyKey: randomUUID() })).response.status === 400);
  check('project total below collected amount rejected', (await call('/api/workspace', { action: 'project', id: projectId, name: tag, clientId, agreedAmount: '200', currency: 'USD', source: 'UPWORK' })).response.status === 400);
  check('currency change after payment rejected', (await call('/api/workspace', { action: 'project', id: projectId, name: tag, clientId, agreedAmount: '1000', currency: 'PKR', source: 'UPWORK' })).response.status === 400);
  const excessive = await call('/api/workspace', { ...paymentBody, amount: '800', idempotencyKey: randomUUID() }); check('overpayment rejected', excessive.response.status === 400);
  const concurrent = await Promise.all([call('/api/workspace', { ...paymentBody, amount: '500', idempotencyKey: randomUUID() }), call('/api/workspace', { ...paymentBody, amount: '500', idempotencyKey: randomUUID() })]); check('concurrent payments serialize against balance', concurrent.filter(r => r.response.status === 200).length === 1 && concurrent.filter(r => r.response.status === 400).length === 1);
  await save({ action: 'voidPayment', id: payment.id, reason: 'Isolated test correction' }); check('voided payment remains in audit ledger', (await db.payment.findUnique({ where: { id: payment.id } })).voidedAt !== null);
  const staff = await save({ action: 'employee', name: tag, role: 'Designer', monthlySalary: '2000', currency: 'USD' }); employeeId = staff.id;
  const salary = await save({ action: 'salaryMonth', employeeId, month: '2026-10' }); salaryId = salary.id;
  await save({ action: 'salaryMonth', employeeId, month: '2026-10' }); check('salary month retry keeps one obligation', await db.salaryEntry.count({ where: { employeeId } }) === 1);
  const advance = { action: 'salaryPayment', salaryEntryId: salaryId, amount: '500', isAdvance: true, paidAt: '2026-10-14', idempotencyKey: randomUUID() }; await save(advance); await save(advance); check('salary advance deduplicated', await db.salaryPayment.count({ where: { salaryEntryId: salaryId } }) === 1);
  check('salary overpayment rejected', (await call('/api/workspace', { ...advance, amount: '1600', idempotencyKey: randomUUID() })).response.status === 400);
  await save({ action: 'expense', description: tag, category: 'RENT', amount: '100', currency: 'USD', spentAt: '2026-10-14' }); check('office expense persists', await db.expense.count({ where: { description: tag } }) === 1);
  const vault = await save({ action: 'credential', projectId, label: tag, username: 'demo', url: 'https://example.invalid', secret: 'isolated-secret-value' }); credentialId = vault.id;
  const stored = await db.credential.findUnique({ where: { id: credentialId } }); check('credentials are stored encrypted', stored.encryptedSecret.startsWith('v1:') && !stored.encryptedSecret.includes('isolated-secret-value'));
  const snapshot = await call('/api/workspace'); check('workspace never sends encrypted or plaintext secrets', !JSON.stringify(snapshot.body).includes('isolated-secret-value') && !JSON.stringify(snapshot.body).includes('encryptedSecret'));
  check('secret reveal rejects incorrect owner password', (await call('/api/workspace', { action: 'revealCredential', id: credentialId, password: 'incorrect' })).response.status === 400);
  check('secret reveal succeeds after password check', (await save({ action: 'revealCredential', id: credentialId, password })).secret === 'isolated-secret-value');
  const csv = await fetch(base + '/api/export?format=csv&currency=USD', { headers: { Cookie: cookie } }); check('CSV export includes project/expense/salary data', csv.ok && (await csv.text()).includes(tag));
  const pdf = await fetch(base + '/api/export?format=pdf&currency=USD', { headers: { Cookie: cookie } }); check('PDF export has real PDF signature', pdf.ok && pdf.headers.get('content-type') === 'application/pdf' && (await pdf.text()).startsWith('%PDF-'));
  const backup = await call('/api/export?format=backup'); check('private backup excludes all secrets and auth data', backup.response.ok && !JSON.stringify(backup.body).includes('encryptedSecret') && !JSON.stringify(backup.body).includes('passwordHash'));
  check('reversed export date range rejected', (await call('/api/export?format=csv&from=2026-12-01&to=2026-01-01')).response.status === 400);
  const otherCurrency = await fetch(base + '/api/export?format=csv&currency=PKR', { headers: { Cookie: cookie } }); check('different currency report excludes USD fixture', !(await otherCurrency.text()).includes(tag));
  const changed = await call('/api/auth', { action: 'password', currentPassword: password, newPassword: password + '-new' }); check('password change succeeds', changed.response.ok);
  check('password change revokes old session', (await call('/api/workspace')).response.status === 401);
  const relogin = await call('/api/auth', { action: 'login', email, password: password + '-new' }, ''); cookie = relogin.response.headers.get('set-cookie').split(';')[0];
  check('new password signs in', relogin.response.ok);
  check('email change rejects wrong current password', (await call('/api/auth', { action: 'email', email: tag + '-new@example.invalid', currentPassword: 'incorrect' })).response.status === 400);
  const newEmail = tag + '-new@example.invalid';
  check('login email change succeeds', (await call('/api/auth', { action: 'email', email: newEmail, currentPassword: password + '-new' })).response.ok);
  check('email change revokes old session', (await call('/api/workspace')).response.status === 401);
  check('old email no longer signs in', (await call('/api/auth', { action: 'login', email, password: password + '-new' }, '')).response.status === 401);
  const emailLogin = await call('/api/auth', { action: 'login', email: newEmail, password: password + '-new' }, '');
  check('new email signs in with existing password', emailLogin.response.ok);
  cookie = emailLogin.response.headers.get('set-cookie').split(';')[0];
  check('logout all devices succeeds', (await call('/api/auth', { action: 'logoutAll' })).response.ok);
  check('logout revokes session immediately', (await call('/api/workspace')).response.status === 401);
  for (let i = 0; i < 5; i++) await call('/api/auth', { action: 'login', email: newEmail, password: 'incorrect-password' }, '');
  check('five failed attempts lock correct-password login', (await call('/api/auth', { action: 'login', email: newEmail, password: password + '-new' }, '')).response.status === 401 && (await db.owner.findUnique({ where: { id: ownerId } })).lockedUntil > new Date());
  console.log(JSON.stringify({ passed: checks, failed: 0, externalMessagesSent: 0 }));
})().catch(e => { console.error('FAIL ' + e.message); process.exitCode = 1; }).finally(async () => {
  server?.kill();
  if (credentialId) await db.credential.deleteMany({ where: { id: credentialId } });
  if (salaryId) { await db.salaryPayment.deleteMany({ where: { salaryEntryId: salaryId } }); await db.salaryEntry.deleteMany({ where: { id: salaryId } }); }
  if (employeeId) await db.employee.deleteMany({ where: { id: employeeId } });
  if (projectId) { await db.payment.deleteMany({ where: { projectId } }); await db.project.deleteMany({ where: { id: projectId } }); }
  if (clientId) await db.client.deleteMany({ where: { id: clientId } });
  await db.expense.deleteMany({ where: { description: tag } });
  if (ownerId) { await db.auditEntry.deleteMany({ where: { actorId: ownerId } }); await db.owner.deleteMany({ where: { id: ownerId } }); }
  await db.$disconnect(); console.log('Isolated verification records cleaned up');
});
