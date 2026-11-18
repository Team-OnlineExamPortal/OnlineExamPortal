'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
test('readiness reports unavailable while MongoDB is disconnected', async () => {
  await request(createApp()).get('/api/ready').expect(503, { status: 'unavailable' });
});
