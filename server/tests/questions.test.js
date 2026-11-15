'use strict';

process.env.JWT_SECRET = 'question-bank-test-secret';
process.env.BCRYPT_ROUNDS = '4';

jest.mock('../src/models', () => ({
  ...jest.requireActual('../src/models'),
  User: { findById: jest.fn() },
  Question: { create: jest.fn(), find: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { Question, User } = require('../src/models');

const api = request(createApp());
const id = '507f1f77bcf86cd799439011';
const item = { text: 'What is 2 + 2?', options: ['3', '4'], correctOption: 1, category: 'Math' };
const auth = (role) => `Bearer ${jwt.sign({}, process.env.JWT_SECRET, { subject: role })}`;
const admin = auth('Administrator');

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockImplementation(async (role) => ({ id: role, role, status: 'active' }));
  Question.create.mockImplementation(async (fields) => ({ _id: id, ...fields }));
  Question.findByIdAndUpdate.mockImplementation(async (_, { $set }) => ({ _id: id, ...$set }));
});

test('requires an administrator for the question bank', async () => {
  await api.get('/api/questions').expect(401);
  await api.get('/api/questions').set('Authorization', auth('Student')).expect(403);
  await api.post('/api/questions').set('Authorization', auth('Student')).send(item).expect(403);
  expect(Question.create).not.toHaveBeenCalled();
});

test('creates, filters, edits and disables questions with fixed database fields', async () => {
  await api.post('/api/questions').set('Authorization', admin).send({ ...item, disabled: true }).expect(201);
  expect(Question.create).toHaveBeenCalledWith(item);

  Question.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: id, ...item }]) });
  const list = await api.get('/api/questions').query({ category: 'Math' }).set('Authorization', admin).expect(200);
  expect(list.body).toHaveLength(1);
  expect(Question.find).toHaveBeenCalledWith({ category: 'Math' });

  await api.put(`/api/questions/${id}`).set('Authorization', admin).send({ ...item, category: 'Algebra' }).expect(200);
  expect(Question.findByIdAndUpdate).toHaveBeenLastCalledWith(
    id, { $set: { ...item, category: 'Algebra' } }, { new: true, runValidators: true }
  );

  const disabled = await api.patch(`/api/questions/${id}/disable`).set('Authorization', admin).expect(200);
  expect(disabled.body).toMatchObject({ disabled: true, status: 'disabled' });
});

test('rejects invalid question data and handles missing IDs', async () => {
  await api.post('/api/questions').set('Authorization', admin).send({ ...item, correctOption: 2 }).expect(400);
  await api.post('/api/questions').set('Authorization', admin).send({ ...item, options: ['3', {}] }).expect(400);
  await api.patch('/api/questions/invalid/disable').set('Authorization', admin).expect(404);
  expect(Question.create).not.toHaveBeenCalled();
  expect(Question.findByIdAndUpdate).not.toHaveBeenCalled();
  Question.findByIdAndUpdate.mockResolvedValueOnce(null);
  await api.patch(`/api/questions/${id}/disable`).set('Authorization', admin).expect(404);
});
