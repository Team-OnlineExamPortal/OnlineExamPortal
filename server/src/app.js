'use strict';

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { router: authRouter, authenticate, requireRole, ROLES } = require('./auth');
const { router: examRouter } = require('./exams');
const { notFound, errorHandler } = require('./errors');

function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
  app.use(requestId);
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Auth/Admin module (FR-001, FR-002, SEC-001/002/004/006)
  app.use('/api/auth', authRouter);

  // Placeholder admin-only route for TC-02
  app.get('/api/admin/ping', authenticate, requireRole(ROLES.ADMIN), (req, res) =>
    res.json({ ok: true })
  );

  // Exam Management module (FR-004, FR-006, SEC-002, SEC-003, SEC-005)
  app.use('/api/exams', examRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
