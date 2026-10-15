'use strict';

/**
 * Covers the Auth/Admin test cases from the STP:
 *   TC-01 (FR-001)            register / duplicate email / wrong password
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
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { User } = require('../src/models');

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

beforeEach(() => {
  User.__store.length = 0;
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
    [{ name: 'A', email: 'a@b.co' }],
  ])('invalid registration -> 400 (%j)', async (body) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('valid credentials return a token', async () => {
    await addUser('s@example.com', 'Student');
    const res = await loginAs('s@example.com');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  test('wrong password -> 401', async () => {
    await addUser('s@example.com', 'Student');
    const res = await loginAs('s@example.com', 'WrongPassword1!');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  test('unknown email gives the same 401 as a wrong password', async () => {
    const res = await loginAs('nobody@example.com');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
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
