'use strict';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'authorization-audit-test-secret';
process.env.BCRYPT_ROUNDS = '4';
jest.mock('../src/models', () => ({
  ...jest.requireActual('../src/models'),
  User: { findById: async (id) => ({ id, role: 'Student', status: 'active' }) },
  Attempt: { findById: async () => ({ studentId: 'owner' }) },
}));
const request = require('supertest');
const jwt = require('jsonwebtoken');
const audit = require('../src/audit');
const { createApp } = require('../src/app');
test('logs ownership denial and role denial exactly once without request bodies', async () => {
  const spy = jest.spyOn(audit, 'record');
  const token = jwt.sign({}, process.env.JWT_SECRET, { subject: 'other' });
  try {
    await request(createApp()).get('/api/attempts/507f1f77bcf86cd799439011').set('Authorization', 'Bearer ' + token).expect(403);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'FORBIDDEN', userId: 'other', reason: 'FORBIDDEN' }));
    spy.mockClear();
    await request(createApp()).get('/api/admin/ping').set('Authorization', 'Bearer ' + token).expect(403);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(token);
  } finally { spy.mockRestore(); }
});
