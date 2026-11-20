'use strict';
jest.mock('../src/models', () => ({ Attempt: { find: jest.fn() } }));
jest.mock('../src/submissions', () => ({ finalizeAttempt: jest.fn() }));
const { Attempt } = require('../src/models');
const { finalizeAttempt } = require('../src/submissions');
const { finalizeOverdueAttempts, startDeadlineWorker } = require('../src/deadlines');

function overdue(rows) {
  Attempt.find.mockReturnValue({ select: () => ({ lean: () => ({
    cursor: async function* () { yield* rows; },
  }) }) });
}

beforeEach(() => { jest.clearAllMocks(); finalizeAttempt.mockResolvedValue({}); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('continues the sweep after one failed finalization and only selects overdue active attempts', async () => {
  overdue([{ _id: 'retry' }, { _id: 'next' }]);
  finalizeAttempt.mockRejectedValueOnce(Object.assign(new Error('private details'), { code: 'RETRY' }));
  const onError = jest.fn();
  await finalizeOverdueAttempts(onError);
  expect(Attempt.find).toHaveBeenCalledWith({ status: 'active', expiresAt: { $lte: expect.any(Date) }, result: { $exists: false } });
  expect(finalizeAttempt.mock.calls).toEqual([['retry'], ['next']]);
  expect(onError).toHaveBeenCalledWith(expect.any(String), 'RETRY');
  expect(JSON.stringify(onError.mock.calls)).not.toContain('private details');
});

test('uses the error name when a failed finalization has no code', async () => {
  overdue([{ _id: 'retry' }]);
  finalizeAttempt.mockRejectedValueOnce(new TypeError('private'));
  const onError = jest.fn();
  await finalizeOverdueAttempts(onError);
  expect(onError).toHaveBeenCalledWith(expect.any(String), 'TypeError');
});

test('worker recovers from a failed query and stop prevents another sweep', async () => {
  jest.useFakeTimers();
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  Attempt.find.mockImplementationOnce(() => { throw new Error('database unavailable'); });
  const stop = startDeadlineWorker();
  await Promise.resolve();
  overdue([]);
  await jest.advanceTimersByTimeAsync(5000);
  expect(Attempt.find).toHaveBeenCalledTimes(2);
  expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('retrying'));
  stop();
  await jest.advanceTimersByTimeAsync(10000);
  expect(Attempt.find).toHaveBeenCalledTimes(2);
});

test('stop during an in-flight sweep prevents scheduling another one', async () => {
  jest.useFakeTimers();
  overdue([{ _id: 'slow' }]);
  let resolve;
  finalizeAttempt.mockReturnValue(new Promise((done) => { resolve = done; }));
  const stop = startDeadlineWorker();
  await jest.advanceTimersByTimeAsync(0);
  stop(); resolve();
  await jest.advanceTimersByTimeAsync(10000);
  expect(Attempt.find).toHaveBeenCalledTimes(1);
});
