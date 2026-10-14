const { loadEnvConfig } = require('@next/env');
const { randomBytes, scryptSync } = require('node:crypto');
const fs = require('node:fs');
const { PrismaClient } = require('../src/generated/prisma');
loadEnvConfig(process.cwd());
const db = new PrismaClient();
(async () => {
  if (await db.owner.count()) throw new Error('Owner already exists. Use password change in Settings.');
  const email = process.env.INITIAL_OWNER_EMAIL || 'owner@algofort.local';
  const password = process.env.INITIAL_OWNER_PASSWORD || randomBytes(18).toString('base64url');
  if (password.length < 12 || !email.includes('@')) throw new Error('Valid email and a password of at least 12 characters required.');
  const salt = randomBytes(16).toString('hex');
  const owner = await db.owner.create({ data: { email: email.toLowerCase(), name: 'Algofort', passwordHash: salt + ':' + scryptSync(password, salt, 64).toString('hex') } });
  fs.writeFileSync('.env.owner-login', 'LOGIN_URL=http://localhost:3100/login\nEMAIL=' + owner.email + '\nPASSWORD=' + password + '\n', { mode: 0o600 });
  console.log('Owner created. Credentials saved privately in .env.owner-login. Change password after signing in.');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
