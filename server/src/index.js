'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { createApp } = require('./app');

async function main() {
  const { MONGO_URI, JWT_SECRET, PORT = 5000 } = process.env;
  if (!MONGO_URI) throw new Error('MONGO_URI is not set (see server/.env.example)');
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set (see server/.env.example)');
  if (JWT_SECRET.length < 32) {
    console.warn('[warn] JWT_SECRET is short; use at least 32 random characters.');
  }

  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected');

  createApp().listen(PORT, () => console.log(`OEP API listening on port ${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
