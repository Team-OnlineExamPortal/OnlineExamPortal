'use strict';

/**
 * Authentication & Administration module (Saikavin S - PES1UG24CS402)
 *
 *   FR-001   register / log in with a unique email
 *   SEC-001  bcrypt password hashing
 *
 * Exports for other modules:
 *   router - mounted at /api/auth
 */
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { User } = require('./models');
const { HttpError, asyncHandler } = require('./errors');

const router = express.Router();

/* ----------------------------- configuration ----------------------------- */

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

// Compared against when the email is unknown so login takes about the same time
// whether or not the account exists (avoids user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

/* ------------------------------- validation ------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything beyond 72 bytes

const isString = (v) => typeof v === 'string';

/**
 * Inputs MUST be plain strings. Rejecting objects here blocks NoSQL operator
 * injection such as { "email": { "$ne": null } } before it reaches MongoDB.
 */
function validateRegistration(body) {
  const { name, email, password } = body || {};
  if (!isString(name) || !name.trim() || name.trim().length > 100) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Name is required (max 100 characters)');
  }
  if (!isString(email) || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid email is required');
  }
  if (
    !isString(password) ||
    password.length < MIN_PASSWORD_LEN ||
    Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Password must be ${MIN_PASSWORD_LEN}-${MAX_PASSWORD_BYTES} bytes long`
    );
  }
  return {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
  };
}

function validateLogin(body) {
  const { email, password } = body || {};
  if (!isString(email) || !isString(password) || !email.trim() || !password) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }
  return { email: email.trim().toLowerCase(), password };
}

/* -------------------------------- helpers -------------------------------- */

function signToken(user) {
  return jwt.sign({}, jwtSecret(), { subject: String(user.id) });
}

/* --------------------------------- routes -------------------------------- */

// POST /api/auth/register  ->  201 { userId } | 400 | 409
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = validateRegistration(req.body);

    if (await User.findOne({ email })) {
      throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS); // SEC-001
    let user;
    try {
      user = await User.create({ name, email, passwordHash });
    } catch (err) {
      if (err && err.code === 11000) {
        // Lost a race with a simultaneous registration (unique index).
        throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
      }
      throw err;
    }

    res.status(201).json({ userId: String(user.id) });
  })
);

// POST /api/auth/login  ->  200 { token } | 400 | 401
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = validateLogin(req.body);

    const user = await User.findOne({ email });
    const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !passwordOk) {
      // Same message for "unknown email" and "wrong password", so an attacker
      // cannot tell which one was wrong.
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    res.status(200).json({ token: signToken(user) });
  })
);

module.exports = { router };
