'use strict';

/**
 * Covers the Auth/Admin test cases from the STP:
 *   TC-01 (FR-001)            register / duplicate email / wrong password
 *   TC-02 (FR-002, SEC-002)   student token on admin API -> 403
 *   TC-19 (SEC-001)           bcrypt hash stored, plaintext absent
 *   TC-20 (SEC-004, SEC-006)  expired / invalid JWT rejected, events logged
 *   TC-29 (SEC-006)           repeated forbidden calls are all audited
 *
 * The User model is replaced with an in-memory fake, so no MongoDB is needed.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.BCRYPT_ROUNDS = '4'; // fast hashing for tests

jest.mock('../src/models', () => {
  const store = [];
  let counter = 0;
  const ROLES = { STUDENT: 'Student', ADMIN: 'Administrator' };
  const USER_STATUS = { ACTIVE: 'active', DISABLED: 'disabled' };
  const User = {
    __store: store,
    async findOne({ email }) {
      return store.find((u) => u.email === email) || null;
    },
    async findById(id) {
      return store.find((u) => u.id === id) || null;
    },
    async create(doc) {
      if (store.some((u) => u.email === doc.email)) {
        const err = new Error('E11000 duplicate key');
        err.code = 11000;
        throw err;
      }
      counter += 1;
      const user = { id: `user${counter}`, status: 'active', ...doc };
      store.push(user);
      return user;
    },
  };
  return { User, ROLES, USER_STATUS };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { User } = require('../src/models');
const audit = require('../src/audit');

const app = createApp();
const PASSWORD = 'Str0ngPassw0rd!';

async function addUser(email, role, status = 'active') {
  return User.create({
    name: 'Test User',
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role,
    status,
  });
}

async function loginAs(email, password = PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

let auditSpy;
beforeEach(() => {
  User.__store.length = 0;
  auditSpy = jest.spyOn(audit, 'record');
});
afterEach(() => jest.restoreAllMocks());

describe('TC-01 / FR-001: register and log in with a unique email', () => {
  test('registers a student and returns 201 {userId}', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha', email: 'Asha@Example.com', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBeTruthy();
    expect(User.__store[0].email).toBe('asha@example.com'); // normalized
    expect(User.__store[0].role).toBe('Student');
  });

  test('ignores a client-supplied role (no self-made admins)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@example.com', password: PASSWORD, role: 'Administrator' });
    expect(User.__store[0].role).toBe('Student');
  });

  test('duplicate email -> 409', async () => {
    const body = { name: 'Asha', email: 'asha@example.com', password: PASSWORD };
    expect((await request(app).post('/api/auth/register').send(body)).status).toBe(201);
    const dup = await request(app).post('/api/auth/register').send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_EXISTS');
    expect(dup.body.requestId).toBeTruthy();
  });

  test.each([
    [{ name: '', email: 'a@b.co', password: PASSWORD }],
    [{ name: 'A', email: 'not-an-email', password: PASSWORD }],
    [{ name: 'A', email: 'a@b.co', password: 'short' }],
    [{ name: 'A', email: 'a@b.co', password: 'x'.repeat(73) }],
    [{ name: 'A', email: 'a@b.co' }],
  ])('invalid registration -> 400 (%j)', async (body) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('valid credentials return a token and role', async () => {
    await addUser('s@example.com', 'Student');
    const res = await loginAs('s@example.com');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Student');
    expect(typeof res.body.token).toBe('string');
  });

  test('wrong password -> 401 and the failure is audited', async () => {
    await addUser('s@example.com', 'Student');
    const res = await loginAs('s@example.com', 'WrongPassword1!');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOGIN_FAILED', reason: 'INVALID_CREDENTIALS' })
    );
  });

  test('unknown email gives the same 401 as a wrong password', async () => {
    const res = await loginAs('nobody@example.com');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  test('disabled account cannot log in', async () => {
    await addUser('d@example.com', 'Student', 'disabled');
    const res = await loginAs('d@example.com');
    expect(res.status).toBe(401);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'ACCOUNT_DISABLED' }));
  });

  test('NoSQL operator injection in login is rejected (400)', async () => {
    await addUser('s@example.com', 'Student');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test('malformed JSON -> 400 with standard error body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({ code: 'INVALID_JSON', requestId: expect.any(String) })
    );
  });
});

describe('TC-19 / SEC-001: passwords are bcrypt-hashed', () => {
  test('stored credential is a bcrypt hash; plaintext is absent', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha', email: 'asha@example.com', password: PASSWORD });
    const stored = User.__store[0];
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(JSON.stringify(stored)).not.toContain(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, stored.passwordHash)).toBe(true);
  });
});

describe('TC-02 / FR-002 + SEC-002: role-based access', () => {
  test('student token on an admin API -> 403, admin token -> 200', async () => {
    await addUser('s@example.com', 'Student');
    await addUser('a@example.com', 'Administrator');
    const student = (await loginAs('s@example.com')).body.token;
    const admin = (await loginAs('a@example.com')).body.token;

    const denied = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${student}`);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');

    const allowed = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${admin}`);
    expect(allowed.status).toBe(200);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/admin/ping');
    expect(res.status).toBe(401);
  });

  test('role comes from the database, not the token claim', async () => {
    const user = await addUser('s@example.com', 'Student');
    const forged = jwt.sign({ role: 'Administrator' }, process.env.JWT_SECRET, {
      subject: user.id,
      expiresIn: '1h',
    });
    const res = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(403);
  });

  test('/api/auth/me returns the signed-in user without the hash', async () => {
    await addUser('s@example.com', 'Student');
    const token = (await loginAs('s@example.com')).body.token;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ email: 's@example.com', role: 'Student' }));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
});

describe('TC-20 / SEC-004: JWT expiry and validation', () => {
  test('expired token -> 401 TOKEN_EXPIRED and audited', async () => {
    const user = await addUser('s@example.com', 'Student');
    const expired = jwt.sign({ role: 'Student' }, process.env.JWT_SECRET, {
      subject: user.id,
      expiresIn: -10,
    });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UNAUTHENTICATED', reason: 'TOKEN_EXPIRED' })
    );
  });

  test('garbage token and wrong-secret token -> 401', async () => {
    const user = await addUser('s@example.com', 'Student');
    const wrongSecret = jwt.sign({ role: 'Student' }, 'another-secret-another-secret-xyz', {
      subject: user.id,
      expiresIn: '1h',
    });
    for (const token of ['not.a.jwt', wrongSecret]) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  test('alg=none token is rejected', async () => {
    const user = await addUser('s@example.com', 'Student');
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, role: 'Administrator' })}.`;
    const res = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${none}`);
    expect(res.status).toBe(401);
  });

  test('token of a disabled/removed user is rejected immediately', async () => {
    const user = await addUser('s@example.com', 'Student');
    const token = (await loginAs('s@example.com')).body.token;
    user.status = 'disabled';
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('issued tokens carry an expiry', async () => {
    await addUser('s@example.com', 'Student');
    const { token } = (await loginAs('s@example.com')).body;
    const decoded = jwt.decode(token);
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });
});

describe('TC-20 + TC-29 / SEC-006: audit trail', () => {
  test('repeated forbidden calls are each recorded, without secrets', async () => {
    await addUser('s@example.com', 'Student');
    const token = (await loginAs('s@example.com')).body.token;

    for (let i = 0; i < 3; i += 1) {
      const r = await request(app).get('/api/admin/ping?x=1').set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(403);
    }

    const forbidden = auditSpy.mock.calls.map((c) => c[0]).filter((e) => e.type === 'FORBIDDEN');
    expect(forbidden).toHaveLength(3);
    forbidden.forEach((e) =>
      expect(e).toEqual(
        expect.objectContaining({ role: 'Student', path: '/api/admin/ping', requestId: expect.any(String) })
      )
    );

    // What would actually be written: whitelisted fields only.
    const written = JSON.stringify(forbidden.map((e) => audit.buildEntry(e)));
    expect(written).not.toContain(token);
    expect(written).not.toContain(PASSWORD);
    expect(written).not.toMatch(/authorization|bearer|passwordHash/i);
  });

  test('buildEntry drops anything not on the whitelist', () => {
    const entry = audit.buildEntry({
      type: 'LOGIN_FAILED',
      password: 'hunter2',
      token: 'abc.def.ghi',
      reason: 'INVALID_CREDENTIALS',
    });
    expect(entry).not.toHaveProperty('password');
    expect(entry).not.toHaveProperty('token');
    expect(entry).toEqual(expect.objectContaining({ type: 'LOGIN_FAILED', timestamp: expect.any(String) }));
  });

  test('failed-login audit entry never contains the password', async () => {
    await addUser('s@example.com', 'Student');
    await loginAs('s@example.com', 'WrongPassword1!');
    const events = auditSpy.mock.calls.map((c) => audit.buildEntry(c[0]));
    expect(JSON.stringify(events)).not.toContain('WrongPassword1!');
  });
});