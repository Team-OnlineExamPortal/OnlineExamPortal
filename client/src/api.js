const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, { token, ...options } = {}) {
  let response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('Could not reach the server. Check that the API is running.', 0, 'NETWORK_ERROR');
  } finally {
    window.clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.message || `Request failed (${response.status})`, response.status, payload.code);
  }
  return payload;
}

export const authApi = {
  login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name, email, password) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  me: (token) => apiRequest('/auth/me', { token }),
};

export const examApi = {
  available: (token) => apiRequest('/exams/available', { token }),
  metadata: (id, token) => apiRequest(`/exams/${encodeURIComponent(id)}`, { token }),
  // These endpoints are planned with the attempt-processing module and are not
  // implemented by the current server yet.
  start: (examId, token) => apiRequest(`/exams/${encodeURIComponent(examId)}/attempts`, { token, method: 'POST' }),
  getAttempt: (attemptId, token) => apiRequest(`/attempts/${encodeURIComponent(attemptId)}`, { token }),
  saveAnswer: (attemptId, questionId, optionId, review, token) => apiRequest(`/attempts/${encodeURIComponent(attemptId)}/answers`, { token, method: 'PUT', body: JSON.stringify({ questionId, optionId, review }) }),
  submit: (attemptId, token) => apiRequest(`/attempts/${encodeURIComponent(attemptId)}/submit`, { token, method: 'POST' }),
  history: (token) => apiRequest('/results/me', { token }),
};

export { API_BASE_URL };
