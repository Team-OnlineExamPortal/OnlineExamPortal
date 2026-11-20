'use strict';
process.env.JWT_SECRET = 'admin-route-test-secret';
process.env.BCRYPT_ROUNDS = '4';
jest.mock('../src/models', () => ({
  ...jest.requireActual('../src/models'),
  User: { findById: jest.fn(), find: jest.fn() },
  Exam: { find: jest.fn() },
}));
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { User, Exam } = require('../src/models');
const auth = (role) => 'Bearer ' + jwt.sign({}, process.env.JWT_SECRET, { subject: role });
beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockImplementation(async (role) => ({ id: role, role, status: 'active' }));
});
test('student directory and full exam schedule are administrator-only and project safe fields', async () => {
  const api = request(createApp());
  for (const route of ['/api/admin/students', '/api/exams']) {
    await api.get(route).expect(401);
    await api.get(route).set('Authorization', auth('Student')).expect(403);
  }
  const selectUsers = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: 'student', name: 'Student' }]) });
  User.find.mockReturnValue({ select: selectUsers });
  await api.get('/api/admin/students').set('Authorization', auth('Administrator')).expect(200);
  expect(selectUsers).toHaveBeenCalledWith('_id name email');
  expect(User.find).toHaveBeenCalledWith({ role: 'Student' });
  Exam.find.mockReturnValue({ select: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }) });
  await api.get('/api/exams').set('Authorization', auth('Administrator')).expect(200, []);
});
