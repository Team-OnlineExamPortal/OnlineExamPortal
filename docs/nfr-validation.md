# Non-functional requirement evidence

This file distinguishes local evidence from requirements that need the shared attempt APIs or a deployed environment.

| Issue | Requirement | Local evidence | Status |
| --- | --- | --- | --- |
| #18 / NFR-003 | Start an available exam within 3 clicks from the dashboard | `client/src/App.test.jsx` follows the dashboard's direct **Start exam** action and asserts the attempt API is called after that one click. | Verified in client component test; API is mocked. |
| #20 / NFR-005 | Evaluation logic has at least 80% automated unit coverage | `cd server && npx jest tests/domain.test.js --runInBand --coverage --collectCoverageFrom=src/domain.js` reports 100% statements, functions, and lines; 96.46% branches. Jest enforces an 80% threshold for `domain.js`. | Verified locally. |
| #21 / NFR-006 | Selection and scoring run without Express or Mongoose | `domain.test.js` starts a fresh Node process that blocks either import, then requires and executes selection and scoring. | Verified locally. |
| #16 / NFR-001 | p95 for attempt API requests is at most 500 ms | `server/scripts/load-test-attempt.js` and `npm run perf:attempt` measure p50/p95/p99 under configurable concurrency and duration. The active-attempt endpoint does not exist in this clone, and no faculty-approved load profile is recorded. | Not yet measurable; requires the attempt route, a representative deployment, and an agreed profile. Do not report a pass from this local checkout. |
| #17 / NFR-002 | 99.9% availability during exam windows | Availability is an operational measurement over a deployed exam window; the repository has no deployment target or monitoring data. | Unverified; requires a deployed service and monitoring evidence. |

The load runner expects `OEP_ATTEMPT_URL` to point to an authenticated active-attempt read endpoint and `OEP_STUDENT_TOKEN` to be a staging student token. Defaults are 20 concurrent workers for 30 seconds and a 500 ms p95 limit; treat that profile as provisional until the team/faculty agrees to it. The runner only performs reads.
