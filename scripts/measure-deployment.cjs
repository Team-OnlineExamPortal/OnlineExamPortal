'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const session = JSON.parse(fs.readFileSync(path.join(root, '.local/smoke-session.json')));
const reportDirectory = path.join(root, '.local/reports');

function run(script, file, variables) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, script)], {
      cwd: root, env: { ...process.env, ...variables }, windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => process.stderr.write(data));
    child.once('error', reject);
    child.once('exit', (code) => {
      fs.writeFileSync(path.join(reportDirectory, file), output);
      if (code !== 0) reject(new Error(script + ' failed with exit ' + code));
      else { console.log(file + ' recorded'); resolve(); }
    });
  });
}
const start = Date.now() + 3000;
Promise.all([
  run('server/scripts/load-test-attempt.js', 'performance.json', {
    OEP_ATTEMPT_URL: session.attemptUrl, OEP_STUDENT_TOKEN: session.token,
    OEP_LOAD_CONCURRENCY: '20', OEP_LOAD_DURATION_SECONDS: '30', OEP_P95_THRESHOLD_MS: '500',
  }),
  run('server/scripts/monitor-availability.js', 'availability.jsonl', {
    OEP_READINESS_URL: session.base + '/api/ready',
    OEP_WINDOW_START: new Date(start).toISOString(),
    OEP_WINDOW_END: new Date(start + 120000).toISOString(),
    OEP_PROBE_INTERVAL_MS: '2000',
  }),
]).catch((error) => { console.error(error.message); process.exitCode = 1; });
