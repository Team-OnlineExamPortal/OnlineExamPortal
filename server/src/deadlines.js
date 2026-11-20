'use strict';
const { Attempt } = require('./models');
const { finalizeAttempt } = require('./submissions');

async function finalizeOverdueAttempts(onError = console.error) {
  const cursor = Attempt.find({
    status: 'active', expiresAt: { $lte: new Date() }, result: { $exists: false },
  }).select('_id').lean().cursor();
  for await (const attempt of cursor) {
    try {
      await finalizeAttempt(attempt._id);
    } catch (error) {
      onError('Deadline finalization needs retry or administrator review', error.code || error.name);
    }
  }
}

function startDeadlineWorker() {
  let stopped = false;
  let timer;
  async function tick() {
    try {
      await finalizeOverdueAttempts();
    } catch {
      console.error('Deadline sweep failed; retrying on the next interval');
    }
    if (!stopped) {
      timer = setTimeout(tick, 5000);
      timer.unref();
    }
  }
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { finalizeOverdueAttempts, startDeadlineWorker };
