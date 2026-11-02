'use strict';

// NFR-001 probe for an authenticated read of one in-progress attempt. This is
// intentionally configurable so the team can use the agreed load profile and
// a deployed/staging API rather than benchmarking a fake local endpoint.
const targetUrl = process.env.OEP_ATTEMPT_URL;
const token = process.env.OEP_STUDENT_TOKEN;
const concurrency = Number(process.env.OEP_LOAD_CONCURRENCY || 20);
const durationSeconds = Number(process.env.OEP_LOAD_DURATION_SECONDS || 30);
const thresholdMs = Number(process.env.OEP_P95_THRESHOLD_MS || 500);

function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError('Percentile fraction must be in [0, 1]');
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('Percentile values must be finite numbers');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

async function main() {
  if (!targetUrl || !token) {
    throw new Error('Set OEP_ATTEMPT_URL and OEP_STUDENT_TOKEN for an authenticated active attempt endpoint.');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 500) {
    throw new Error('OEP_LOAD_CONCURRENCY must be an integer between 1 and 500.');
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) {
    throw new Error('OEP_LOAD_DURATION_SECONDS must be between 1 and 3600.');
  }
  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) {
    throw new Error('OEP_P95_THRESHOLD_MS must be a positive number.');
  }

  const url = new URL(targetUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('OEP_ATTEMPT_URL must use HTTP or HTTPS.');
  const stopAt = Date.now() + durationSeconds * 1000;
  const latencies = [];
  const statuses = new Map();
  const errors = [];

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (Date.now() < stopAt) {
      const startedAt = performance.now();
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        // Consume the response so timings include transfer completion.
        await response.arrayBuffer();
        latencies.push(performance.now() - startedAt);
        statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
        if (!response.ok && errors.length < 5) errors.push(`HTTP ${response.status}`);
      } catch (error) {
        latencies.push(performance.now() - startedAt);
        if (errors.length < 5) errors.push(error.message);
      }
    }
  }));

  const p95Ms = percentile(latencies, 0.95);
  const report = {
    target: url.origin + url.pathname,
    concurrency,
    durationSeconds,
    requestCount: latencies.length,
    statusCounts: Object.fromEntries(statuses),
    p50Ms: Number(percentile(latencies, 0.50)?.toFixed(2)),
    p95Ms: Number(p95Ms?.toFixed(2)),
    p99Ms: Number(percentile(latencies, 0.99)?.toFixed(2)),
    thresholdMs,
    passed: latencies.length > 0 && errors.length === 0 && p95Ms <= thresholdMs,
    errors,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}

module.exports = { percentile };
