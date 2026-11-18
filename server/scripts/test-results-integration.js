'use strict';
process.env.JWT_SECRET = 'integration-test-secret-with-at-least-32-characters';
process.env.BCRYPT_ROUNDS = '4';
const { describe, test, before: beforeAll, after: afterAll, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { User, Question, Exam, Attempt } = require('../src/models');
const { finalizeAttempt } = require('../src/submissions');
const binary = process.env.OEP_TEST_MONGOD || 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe';
const integration = fs.existsSync(binary) ? describe : describe.skip;

integration('results against isolated real MongoDB', () => {
  let mongo, student, other, exam, token, adminToken;
  const api = request(createApp());
  const sign = (user) => jwt.sign({}, process.env.JWT_SECRET, { subject: String(user._id), expiresIn: '1h' });
  beforeAll(async () => {
    const port = await new Promise((resolve) => {
      const socket = net.createServer();
      socket.listen(0, '127.0.0.1', () => { const value = socket.address().port; socket.close(() => resolve(value)); });
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oep-results-'));
    mongo = spawn(binary, ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1'], { windowsHide: true, stdio: 'ignore' });
    mongo.on('error', () => {});
    await mongoose.connect(`mongodb://127.0.0.1:${port}/integration`, { serverSelectionTimeoutMS: 20000 });
    await Promise.all([User.init(), Attempt.init()]);
    [student, other] = await User.create([
      { name: 'Owner', email: 'owner@test.co', passwordHash: 'unused', role: 'Student' },
      { name: 'Other', email: 'other@test.co', passwordHash: 'unused', role: 'Student' },
    ]);
    const admin = await User.create({ name: 'Admin', email: 'admin@test.co', passwordHash: 'unused', role: 'Administrator' });
    token = sign(student); adminToken = sign(admin);
    exam = await Exam.create({ title: 'Results exam', category: 'Test', questionCount: 3, durationMinutes: 30, startTime: new Date(Date.now() - 10000), endTime: new Date(Date.now() + 3600000), negativeMarking: true });
    await Question.create([0, 1, 2].map((i) => ({ text: `Q${i}`, options: ['no', 'yes'], correctOption: 1, category: 'Test' })));
  });
  afterAll(async () => { await mongoose.disconnect(); if (mongo) { mongo.kill(); await new Promise((resolve) => mongo.once('exit', resolve)); } });
  beforeEach(async () => { await Attempt.deleteMany({}); });

  async function start() {
    const response = await api.post(`/api/exams/${exam.id}/attempts`).set('Authorization', `Bearer ${token}`).expect(201);
    assert.doesNotMatch(JSON.stringify(response.body), /correctOption|gradingSnapshot/);
    return response.body;
  }

  test('persists one result under concurrent submissions and prevents subsequent saves', async () => {
    const attempt = await start();
    await api.put(`/api/attempts/${attempt.id}/answers`).set('Authorization', `Bearer ${token}`)
      .send({ questionId: attempt.questions[0].id, optionId: '1' }).expect(200);
    const responses = await Promise.all(Array.from({ length: 8 }, () =>
      api.post(`/api/attempts/${attempt.id}/submit`).set('Authorization', `Bearer ${token}`)));
    assert.deepEqual(responses.map((r) => r.status), Array(8).fill(200));
    assert.equal(new Set(responses.map((r) => r.body.resultId)).size, 1);
    assert.equal(responses[0].body.score, 1); assert.equal(responses[0].body.unansweredCount, 2);
    assert.equal(await Attempt.countDocuments({ result: { $exists: true } }), 1);
    await api.put(`/api/attempts/${attempt.id}/answers`).set('Authorization', `Bearer ${token}`)
      .send({ questionId: attempt.questions[0].id, optionId: '0' }).expect(409);
    const history = await api.get('/api/results/me').set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(history.body.length, 1);
    await api.get(`/api/results/${attempt.id}`).set('Authorization', `Bearer ${sign(other)}`).expect(404);
    const report = await api.get(`/api/reports/exams/${exam.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(report.body.count, 1); assert.equal(report.body.totalScore, 1); assert.equal(report.body.totalMaximumScore, 3);
    const studentReport = await api.get(`/api/reports/students/${student.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.deepEqual(studentReport.body.results, history.body);
    await api.get(`/api/reports/exams/${exam.id}`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  test('snapshot grading survives bank changes and disabled questions', async () => {
    const attempt = await start();
    await Question.updateMany({}, { $set: { correctOption: 0, disabled: true } });
    await Attempt.updateOne({ _id: attempt.id }, { $set: { answers: { [attempt.questions[0].id]: '1' } } });
    assert.equal((await finalizeAttempt(attempt.id)).score, 1);
    await Question.updateMany({}, { $set: { correctOption: 1, disabled: false } });
  });

  test('history finalizes overdue attempts, and unrelated students cannot submit them', async () => {
    const attempt = await start();
    await api.post(`/api/attempts/${attempt.id}/submit`).set('Authorization', `Bearer ${sign(other)}`).expect(404);
    await Attempt.updateOne({ _id: attempt.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const history = await api.get('/api/results/me').set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(history.body[0].score, 0); assert.equal(history.body[0].unansweredCount, 3);
    assert.equal((await Attempt.findById(attempt.id)).status, 'submitted');
  });

  test('failed grading leaves the attempt retryable without a partial result', async () => {
    const attempt = await start();
    await Attempt.updateOne({ _id: attempt.id }, { $unset: { gradingSnapshot: 1 }, $set: { questions: [] } });
    await assert.rejects(finalizeAttempt(attempt.id), { code: 'GRADING_UNAVAILABLE' });
    assert.equal((await Attempt.findById(attempt.id)).result, undefined);
  });

  test('concurrent save and submit preserve the winning committed state', async () => {
    const attempt = await start();
    const [save, submit] = await Promise.all([
      api.put(`/api/attempts/${attempt.id}/answers`).set('Authorization', `Bearer ${token}`)
        .send({ questionId: attempt.questions[0].id, optionId: '1' }),
      api.post(`/api/attempts/${attempt.id}/submit`).set('Authorization', `Bearer ${token}`),
    ]);
    assert.equal(submit.status, 200);
    assert.ok([200, 409].includes(save.status));
    const stored = await Attempt.findById(attempt.id);
    assert.equal(stored.result.score, stored.answers[attempt.questions[0].id] === '1' ? 1 : 0);
  });

  test('local attempt read load probe', { skip: !process.env.OEP_RUN_LOCAL_LOAD }, async () => {
    const attempt = await start();
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const child = spawn(process.execPath, [path.join(__dirname, 'load-test-attempt.js')], {
        windowsHide: true,
        env: { ...process.env, OEP_ATTEMPT_URL: `http://127.0.0.1:${server.address().port}/api/attempts/${attempt.id}`,
          OEP_STUDENT_TOKEN: token, OEP_LOAD_DURATION_SECONDS: '10', OEP_LOAD_CONCURRENCY: '20' },
      });
      let output = '';
      child.stdout.on('data', (data) => { output += data; });
      child.stderr.on('data', (data) => process.stderr.write(data));
      const code = await new Promise((resolve) => child.once('exit', resolve));
      process.stdout.write(output);
      assert.equal(code, 0);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });
});

