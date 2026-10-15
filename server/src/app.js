'use strict';

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

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

  // TEAMMATES: mount your routers here, e.g.
  //   app.use('/api/questions', questionRouter);
  //   app.use('/api/exams', examRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
