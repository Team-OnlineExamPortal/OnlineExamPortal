import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, authApi, examApi, adminApi } from './api';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('API client', () => {
  it('sends bearer authentication and JSON bodies', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'jwt' }) });
    await authApi.login('student@example.test', 'password');
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/login$/), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: 'student@example.test', password: 'password' }),
    }));
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    await examApi.available('jwt');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer jwt');
  });

  it('uses the handoff API routes and answer/review request contract', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await examApi.start('exam /1', 'jwt');
    expect(fetch.mock.calls[0][0]).toMatch(/\/exams\/exam%20%2F1\/attempts$/);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    await examApi.saveAnswer('attempt-1', 'question-2', 'option-b', true, 'jwt');
    expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ questionId: 'question-2', optionId: 'option-b', review: true }));
    await examApi.history('jwt');
    expect(fetch.mock.calls[2][0]).toMatch(/\/results\/me$/);
  });

  it('surfaces structured API error messages and codes', async () => {
    fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: 'Attempt already submitted', code: 'ATTEMPT_CLOSED' }) });
    await expect(apiRequest('/attempts/1')).rejects.toMatchObject({
      name: 'ApiError', status: 409, code: 'ATTEMPT_CLOSED', message: 'Attempt already submitted',
    });
  });

  it('converts network failures into a typed error', async () => {
    fetch.mockRejectedValue(new Error('socket unavailable'));
    await expect(apiRequest('/health')).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/health')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('preserves API contracts and encodes identifiers for account, attempt and administrator operations', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const body = { title: 'Example' };
    const cases = [
      [() => authApi.register('Student', 'a@b.co', 'password'), '/auth/register', 'POST'],
      [() => authApi.me('jwt'), '/auth/me'],
      [() => examApi.metadata('id /?', 'jwt'), '/exams/id%20%2F%3F'],
      [() => examApi.getAttempt('id /?', 'jwt'), '/attempts/id%20%2F%3F'],
      [() => examApi.submit('id /?', 'jwt'), '/attempts/id%20%2F%3F/submit', 'POST'],
      [() => adminApi.questions('jwt'), '/questions'],
      [() => adminApi.saveQuestion(null, body, 'jwt'), '/questions', 'POST'],
      [() => adminApi.saveQuestion('id /?', body, 'jwt'), '/questions/id%20%2F%3F', 'PUT'],
      [() => adminApi.disableQuestion('id /?', 'jwt'), '/questions/id%20%2F%3F/disable', 'PATCH'],
      [() => adminApi.exams('jwt'), '/exams'],
      [() => adminApi.createExam(body, 'jwt'), '/exams', 'POST'],
      [() => adminApi.students('jwt'), '/admin/students'],
      [() => adminApi.report('students', 'id /?', 'jwt'), '/reports/students/id%20%2F%3F'],
    ];
    for (const [invoke, route, method] of cases) {
      await invoke();
      const [url, options] = fetch.mock.calls.at(-1);
      expect(url.endsWith(route)).toBe(true);
      expect(options.method || 'GET').toBe(method || 'GET');
      if (route !== '/auth/register') expect(options.headers.Authorization).toBe('Bearer jwt');
    }
  });

  it('handles non-JSON server errors and respects a caller abort signal', async () => {
    fetch.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('HTML proxy error'); } });
    const signal = new AbortController().signal;
    await expect(apiRequest('/health', { signal })).rejects.toMatchObject({ message: 'Request failed (502)', status: 502 });
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });
});
