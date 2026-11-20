'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const reports = path.resolve(__dirname, '../.local/reports');
const content = fs.readFileSync(path.join(reports, 'application-audit.jsonl'), 'utf8');
const records = content.trim().split('\n').map((line) => JSON.parse(line));
for (const type of ['LOGIN_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN']) {
  assert.ok(records.some((entry) => entry.type === type), 'Missing audit event ' + type);
}
const session = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.local/smoke-session.json')));
for (const secret of [session.token, process.env.ADMIN_PASSWORD, process.env.JWT_SECRET]) {
  if (secret) assert.ok(!content.includes(secret), 'A secret appeared in the audit log');
}
const allowed = new Set(['timestamp', 'type', 'reason', 'requestId', 'ip', 'method', 'path', 'userId', 'role', 'email']);
for (const entry of records) for (const key of Object.keys(entry)) assert.ok(allowed.has(key), 'Unexpected audit field ' + key);
const summary = { eventCount: records.length, secretExposure: false, eventTypes: [...new Set(records.map((entry) => entry.type))], passed: true };
fs.writeFileSync(path.join(reports, 'security-audit-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
