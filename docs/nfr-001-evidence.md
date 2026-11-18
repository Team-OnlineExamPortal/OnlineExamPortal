# Attempt API performance

On 18 November 2026, an isolated local MongoDB 8.2 instance and the real Express
attempt endpoint were exercised with 20 concurrent readers for 10 seconds.
All 3,266 requests returned HTTP 200. Latencies were p50 59.34 ms, p95 82.61 ms,
and p99 97 ms. The local 500 ms p95 threshold passed.

Reproduce with `OEP_RUN_LOCAL_LOAD=1 node server/scripts/test-results-integration.js`.
Set `OEP_TEST_MONGOD` to the installed MongoDB executable on another machine.

This is local evidence. Issue #16 still requires the agreed load and a
representative deployment. Set `OEP_ATTEMPT_URL`, `OEP_STUDENT_TOKEN`,
`OEP_LOAD_CONCURRENCY`, and `OEP_LOAD_DURATION_SECONDS`, then run
`cd server && npm run perf:attempt`. Save the JSON output with the agreed profile.
Keep tokens in the environment. Requests time out after 10 seconds.
