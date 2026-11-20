# Fifteen-minute demonstration plan

Use the reviewed combined release, a seeded administrator and a synthetic student.
Run npm start before the presentation or deploy the validated Compose images.
Keep the validation artifact and source code open beside the application.

| Time | Demonstration | Evidence / explanation |
| --- | --- | --- |
| 0:00-1:00 | State the exam-portal problem, scope and two roles | D1/D2 baseline and requirement matrix |
| 1:00-3:30 | Administrator signs in, creates/edits a question, disables another, schedules an exam | Admin dashboard; API role guards; active-question count |
| 3:30-7:00 | Student registers/signs in, starts the exam, answers and marks for review, navigates and reloads | Persisted question order; safe DTO; server deadline; save/recovery state |
| 7:00-8:30 | Submit and inspect student history | Pure scoring, private answer-key snapshot, atomic one-result finalization |
| 8:30-10:00 | Administrator loads exam-wise and student-wise reports | Reports agree with the same stored result; owner/role checks |
| 10:00-12:00 | Explain the implementation and security controls | auth.js, attempts.js, submissions.js, domain.js, Admin.jsx |
| 12:00-13:30 | Show the executed Jenkins pipeline, Docker deployment and test artifacts | Unit/UI cases, real MongoDB cases, static analysis, coverage and HTTPS smoke |
| 13:30-14:30 | Show load/readiness measurements and scope | Actual p95, concurrency/duration and exact monitored test window |
| 14:30-15:00 | Show contribution/review history and maintenance decisions | GitHub PRs, requirement matrix, backup/rollback and retention review |

## Code explanation checkpoints

- Authentication owner: explain why public registration always creates Students,
  how bcrypt is stored, how JWT signatures/expiry are checked, and why roles are
  reloaded from the database.
- Questions/scoring owner: explain validation, disabled-question filtering,
  deterministic tests, shuffled order, immutable private grading snapshots,
  negative marking and unanswered scoring.
- Attempt owner: explain the partial unique index, server-recorded deadline,
  serialized client writes, version-checked database saves, atomic result storage,
  idempotent retries and the disconnected-client deadline sweep.
- UI/performance owner: explain role-aware routes, administrator forms, safe text
  rendering, retry persistence, reload restoration, reports and measured load.

## Honest evidence presentation

Use the actual successful run URL in validation-execution.md. The two-minute
sampled availability result applies to its test window. Obtain team/faculty
agreement on the representative acceptance load and environment. Each member
should explain their own implementation and the AI-assisted changes they reviewed.

The existing D3 model diagram proposes a separate result collection. Explain the
documented atomic embedded-result implementation choice and its one-result
invariant, rather than presenting the old diagram as the current storage layout.
