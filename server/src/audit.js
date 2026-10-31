'use strict';

/**
 * Audit logging (SEC-006).
 *
 * Records failed logins and unauthorized / forbidden API attempts as JSON lines.
 * Only a fixed whitelist of fields is ever written, so passwords, JWTs,
 * Authorization headers and request bodies can never end up in the log
 * (SAD 4.4: "Never log passwords, JWTs, answer keys or full student answers").
 *
 * Output: one JSON object per line in AUDIT_LOG_FILE
 * (default: server/logs/audit.log) and a short line on the console.
 */
const fs = require('fs');
const path = require('path');

const EVENTS = Object.freeze({
  LOGIN_FAILED: 'LOGIN_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED', // missing / invalid / expired token (401)
  FORBIDDEN: 'FORBIDDEN', // authenticated but wrong role (403)
});

const ALLOWED_FIELDS = [
  'type',
  'reason',
  'requestId',
  'ip',
  'method',
  'path',
  'userId',
  'role',
  'email', // only on LOGIN_FAILED, to spot credential-stuffing; never a password
];

let dirReady = false;

function logFilePath() {
  return process.env.AUDIT_LOG_FILE || path.join(__dirname, '..', 'logs', 'audit.log');
}

/** Build the safe, whitelisted audit entry for an event. */
function buildEntry(event) {
  const entry = { timestamp: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (event[key] !== undefined && event[key] !== null) {
      entry[key] = String(event[key]);
    }
  }
  return entry;
}

/** Helper: pull the loggable request metadata (never headers/body). */
function fromRequest(req) {
  return {
    requestId: req.id,
    ip: req.ip,
    method: req.method,
    path: (req.originalUrl || req.url || '').split('?')[0], // drop query string
  };
}

function record(event) {
  const entry = buildEntry(event);
  const line = JSON.stringify(entry);

  if (process.env.NODE_ENV === 'test') return entry; // keep test output clean

  console.warn(`[audit] ${entry.type} ${entry.reason || ''} ${entry.path || ''} req=${entry.requestId || '-'}`);
  try {
    const file = logFilePath();
    if (!dirReady) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      dirReady = true;
    }
    fs.appendFile(file, line + '\n', (err) => {
      if (err) console.error('[audit] failed to write audit log:', err.message);
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
  return entry;
}

module.exports = { EVENTS, record, fromRequest, buildEntry };