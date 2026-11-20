import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './auth';
import { authApi } from './api';

vi.mock('./api', () => ({ authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn() } }));
function Account() {
  const auth = useAuth();
  return <><p>{auth.loading ? 'Restoring' : auth.user?.name || 'Signed out'}</p>
    <button onClick={() => auth.signUp('New Student', 'new@test.co', 'password')}>Register</button>
    <button onClick={auth.signOut}>Logout</button></>;
}
beforeEach(() => { sessionStorage.clear(); });
afterEach(cleanup);

it('registers as a student, restores the profile and clears the session on logout', async () => {
  authApi.register.mockResolvedValue({ userId: 'student' });
  authApi.login.mockResolvedValue({ token: 'new-token' });
  authApi.me.mockResolvedValue({ name: 'New Student', role: 'Student' });
  const user = userEvent.setup();
  render(<AuthProvider><Account /></AuthProvider>);
  await user.click(screen.getByRole('button', { name: 'Register' }));
  expect(await screen.findByText('New Student')).toBeTruthy();
  expect(authApi.register).toHaveBeenCalledWith('New Student', 'new@test.co', 'password');
  expect(sessionStorage.getItem('oep_token')).toBe('new-token');
  await user.click(screen.getByRole('button', { name: 'Logout' }));
  expect(screen.getByText('Signed out')).toBeTruthy();
  expect(sessionStorage.getItem('oep_token')).toBeNull();
});

it('removes an expired stored token and leaves the user signed out', async () => {
  sessionStorage.setItem('oep_token', 'expired');
  authApi.me.mockRejectedValue(new Error('Token expired'));
  render(<AuthProvider><Account /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('Signed out')).toBeTruthy());
  expect(sessionStorage.getItem('oep_token')).toBeNull();
});
