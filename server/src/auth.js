'use strict';

/**
 * Authentication & Administration module (Saikavin S - PES1UG24CS402)
 *
 *   FR-001   register / log in with a unique email
 *   FR-002   Student vs Administrator access
 *   SEC-001  bcrypt password hashing
 *   SEC-002  reject unauthorized access to role-protected APIs
 *   SEC-004  JWT expiry + validation on every secured request
 *   SEC-006  audit log of failed logins and unauthorized attempts
 *
 * Exports for other modules:
 *   authenticate          - middleware: requires a valid JWT, sets req.user
 *   requireRole(...roles) - middleware: requires req.user.role in roles
 *   ROLES                 - { STUDENT, ADMIN }
 *   router                - mounted at /api/auth
 *
 * Usage in another module's router:
 *   router.post('/', authenticate, requireRole(ROLES.ADMIN), handler);
 */
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { User, ROLES, USER_STATUS } = require('./models');
const audit = require('./audit');
const { HttpError, asyncHandler } = require('./errors');

const router = express.Router();

/* ----------------------------- configuration ----------------------------- */

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const JWT_ALGORITHM = 'HS256';

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function jwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '1h'; // SEC-004: tokens always expire
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
  return jwt.sign({ role: user.role }, jwtSecret(), {
    algorithm: JWT_ALGORITHM,
    subject: String(user.id),
    expiresIn: jwtExpiresIn(),
  });
}

function unauthenticated(req, reason, message = 'Authentication required') {
  audit.record({ type: audit.EVENTS.UNAUTHENTICATED, reason, ...audit.fromRequest(req) });
  return new HttpError(401, reason === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED', message);
}

/* --------------------------------- routes -------------------------------- */

// POST /api/auth/register  ->  201 { userId } | 400 | 409
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = validateRegistration(req.body);

    // Public registration ALWAYS creates a Student. Any "role" sent by the
    // client is ignored (prevents privilege escalation). Administrators are
    // created with `npm run seed:users`.
    if (await User.findOne({ email })) {
      throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS); // SEC-001
    let user;
    try {
      user = await User.create({ name, email, passwordHash, role: ROLES.STUDENT });
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

// POST /api/auth/login  ->  200 { token, role } | 400 | 401
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = validateLogin(req.body);

    const user = await User.findOne({ email });
    const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    let failure = null;
    if (!user || !passwordOk) failure = 'INVALID_CREDENTIALS';
    else if (user.status !== USER_STATUS.ACTIVE) failure = 'ACCOUNT_DISABLED';

    if (failure) {
      // SEC-006. The client always sees the same message, so an attacker cannot
      // tell "unknown email" from "wrong password" from "disabled account".
      audit.record({
        type: audit.EVENTS.LOGIN_FAILED,
        reason: failure,
        email,
        userId: user ? user.id : undefined,
        ...audit.fromRequest(req),
      });
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    res.status(200).json({ token: signToken(user), role: user.role });
  })
);

/* ------------------------------- middleware ------------------------------ */

/**
 * SEC-004: validates the JWT on EVERY secured request - signature, algorithm
 * and expiry - then re-loads the user so a deleted/disabled account loses
 * access immediately. The role is taken from the database, not trusted from
 * the token, so a role change takes effect at once.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    throw unauthenticated(req, 'MISSING_TOKEN');
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret(), { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    if (err.message === 'JWT_SECRET is not set') throw err; // config error -> 500
    throw unauthenticated(
      req,
      err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      err.name === 'TokenExpiredError' ? 'Token has expired' : 'Authentication required'
    );
  }

  let user = null;
  try {
    user = await User.findById(payload.sub);
  } catch (_) {
    user = null; // malformed id in token
  }
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    throw unauthenticated(req, 'USER_INACTIVE');
  }

  req.user = {
    userId: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
  next();
});

/**
 * FR-002 / SEC-002: server-side RBAC. Use AFTER `authenticate`.
 *   router.get('/x', authenticate, requireRole(ROLES.ADMIN), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(unauthenticated(req, 'MISSING_TOKEN'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      audit.record({
        type: audit.EVENTS.FORBIDDEN,
        reason: 'INSUFFICIENT_ROLE',
        userId: req.user.userId,
        role: req.user.role,
        ...audit.fromRequest(req),
      });
      return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    return next();
  };
}

// GET /api/auth/me  ->  200 { userId, name, email, role }   (any signed-in user)
router.get('/me', authenticate, (req, res) => res.json(req.user));

module.exports = { router, authenticate, requireRole, ROLES };