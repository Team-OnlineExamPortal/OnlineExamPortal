import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { authApi, examApi } from './api';

vi.mock('./api', () => ({
  ApiError: class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } },
  authApi: { login: vi.fn(), register: vi.fn(), me: vi.fn() },
  examApi: {
    available: vi.fn(), metadata: vi.fn(), start: vi.fn(), getAttempt: vi.fn(),
    saveAnswer: vi.fn(), submit: vi.fn(), history: vi.fn(),
  },
}));

const student = { userId: 'student-1', name: 'Satyam Goyal', email: 'satyam@example.test', role: 'Student' };
const exam = { id: 'exam-1', examId: 'exam-1', title: 'Algorithms Midterm', category: 'Algorithms', durationMinutes: 30, questionCount: 2, startTime: '2026-11-02T08:00:00.000Z', endTime: '2026-11-02T12:00:00.000Z' };
const attempt = {
  attemptId: 'attempt-1', deadline: new Date(Date.now() + 1800000).toISOString(),
  questions: [
    { questionId: 'q-1', text: 'What is the first answer?', options: ['Correct', 'Wrong'] },
    { questionId: 'q-2', text: 'What is the second answer?', options: ['Choice A', 'Choice B'] },
  ],
};

function renderApp() {
  return render(<BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>);
}

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  authApi.login.mockResolvedValue({ token: 'jwt-student', role: 'Student' });
  authApi.me.mockResolvedValue(student);
  examApi.available.mockResolvedValue([exam]);
  examApi.metadata.mockResolvedValue(exam);
  examApi.start.mockResolvedValue(attempt);
  examApi.saveAnswer.mockResolvedValue({ savedAt: new Date().toISOString() });
  examApi.submit.mockResolvedValue({ resultId: 'result-1', score: 1 });
  examApi.history.mockResolvedValue([{ resultId: 'result-1', examTitle: 'Algorithms Midterm', score: 1, status: 'Completed', completedAt: '2026-11-02T09:00:00.000Z' }]);
});

afterEach(() => { cleanup(); });

describe('student portal journey (NFR-003)', () => {
  it('signs in, starts an available exam in one dashboard click, navigates, saves answers and review state, submits, and views history', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: confirm });
    renderApp();

    await user.type(await screen.findByLabelText('Email address'), 'satyam@example.test');
    await user.type(screen.getByLabelText('Password'), 'safe-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('heading', { name: 'Available exams' })).toBeTruthy();

    // The single Start exam action on the dashboard immediately starts the attempt.
    await user.click(await screen.findByRole('link', { name: /start exam/i }));
    expect(await screen.findByRole('heading', { name: 'What is the first answer?' })).toBeTruthy();
    await waitFor(() => expect(examApi.start).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /correct/i }));
    await waitFor(() => expect(examApi.saveAnswer).toHaveBeenCalledWith('attempt-1', 'q-1', '0', false, 'jwt-student'));
    await user.click(screen.getByRole('button', { name: '☆ Mark for review' }));
    await waitFor(() => expect(examApi.saveAnswer).toHaveBeenLastCalledWith('attempt-1', 'q-1', '0', true, 'jwt-student'));
    await user.click(screen.getByRole('button', { name: /next question/i }));
    expect(await screen.findByRole('heading', { name: 'What is the second answer?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(screen.getByRole('button', { name: '★ Marked for review' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /finish and submit/i }));
    await waitFor(() => expect(examApi.submit).toHaveBeenCalledWith('attempt-1', 'jwt-student'));
    expect(confirm).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('link', { name: /view history/i }));
    expect(await screen.findByText('Algorithms Midterm')).toBeTruthy();
    expect(examApi.history).toHaveBeenCalledWith('jwt-student');
  });

  it('keeps attempt start honest when the backend route is unavailable', async () => {
    const user = userEvent.setup();
    examApi.start.mockRejectedValue(new (await import('./api')).ApiError('Resource not found', 404, 'NOT_FOUND'));
    renderApp();
    await user.type(await screen.findByLabelText('Email address'), 'satyam@example.test');
    await user.type(screen.getByLabelText('Password'), 'safe-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.click(await screen.findByRole('link', { name: /start exam/i }));
    expect(await screen.findByText(/Your exam has not started/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'What is the first answer?' })).toBeNull();
  });

  it('does not submit when a student cancels the manual confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: confirm });
    renderApp();
    await user.type(await screen.findByLabelText('Email address'), 'satyam@example.test');
    await user.type(screen.getByLabelText('Password'), 'safe-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.click(await screen.findByRole('link', { name: /start exam/i }));
    await screen.findByRole('heading', { name: 'What is the first answer?' });
    await user.click(screen.getByRole('button', { name: /finish and submit/i }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(examApi.submit).not.toHaveBeenCalled();
  });

  it('automatically submits a server-expired attempt without showing a manual confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => { throw new Error('Auto submit must not prompt'); });
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: confirm });
    examApi.start.mockResolvedValue({ ...attempt, deadline: new Date(Date.now() - 1000).toISOString() });
    renderApp();
    await user.type(await screen.findByLabelText('Email address'), 'satyam@example.test');
    await user.type(screen.getByLabelText('Password'), 'safe-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.click(await screen.findByRole('link', { name: /start exam/i }));
    await waitFor(() => expect(examApi.submit).toHaveBeenCalledWith('attempt-1', 'jwt-student'));
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Exam submitted' })).toBeTruthy();
  });

  it('persists a failed answer locally and retries it after reconnecting', async () => {
    const user = userEvent.setup();
    examApi.saveAnswer.mockRejectedValueOnce(new Error('offline'));
    renderApp();
    await user.type(await screen.findByLabelText('Email address'), 'satyam@example.test');
    await user.type(screen.getByLabelText('Password'), 'safe-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.click(await screen.findByRole('link', { name: /start exam/i }));
    await user.click(await screen.findByRole('button', { name: /correct/i }));
    await waitFor(() => expect(localStorage.getItem('oep-attempt-pending-attempt-1')).toContain('q-1'));
    await waitFor(() => expect(screen.getByText(/will retry/i)).toBeTruthy());
    examApi.saveAnswer.mockResolvedValue({ savedAt: new Date().toISOString() });
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(localStorage.getItem('oep-attempt-pending-attempt-1')).toBeNull());
    expect(examApi.saveAnswer).toHaveBeenCalledTimes(2);
  });

  it('restores an active attempt after a page reload instead of creating a second attempt', async () => {
    sessionStorage.setItem('oep_token', 'jwt-student');
    sessionStorage.setItem('oep-active-attempt-exam-1', 'attempt-1');
    window.history.replaceState({}, '', '/exam/exam-1?start=1');
    examApi.getAttempt.mockResolvedValue(attempt);
    renderApp();
    expect(await screen.findByRole('heading', { name: 'What is the first answer?' })).toBeTruthy();
    expect(examApi.getAttempt).toHaveBeenCalledWith('attempt-1', 'jwt-student');
    expect(examApi.start).not.toHaveBeenCalled();
  });
});
