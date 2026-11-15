'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { validateExamInput } = require('../src/exams');

const api = request(createApp());

test('rejects database operator keys in nested JSON and query parameters', async () => {
  const bodyResult = await api.post('/api/auth/login')
    .send({ ignored: [{ $invalid: 1 }] })
    .expect(400);
  expect(bodyResult.body.code).toBe('VALIDATION_ERROR');

  const queryResult = await api.get('/api/health')
    .query({ 'category[$invalid]': 'value' })
    .expect(400);
  expect(queryResult.body.code).toBe('VALIDATION_ERROR');
});

test('allows an ordinary query and returns JSON with no-sniff protection', async () => {
  await api.get('/api/health').query({ category: 'C++' })
    .expect('Content-Type', /application\/json/)
    .expect('X-Content-Type-Options', 'nosniff')
    .expect(200, { status: 'ok' });
});

test('rejects a string where an exam marking flag must be boolean', () => {
  const exam = {
    title: 'Practice', category: 'Math', durationMinutes: 30, questionCount: 1,
    startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-01T11:00:00Z',
  };
  expect(() => validateExamInput({ ...exam, negativeMarking: 'false' }))
    .toThrow('negativeMarking must be a boolean');
  expect(validateExamInput(exam).negativeMarking).toBe(false);
});
