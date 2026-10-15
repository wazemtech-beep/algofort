// Apply this additive upgrade to an existing Algofort database. No reset or data deletion.
const { loadEnvConfig } = require('@next/env');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
loadEnvConfig(path.resolve(__dirname, '..'));
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--file', 'prisma/meeting-update.sql', '--schema', 'prisma/schema.prisma'], { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
