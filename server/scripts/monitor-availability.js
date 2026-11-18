'use strict';

async function main() {
  const url = new URL(process.env.OEP_READINESS_URL);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP readiness URL');
  const start = Date.parse(process.env.OEP_WINDOW_START);
  const end = Date.parse(process.env.OEP_WINDOW_END);
  const interval = Number(process.env.OEP_PROBE_INTERVAL_MS || 10000);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || Date.now() > start) {
    throw new Error('Set a future exam window with OEP_WINDOW_START and OEP_WINDOW_END');
  }
  if (!Number.isInteger(interval) || interval < 1000 || interval > 60000) throw new Error('Probe interval must be 1000 to 60000 ms');
  const samples = [];
  while (Date.now() < start) await new Promise((resolve) => setTimeout(resolve, Math.min(60000, start - Date.now())));
  let next = start;
  while (next < end) {
    const at = new Date();
    let available = false;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(interval, 5000)) });
      const body = await response.json();
      available = response.ok && body.status === 'ok';
    } catch { available = false; }
    samples.push({ at: at.toISOString(), available });
    process.stdout.write(JSON.stringify(samples.at(-1)) + '\n');
    next += interval;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, next - Date.now())));
  }
  const availability = samples.filter((sample) => sample.available).length / samples.length;
  process.stdout.write(JSON.stringify({ windowStart: new Date(start), windowEnd: new Date(end),
    sampleCount: samples.length, observedAvailability: availability, target: 0.999,
    passed: availability >= 0.999 }) + '\n');
  if (availability < 0.999) process.exitCode = 1;
}
if (require.main === module) main().catch((error) => { process.stderr.write(error.message + '\n'); process.exitCode = 2; });
