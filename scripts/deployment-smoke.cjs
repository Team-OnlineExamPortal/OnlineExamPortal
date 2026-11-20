'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = (process.env.OEP_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const reports = path.resolve(__dirname, '../.local/reports');
fs.mkdirSync(reports, { recursive: true });

async function call(method, route, body, token, status = 200) {
  const response = await fetch(base + '/api' + route, {
    method, signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, status, method + ' ' + route + ': ' + JSON.stringify(data));
  return data;
}

async function main() {
  const checks = [];
  await call('GET', '/ready'); checks.push('database readiness');
  for (const route of ['/', '/login', '/admin', '/history']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /id="root"/);
  }
  checks.push('frontend and SPA routes');
  const admin = await call('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  const suffix = crypto.randomBytes(5).toString('hex');
  const email = 'ci-' + suffix + '@oep.test';
  const password = crypto.randomBytes(20).toString('hex');
  await call('POST', '/auth/register', { name: 'Validation Student', email, password }, undefined, 201);
  await call('POST', '/auth/register', { name: 'Duplicate', email, password }, undefined, 409);
  const student = await call('POST', '/auth/login', { email, password });
  await call('GET', '/admin/students', undefined, student.token, 403);
  await call('GET', '/admin/students', undefined, admin.token);
  checks.push('authentication and role isolation');
  const category = 'CI-' + suffix;
  const question = await call('POST', '/questions', { text: 'Which number is even?', category, options: ['3', '4'], correctOption: 1 }, admin.token, 201);
  await call('PUT', '/questions/' + question._id, { text: 'Select the even number', category, options: ['3', '4'], correctOption: 1 }, admin.token);
  const disabled = await call('POST', '/questions', { text: 'Disabled example', category, options: ['3', '4'], correctOption: 1 }, admin.token, 201);
  await call('PATCH', '/questions/' + disabled._id + '/disable', undefined, admin.token);
  checks.push('question lifecycle');
  const exam = await call('POST', '/exams', {
    title: 'Deployment validation', category, durationMinutes: 10, questionCount: 1,
    startTime: new Date(Date.now() - 60000).toISOString(), endTime: new Date(Date.now() + 900000).toISOString(),
  }, admin.token, 201);
  const available = await call('GET', '/exams/available', undefined, student.token);
  assert.ok(available.some((item) => item.id === exam.id));
  await call('GET', '/exams', undefined, admin.token);
  const attempt = await call('POST', '/exams/' + exam.id + '/attempts', undefined, student.token, 201);
  assert.equal(attempt.questions[0].id, question._id);
  assert.doesNotMatch(JSON.stringify(attempt), /correctOption|gradingSnapshot/);
  await call('POST', '/exams/' + exam.id + '/attempts', undefined, student.token, 409);
  await call('PUT', '/attempts/' + attempt.id + '/answers', { questionId: question._id, optionId: '1', review: true }, student.token);
  const restored = await call('GET', '/attempts/' + attempt.id, undefined, student.token);
  assert.equal(restored.answers[question._id], '1');
  assert.equal(restored.reviews[question._id], true);
  checks.push('scheduled attempts, safe questions, answer save and reconnect');
  const result = await call('POST', '/attempts/' + attempt.id + '/submit', undefined, student.token);
  assert.equal(result.score, 1);
  const repeat = await call('POST', '/attempts/' + attempt.id + '/submit', undefined, student.token);
  assert.equal(repeat.resultId, result.resultId);
  await call('PUT', '/attempts/' + attempt.id + '/answers', { questionId: question._id, optionId: '0' }, student.token, 409);
  const history = await call('GET', '/results/me', undefined, student.token);
  assert.equal(history[0].score, 1);
  const report = await call('GET', '/reports/exams/' + exam.id, undefined, admin.token);
  assert.equal(report.totalScore, 1);
  checks.push('immutable submission, scoring, history and reports');
  const loadAttempt = await call('POST', '/exams/' + exam.id + '/attempts', undefined, student.token, 201);
  fs.writeFileSync(path.resolve(__dirname, '../.local/smoke-session.json'), JSON.stringify({
    attemptUrl: base + '/api/attempts/' + loadAttempt.id, token: student.token, base,
  }), { mode: 0o600 });
  const evidence = { timestamp: new Date().toISOString(), target: base, checks, passed: true };
  fs.writeFileSync(path.join(reports, 'deployment-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
