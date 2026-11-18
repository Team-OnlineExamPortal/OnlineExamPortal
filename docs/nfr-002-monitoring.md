# Availability verification

The readiness endpoint `GET /api/ready` checks MongoDB connectivity and returns
503 when the database is unavailable.

For a deployed service set `OEP_READINESS_URL` to its readiness endpoint,
`OEP_WINDOW_START` and `OEP_WINDOW_END` to future ISO timestamps covering an exam
window, and optionally `OEP_PROBE_INTERVAL_MS` (default 10000).
Run `node server/scripts/monitor-availability.js` from an external monitoring
machine and retain stdout as JSON Lines.

Each record contains a timestamp and success state. The final record reports the
fraction of successful samples and whether it reaches 99.9%. Probe sampling can
miss outages between requests. Use service/platform uptime records alongside it
for the deployment monitoring review.

Issue #17 remains pending until a deployed exam window has monitoring evidence.
No deployment URL or exam window has been supplied for this verification.
