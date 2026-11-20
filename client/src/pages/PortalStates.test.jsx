import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Dashboard from './Dashboard';
import History from './History';
import Login from './Login';
import Exam from './Exam';
import { ApiError, examApi } from '../api';
import { useAuth } from '../auth';

vi.mock('../auth', () => ({ useAuth: vi.fn() }));
vi.mock('../api', () => ({
  ApiError: class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } },
  examApi: { available: vi.fn(), history: vi.fn(), metadata: vi.fn(), start: vi.fn(), getAttempt: vi.fn(), saveAnswer: vi.fn(), submit: vi.fn() },
}));
const account = { token: 'token', user: { name: 'Student', role: 'Student' }, signOut: vi.fn(), signIn: vi.fn(), signUp: vi.fn() };
function show(page, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}><Routes><Route path="/exam/:examId" element={<Exam />} /><Route path="*" element={page} /></Routes></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); useAuth.mockReturnValue(account); });
afterEach(cleanup);

it('recovers a dashboard load failure after refresh and handles an empty response', async () => {
  examApi.available.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue({});
  show(<Dashboard />);
  const user = userEvent.setup();
  expect(await screen.findByText('Connection lost')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('You’re all caught up')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(account.signOut).toHaveBeenCalledOnce();
});

it.each([new ApiError('Unavailable', 404), new Error('History offline')])('displays history failures without inventing results: %s', async (error) => {
  examApi.history.mockRejectedValue(error);
  show(<History />);
  expect(await screen.findByText('No results to show yet')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

it('handles empty history and incomplete historical rows', async () => {
  examApi.history.mockResolvedValueOnce({});
  const view = show(<History />);
  expect(await screen.findByText('Your journey starts here')).toBeTruthy();
  view.unmount();
  examApi.history.mockResolvedValue([{ id: 'legacy', title: 'Older exam' }]);
  show(<History />);
  expect(await screen.findByText('Older exam')).toBeTruthy();
  expect(screen.getByRole('cell', { name: 'Completed' })).toBeTruthy();
});

it('displays registration errors and lets the user return to sign-in', async () => {
  useAuth.mockReturnValue({ ...account, token: null, user: null });
  account.signUp.mockRejectedValue(new Error('Email already exists'));
  show(<Login />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  await user.type(screen.getByLabelText('Full name'), 'New Student');
  await user.type(screen.getByLabelText('Email address'), 'new@test.co');
  await user.type(screen.getByLabelText('Password'), 'password');
  await user.click(screen.getByRole('button', { name: /Create student account/ }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Email already exists');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows metadata failures before starting an attempt', async () => {
  examApi.metadata.mockRejectedValue(new Error('Exam no longer available'));
  show(null, '/exam/e1');
  expect(await screen.findByText('Exam no longer available')).toBeTruthy();
  expect(examApi.start).not.toHaveBeenCalled();
});

it.each([new ApiError('Unavailable', 404), new Error('Cannot start')])('shows start failures without opening an empty exam: %s', async (error) => {
  examApi.metadata.mockResolvedValue({ id: 'e1', title: 'Exam', endTime: '2030-01-01' });
  examApi.start.mockRejectedValue(error);
  show(null, '/exam/e1?start=1');
  expect(await screen.findByText(error.status === 404 ? /does not have the attempt service/ : 'Cannot start')).toBeTruthy();
});
