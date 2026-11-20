# Requirements traceability

Baseline: Team 13 Level 3 D3 SRS + SAD + STP, with the finalized D2 requirement IDs.
This matrix maps the implementation to executable evidence. Passing code tests,
human approval, and operational acceptance are separate statuses.

| ID | Implementation | Executable evidence |
| --- | --- | --- |
| FR-001 | Registration/login, normalized unique email, bcrypt | server/tests/auth.test.js; deployment-smoke.cjs |
| FR-002 | Role-aware UI routes and API guards | client/src/App.test.jsx; server/tests/admin.test.js and auth.test.js |
| FR-003 | Administrator question editor, edit/disable/category APIs | client/src/pages/Admin.test.jsx; server/tests/questions.test.js |
| FR-004 | Administrator schedule form, active-question count validation | Admin.test.jsx; server/tests/exams.test.js |
| FR-005 | Pure shuffled selection, per-attempt persisted order | server/tests/domain.test.js and attempts.test.js |
| FR-006 | Server-time available exam query and student dashboard | exams.test.js; client/src/App.test.jsx |
| FR-007 | Server deadline and browser remaining time | attempts.test.js; App.test.jsx |
| FR-008 | Navigation and review state, persisted marks | attempts.test.js; App.test.jsx |
| FR-009 | Version-checked saves and serialized browser retry/recovery | attempts.test.js; App.test.jsx; MongoDB integration |
| FR-010 | Atomic finalization, server deadline sweep and late-write rejection | scripts/test-results-integration.js; attempts.test.js |
| FR-011 | Partial unique index for active student/exam, duplicate conflict | attempts.test.js; MongoDB integration |
| FR-012 | Private answer-key snapshot and pure scoreAttempt | domain.test.js; grading.test.js; MongoDB integration |
| FR-013 | Final result embedded atomically in one attempt document | Concurrent submission and failed-grading MongoDB integration cases |
| FR-014 | Owner-scoped history/detail and student history UI | MongoDB integration; App.test.jsx; deployment-smoke.cjs |
| FR-015 | Administrator reports by exam/student and report UI | Admin.test.jsx; MongoDB integration; deployment-smoke.cjs |
| NFR-001 | Configurable authenticated attempt load runner | performance.test.js; performance.json from deployed CI probe |
| NFR-002 | Database readiness and timestamped availability samples | readiness.test.js; availability.jsonl from active test-exam window |
| NFR-003 | Dashboard Start exam directly starts an attempt | App.test.jsx; live browser walkthrough |
| NFR-004 | Server reload and queued browser save replay | attempts.test.js; App.test.jsx; live reload walkthrough |
| NFR-005 | Pure evaluation module, enforced 80% thresholds | npm run test:domain; coverage-summary.json |
| NFR-006 | Domain imports and runs with Express/Mongoose blocked | domain.test.js fresh-process isolation case |
| SEC-001 | bcrypt hashing and password byte limits | auth.test.js |
| SEC-002 | Authentication plus database roles and owner checks | auth.test.js; admin.test.js; questions.test.js; MongoDB integration |
| SEC-003 | Strict field types, operator-key rejection, React text rendering | input.test.js; questions.test.js; App.test.jsx; invalid-answer MongoDB case |
| SEC-004 | JWT signature, algorithm and expiration checks | auth.test.js |
| SEC-005 | Private grading snapshots and allowlisted student DTOs | exams.test.js; attempts.test.js; MongoDB integration |
| SEC-006 | Persistent request-ID and failed-login/denied-access audit events | auth.test.js; authorization-audit.test.js; security-audit-summary.json |

## Recorded implementation choices

The D3 data design proposes a separate results collection. The implementation
embeds one immutable result in the attempt document, so status and result commit
in one atomic write without requiring MongoDB replica-set transactions.
The API still exposes a stable resultId and owner-scoped result/report endpoints.

Faculty uses the Administrator role. Public registration always creates Students.
Administrator accounts are provisioned by the seed command; browser sign-in
opens the correct workspace based on the authenticated database role.

## Acceptance boundaries

The CI profile exercises 20 concurrent readers for 30 seconds and samples database
readiness every two seconds for a two-minute active test exam. These measurements
apply to that runner and test deployment. Faculty/team approval of the load and a
representative deployment, internet-facing HTTPS, institutional retention policy,
and long-term monitoring are still required for production acceptance.

Automated code review checks cannot substitute for teammate PR approval or each
member's explanation of the implementation during evaluation.
