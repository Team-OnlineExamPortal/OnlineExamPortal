'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const base = (process.env.OEP_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const target = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('Security validation is restricted to the isolated loopback test deployment.');
}
const results = [];
let requests = 0;
const seed = 20261120;
let state = seed;
function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; }

async function call(method, route, { body, raw, token, expected = 200 } = {}) {
  const response = await fetch(base + '/api' + route, {
    method, signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(raw !== undefined ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  requests += 1;
  const data = await response.json();
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), method + ' ' + route + ' returned ' + response.status);
  const noSniff = (response.headers.get('x-content-type-options') || '').split(',').map((value) => value.trim().toLowerCase());
  assert.ok(noSniff.length > 0 && noSniff.every((value) => value === 'nosniff'), 'Missing or invalid no-sniff protection');
  if (response.status >= 400) {
    assert.equal(typeof data.code, 'string');
    assert.equal(typeof data.requestId, 'string');
    assert.ok(!('stack' in data));
    assert.doesNotMatch(JSON.stringify(data), /passwordHash|MongoServerError|gradingSnapshot/);
  }
  return data;
}
async function check(id, description, run) {
  await run();
  results.push({ id, description, actualResult: 'Expected responses and invariants observed', status: 'PASS' });
}

async function main() {
  const suffix = crypto.randomBytes(8).toString('hex');
  const password = crypto.randomBytes(20).toString('hex');
  const students = [];
  for (let i = 0; i < 2; i += 1) {
    const email = `security-${suffix}-${i}@oep.test`;
    const registered = await call('POST', '/auth/register', {
      body: { name: 'Security Fixture', email, password, role: 'Administrator' }, expected: 201,
    });
    const login = await call('POST', '/auth/login', { body: { email, password } });
    assert.equal(login.role, 'Student');
    students.push({ id: registered.userId, token: login.token });
  }
  results.push({ id: 'SEC-P01', description: 'Public registration cannot grant Administrator', actualResult: 'Both role-injection fixtures remained Students', status: 'PASS' });
  const admin = await call('POST', '/auth/login', { body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  assert.equal(admin.role, 'Administrator');
  const category = 'Security-' + suffix;
  const question = await call('POST', '/questions', { token: admin.token, expected: 201,
    body: { text: '<img src=x onerror=alert(1)>', category, options: ['Safe choice', 'Other'], correctOption: 0 },
  });
  const exam = await call('POST', '/exams', { token: admin.token, expected: 201, body: {
    title: 'Security validation fixture', category, questionCount: 1, durationMinutes: 5,
    startTime: new Date(Date.now() - 60000).toISOString(), endTime: new Date(Date.now() + 600000).toISOString(),
  } });
  const owner = students[0].token;
  const other = students[1].token;
  const attempt = await call('POST', '/exams/' + exam.id + '/attempts', { token: owner, expected: 201 });
  const id = attempt.id;

  await check('SEC-P02', 'Unauthenticated and tampered-token requests rejected', async () => {
    await call('GET', '/admin/students', { expected: 401 });
    const parts = owner.split('.'); parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
    await call('GET', '/auth/me', { token: parts.join('.'), expected: 401 });
  });
  await check('SEC-P03', 'Student role cannot list protected data or mutate questions/exams', async () => {
    for (const [method, route, body] of [
      ['GET', '/admin/students'], ['GET', '/questions'], ['GET', '/exams'],
      ['POST', '/questions', {}], ['PUT', '/questions/' + question._id, {}],
      ['PATCH', '/questions/' + question._id + '/disable'], ['POST', '/exams', {}],
      ['GET', '/reports/exams/' + exam.id], ['GET', '/reports/students/' + students[0].id],
    ]) await call(method, route, { body, token: owner, expected: 403 });
  });
  await check('SEC-P04', 'Another student cannot read, write or submit the owner attempt', async () => {
    await call('GET', '/attempts/' + id, { token: other, expected: 403 });
    await call('PUT', '/attempts/' + id + '/answers', { token: other, body: { questionId: question._id, optionId: '1' }, expected: 403 });
    await call('POST', '/attempts/' + id + '/submit', { token: other, expected: 403 });
    const unchanged = await call('GET', '/attempts/' + id, { token: owner });
    assert.deepEqual(unchanged.answers, {});
  });
  await check('SEC-P05', 'Question text stays JSON data and answer keys remain private', async () => {
    assert.equal(attempt.questions[0].text, '<img src=x onerror=alert(1)>');
    assert.doesNotMatch(JSON.stringify(attempt), /correctOption|gradingSnapshot|passwordHash/);
    const metadata = await call('GET', '/exams/' + exam.id, { token: other });
    assert.doesNotMatch(JSON.stringify(metadata), /onerror|correctOption|gradingSnapshot/);
  });
  await check('SEC-P06', 'Malformed JSON and oversized bodies have bounded safe errors', async () => {
    for (const raw of ['{', '[', '{"email":', '{"password":"unterminated}', 'null']) {
      await call('POST', '/auth/login', { raw, expected: 400 });
    }
    await call('POST', '/auth/login', { body: { input: 'x'.repeat(110000) }, expected: 413 });
  });

  const keys = ['$ne', '$where', 'email.path', '__proto__', 'constructor', 'prototype'];
  const mutations = 120;
  await check('SEC-F01', 'Seeded nested operator and prototype-key JSON/query fuzz corpus', async () => {
    for (let i = 0; i < mutations; i += 1) {
      const key = keys[random() % keys.length];
      let nested = { [key]: random() % 2 ? null : { payload: 'unchanged' } };
      for (let depth = random() % 6; depth > 0; depth -= 1) nested = depth % 2 ? [nested] : { nested };
      await call('POST', '/auth/login', { body: { ignored: nested }, expected: 400 });
      const query = await call('GET', '/health?' + encodeURIComponent(key) + '=value', { expected: key === '__proto__' ? [200, 400] : 400 });
      // Some Express query parsers discard __proto__ before middleware sees it.
      if (!query.code) assert.deepEqual(query, { status: 'ok' });
    }
  });
  await check('SEC-F02', 'Wrong-type authentication fields rejected before database access', async () => {
    for (const value of [null, true, false, 0, -1, [], {}, ['admin'], { value: 'admin' }]) {
      await call('POST', '/auth/login', { body: { email: value, password: 'irrelevant' }, expected: 400 });
      await call('POST', '/auth/register', { body: { name: 'Fixture', email: 'invalid@oep.test', password: value }, expected: 400 });
    }
  });
  await check('SEC-F03', 'Malformed resource identifiers return 404 without server exceptions', async () => {
    for (const value of ['invalid', '123', 'x'.repeat(64), '$ne', 'null']) {
      await call('GET', '/attempts/' + encodeURIComponent(value), { token: owner, expected: 404 });
    }
  });
  await check('SEC-P07', 'Cross-owner results denied and final results resist later writes', async () => {
    await call('PUT', '/attempts/' + id + '/answers', { token: owner, body: { questionId: question._id, optionId: '0' } });
    const result = await call('POST', '/attempts/' + id + '/submit', { token: owner });
    await call('GET', '/results/' + result.resultId, { token: other, expected: 404 });
    await call('PUT', '/attempts/' + id + '/answers', { token: owner, body: { questionId: question._id, optionId: '1' }, expected: 409 });
    const repeat = await call('POST', '/attempts/' + id + '/submit', { token: owner });
    assert.equal(repeat.resultId, result.resultId); assert.equal(repeat.score, 1);
  });
}

main().then(() => write(true)).catch((error) => {
  results.push({ id: 'FAILURE', description: error.message, status: 'FAIL' });
  write(false); process.exitCode = 1;
});
function write(passed) {
  const report = { timestamp: new Date().toISOString(), target: base, seed, requests, passed, checks: results,
    scope: 'Bounded regression and seeded API fuzzing on an isolated test deployment; not an independent penetration-test certification.' };
  const reports = path.resolve(__dirname, '../.local/reports');
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'security-validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
