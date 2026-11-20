'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { errorHandler } = require('../src/errors');

test('malformed and oversized JSON return safe structured client errors', async () => {
  const api = request(createApp());
  const malformed = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{invalid').expect(400);
  expect(malformed.body).toEqual({ code: 'INVALID_JSON', message: 'Malformed JSON body', requestId: expect.any(String) });
  const oversized = await api.post('/api/auth/login').send({ input: 'x'.repeat(110000) }).expect(413);
  expect(oversized.body.code).toBe('PAYLOAD_TOO_LARGE');
  const unknown = await api.get('/api/unknown').expect(404);
  expect(unknown.body.code).toBe('NOT_FOUND');
});

test('unexpected server failures hide internal details and already-sent responses reach the next handler', () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(new Error('private database detail'), { id: 'safe-id' }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: 'safe-id' });
    const next = jest.fn(); const failure = new Error('already sent');
    errorHandler(failure, {}, { headersSent: true }, next);
    expect(next).toHaveBeenCalledWith(failure);
  } finally { errorLog.mockRestore(); }
});
