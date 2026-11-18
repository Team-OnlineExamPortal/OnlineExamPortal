# Evaluation coverage verification

Verified on 18 November 2026 with Node 22.20.0.

Run `cd server && npm run test:domain`.

All 21 tests pass. The evaluation module has 100% statement, function and line
coverage and 96.46% branch coverage. The Jest configuration enforces at least 80%
for each metric on `src/domain.js`.

Scoring stays in the pure domain module. HTTP submission and MongoDB persistence
call that function through the grading service.
