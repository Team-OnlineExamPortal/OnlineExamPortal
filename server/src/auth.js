'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { User } = require('./models');
const { HttpError, asyncHandler } = require('./errors');

const router = express.Router();

const BCRYPT_ROUNDS = 10;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;
const isString = (v) => typeof v === 'string';

function validateRegistration(body) {
  const { name, email, password } = body || {};
  if (!isString(name) || !name.trim() || name.trim().length > 100) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Name is required (max 100 characters)');
  }
  if (!isString(email) || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid email is required');
  }
  if (!isString(password) || password.length < MIN_PASSWORD_LEN) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Password must be at least ${MIN_PASSWORD_LEN} characters long`);
  }
  return { name: name.trim(), email: email.trim().toLowerCase(), password };
}

function validateLogin(body) {
  const { email, password } = body || {};
  if (!isString(email) || !isString(password) || !email.trim() || !password) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }
  return { email: email.trim().toLowerCase(), password };
}

function signToken(user) {
  return jwt.sign({}, jwtSecret(), { subject: String(user.id) });
}

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password } = validateRegistration(req.body);

  if (await User.findOne({ email })) {
    throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await User.create({ name, email, passwordHash });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    }
    throw err;
  }

  res.status(201).json({ userId: String(user.id) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = validateLogin(req.body);

  const user = await User.findOne({ email });
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  res.status(200).json({ token: signToken(user) });
}));

module.exports = { router };