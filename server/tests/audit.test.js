'use strict';
jest.mock('fs', () => ({ mkdirSync: jest.fn(), appendFile: jest.fn() }));
const fs = require('fs');
const audit = require('../src/audit');
const originalMode = process.env.NODE_ENV;
const originalFile = process.env.AUDIT_LOG_FILE;

afterEach(() => {
  process.env.NODE_ENV = originalMode;
  if (originalFile === undefined) delete process.env.AUDIT_LOG_FILE;
  else process.env.AUDIT_LOG_FILE = originalFile;
  jest.restoreAllMocks();
});

test('whitelists audit fields, drops query strings and excludes secrets', () => {
  const metadata = audit.fromRequest({ url: '/api/test?token=secret' });
  expect(metadata.path).toBe('/api/test');
  expect(audit.fromRequest({ originalUrl: '/api/auth/me?q=private', url: '/ignored' }).path).toBe('/api/auth/me');
  expect(audit.fromRequest({}).path).toBe('');
  const entry = audit.buildEntry({ type: 'FORBIDDEN', userId: 7, role: null, email: undefined, password: 'secret', token: 'private' });
  expect(entry).toEqual({ timestamp: expect.any(String), type: 'FORBIDDEN', userId: '7' });
});

test('persists redacted events and reports asynchronous write failures', () => {
  process.env.NODE_ENV = 'production';
  process.env.AUDIT_LOG_FILE = '/isolated-test/audit.log';
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  fs.appendFile.mockImplementationOnce((file, line, callback) => callback(null))
    .mockImplementationOnce((file, line, callback) => callback(new Error('disk unavailable')));
  audit.record({ type: 'FORBIDDEN', reason: 'OWNER', path: '/api/test', requestId: 'req-1', password: 'never-written' });
  audit.record({ type: 'UNAUTHENTICATED' });
  expect(fs.mkdirSync).toHaveBeenCalledWith('/isolated-test', { recursive: true });
  const [file, line] = fs.appendFile.mock.calls[0];
  expect(file).toBe('/isolated-test/audit.log');
  expect(line.endsWith('\n')).toBe(true);
  expect(JSON.parse(line)).not.toHaveProperty('password');
  expect(warn).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('failed to write'), 'disk unavailable');
});

test('handles synchronous filesystem failure without crashing the request', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.AUDIT_LOG_FILE;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  fs.appendFile.mockImplementationOnce(() => { throw new Error('filesystem unavailable'); });
  expect(audit.record({ type: 'LOGIN_FAILED' })).toMatchObject({ type: 'LOGIN_FAILED' });
  expect(error).toHaveBeenCalledWith(expect.stringContaining('failed to write'), 'filesystem unavailable');
});
