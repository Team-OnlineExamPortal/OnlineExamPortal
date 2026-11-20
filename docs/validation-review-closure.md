# Validation review closure

Checked and extended on 20 November 2026. This addendum supersedes the older
single-file coverage-gate description; historic measurements retain their dates
and source revisions.

| Review point | Implemented correction | Verification |
| --- | --- | --- |
| CI/CD absent | GitHub Actions starts an actual Jenkins controller; Jenkinsfile installs, checks, builds, deploys and validates | Published run 44680124100 passed; new PR reruns the expanded pipeline |
| Docker absent | API/web Dockerfiles, MongoDB persistence, HTTP/HTTPS Compose deployment | Healthy containers plus HTTPS system/integration checks in Jenkins |
| Static analysis absent | ESLint runs before tests and fails the build on errors | Local extended revision: 0 errors, 0 warnings; archived eslint.json |
| STP actual results absent | Current execution addendum contains expected/actual results and status for all TC-01 to TC-29 | 27 PASS, 2 PENDING acceptance; no empty result cells |
| No pen-test/fuzzing plan | Scoped threat/case/expected-result plan plus bounded seeded executable probe in Jenkins | Local execution: 10 groups PASS, 298 requests; safe JSON evidence committed |
| Coverage gate only one file | Server-wide and frontend-wide aggregate gates enforce 80% lines/statements/functions/branches; separate domain run also enforces 80% | 137 server and 29 frontend cases passed with all gates |
| Mandatory code review | Protected main and teammate review remain required; maintenance plan records release workflow | Approval remains pending; CI does not impersonate a human reviewer |

## Executed expanded coverage

| Scope | Lines | Statements | Functions | Branches | Required minimum |
| --- | --- | --- | --- | --- | --- |
| Server application | 91.14% | 89.71% | 91.57% | 80.16% | 80% in each metric |
| Frontend application | 94.73% | 92.19% | 91.04% | 80.99% | 80% in each metric |
| Evaluation module | 100% | 100% | 100% | 96.46% | 80% in each metric |

These are aggregate application gates, not a claim that every individual file
exceeds 80%. Collection includes all server src JavaScript except process bootstrap
index.js, and all frontend src JavaScript/JSX except DOM bootstrap main.jsx and
test files. Unimported application files remain in the collection patterns.
Startup is separately exercised by the launcher and deployed container tests.

Reproduce with `npm run test:coverage --prefix server`,
`npm run test:domain --prefix server`, and
`npm run test:coverage --prefix client`. Jenkins archives both application coverage
summaries. The committed safe local summaries are in evidence/coverage-review.json.

Security evidence is a bounded regression/fuzz run, not independent professional
penetration-test certification. See security-validation-plan.md for exact scope,
fixtures, seed, failure criteria, execution and human review. See stp-execution.md
for the distinction between a passing measured load/window and final acceptance.
