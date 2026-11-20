import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Admin from './Admin';
import { adminApi } from '../api';

vi.mock('../auth', () => ({ useAuth: () => ({ token: 'admin-token', user: { name: 'Admin', role: 'Administrator' }, signOut: vi.fn() }) }));
vi.mock('../api', () => ({
  adminApi: { questions: vi.fn(), exams: vi.fn(), students: vi.fn(), saveQuestion: vi.fn(), disableQuestion: vi.fn(), createExam: vi.fn(), report: vi.fn() },
}));
const question = { _id: 'q1', text: 'Which is even?', category: 'Math', options: ['3', '4'], correctOption: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  adminApi.questions.mockResolvedValue([question]);
  adminApi.exams.mockResolvedValue([{ _id: 'e1', title: 'Math exam', category: 'Math', durationMinutes: 30, questionCount: 1, startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-01T11:00:00Z' }]);
  adminApi.students.mockResolvedValue([{ _id: 's1', name: 'Student One', email: 's1@test.co' }]);
  adminApi.saveQuestion.mockResolvedValue(question);
  adminApi.disableQuestion.mockResolvedValue({ ...question, disabled: true });
  adminApi.createExam.mockResolvedValue({ id: 'e2' });
  adminApi.report.mockResolvedValue({ count: 1, averageScore: 1, results: [{ resultId: 'r1', examTitle: 'Math exam', studentId: 's1', score: 1, maximumScore: 1, correctCount: 1, incorrectCount: 0, unansweredCount: 0, completedAt: '2030-01-01T10:10:00Z' }] });
});
afterEach(cleanup);

it('edits and disables a question, schedules an exam, and reads an administrator report', async () => {
  const user = userEvent.setup();
  render(<BrowserRouter><Admin /></BrowserRouter>);
  await user.click(await screen.findByRole('button', { name: 'Edit Which is even?' }));
  await user.clear(screen.getByLabelText('Question text'));
  await user.type(screen.getByLabelText('Question text'), 'Updated question');
  await user.click(screen.getByRole('button', { name: 'Save question' }));
  expect(await screen.findByText('Question saved.')).toBeTruthy();
  expect(adminApi.saveQuestion).toHaveBeenCalledWith('q1', { text: 'Updated question', category: 'Math', options: ['3', '4'], correctOption: 1 }, 'admin-token');
  await user.click(screen.getByRole('button', { name: 'Disable Which is even?' }));
  expect(await screen.findByText('Question disabled for new attempts.')).toBeTruthy();
  await user.click(screen.getByRole('tab', { name: 'Exam scheduling' }));
  await user.type(screen.getByLabelText('Exam title'), 'New exam');
  await user.type(screen.getByLabelText('Exam category'), 'Math');
  fireEvent.change(screen.getByLabelText('Opens at'), { target: { value: '2030-01-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Closes at'), { target: { value: '2030-01-01T11:00' } });
  await user.click(screen.getByRole('button', { name: 'Create exam' }));
  expect(await screen.findByText('Exam scheduled.')).toBeTruthy();
  expect(adminApi.createExam.mock.calls[0][0]).toMatchObject({ title: 'New exam', category: 'Math', negativeMarking: false });
  await user.click(screen.getByRole('tab', { name: 'Reports' }));
  await user.selectOptions(screen.getByLabelText('Select exam'), 'e1');
  await user.click(screen.getByRole('button', { name: 'Load report' }));
  expect(await screen.findByText('Student One')).toBeTruthy();
  expect(screen.getByText('1 / 1')).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Group by'), 'students');
  await user.selectOptions(screen.getByLabelText('Select student'), 's1');
  await user.click(screen.getByRole('button', { name: 'Load report' }));
  expect(adminApi.report).toHaveBeenLastCalledWith('students', 's1', 'admin-token');
});

it('shows API validation failures and keeps the entered question', async () => {
  adminApi.saveQuestion.mockRejectedValue(new Error('Category is required'));
  const user = userEvent.setup();
  render(<BrowserRouter><Admin /></BrowserRouter>);
  await user.click(await screen.findByRole('button', { name: 'Edit Which is even?' }));
  await user.click(screen.getByRole('button', { name: 'Save question' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Category is required');
  expect(screen.getByLabelText('Question text').value).toBe('Which is even?');
});
