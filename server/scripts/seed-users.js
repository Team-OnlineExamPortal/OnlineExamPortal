'use strict';

/**
 * Creates the Administrator (and optionally a demo Student) account.
 * Public registration can only create Students, so admins come from here.
 *
 *   ADMIN_NAME="Admin" ADMIN_EMAIL=admin@oep.test ADMIN_PASSWORD='ChangeMe123!' \
 *   [STUDENT_EMAIL=student@oep.test STUDENT_PASSWORD='ChangeMe123!'] \
 *   npm run seed:users
 *
 * Re-running is safe: existing emails are skipped, never overwritten.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { User, ROLES } = require('../src/models');

async function upsertUser({ name, email, password, role }) {
  const normalized = email.trim().toLowerCase();
  if (await User.findOne({ email: normalized })) {
    console.log(`skip   ${role}: ${normalized} (already exists)`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '10', 10));
  await User.create({ name, email: normalized, passwordHash, role });
  console.log(`create ${role}: ${normalized}`);
}

async function main() {
  const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Administrator' } = process.env;
  const { STUDENT_EMAIL, STUDENT_PASSWORD, STUDENT_NAME = 'Demo Student' } = process.env;
  if (!MONGO_URI) throw new Error('MONGO_URI is not set');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');

  await mongoose.connect(MONGO_URI);
  await upsertUser({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: ROLES.ADMIN });
  if (STUDENT_EMAIL && STUDENT_PASSWORD) {
    await upsertUser({ name: STUDENT_NAME, email: STUDENT_EMAIL, password: STUDENT_PASSWORD, role: ROLES.STUDENT });
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});