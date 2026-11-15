'use strict';

const { HttpError } = require('./errors');

// Keep user text intact. Query operators and paths belong in server code,
// and user text belongs in JSON responses and React text nodes.
function rejectUnsafeInput(req, res, next) {
  const pending = [req.body, req.query];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object') continue;
    for (const [key, field] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.') ||
          key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return next(new HttpError(400, 'VALIDATION_ERROR', 'Request contains an unsupported field name'));
      }
      if (field !== null && typeof field === 'object') pending.push(field);
    }
  }
  return next();
}

module.exports = { rejectUnsafeInput };
