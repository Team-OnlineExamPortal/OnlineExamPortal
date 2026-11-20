# Security validation and penetration-test plan

## Scope and authorization

Test the repository's own API and browser application in an isolated local or CI
deployment, using synthetic students, an administrator and a disposable database.
The executable probe rejects non-loopback targets. It does not scan external
systems, guess real credentials, run denial-of-service traffic or modify real
student records. CI destroys its test volumes after execution.

## Threats, cases and expected results

| ID | Threat / method | Pass criterion | Evidence |
| --- | --- | --- | --- |
| SEC-P01 | Supply Administrator role during public registration | Stored/authenticated role remains Student | Deployed probe; auth.test.js |
| SEC-P02 | Missing, tampered, expired and unsigned JWT | 401; no protected data | Probe covers missing/tampered; auth.test.js covers expiry/algorithm/signature |
| SEC-P03 | Student invokes administrator reads and mutations | 403; no privileged operation | Deployed probe; questions/admin/exams unit tests |
| SEC-P04 | Second student reads/writes/submits an owner's attempt | 403; owner's answers remain unchanged | Deployed probe; MongoDB integration |
| SEC-P05 | Stored XSS text and premature question/answer-key access | Text is JSON data; React renders inert text; no answer key or early question leak | Probe; App.test.jsx XSS rendering regression |
| SEC-P06 | Broken JSON and body above 100 KB | Structured 400/413; no stack, hash or internal model detail | Deployed probe; errors.test.js |
| SEC-P07 | Cross-owner result request and post-submit overwrite | Owner-scoped 404; write 409; retry preserves result ID and score | Deployed probe; MongoDB integration |
| SEC-F01 | Seeded nested JSON and query-key mutations | Operator/path/prototype keys rejected before handlers, or safely discarded by the query parser | 120 JSON mutations plus 120 query requests; depths 0-5 |
| SEC-F02 | Wrong-type authentication fields | 400 for null, boolean, number, array and object fields | 18 deployed requests |
| SEC-F03 | Malformed resource identifiers | 404; no 500 or internal exception disclosure | Five deployed requests |
| SEC-A01 | Failed login and repeated authorization denials | Every tested denial audited once; whitelist excludes bodies/passwords/tokens | auth.test.js; authorization-audit.test.js; audit.test.js; verify-audit.cjs |

Fuzzer seed: **20261120**, using a fixed linear-congruential generator. The corpus
uses `$ne`, `$where`, dotted paths, `__proto__`, `constructor` and `prototype`.
Express may discard a bare `__proto__` query key before middleware; in that case
only the unchanged health response is accepted. Every JSON form must be rejected.
Requests run sequentially, with a 10-second timeout per request. The report records
the seed, request count, actual outcomes and PASS/FAIL for each group; any failed
invariant fails the job. Sensitive fixture credentials/tokens are never archived.

## Execution and reporting

After seeding the administrator in the disposable Compose deployment, set
`OEP_BASE_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then run
`node scripts/security-validation.cjs`. For the CI HTTPS certificate, keep
`NODE_EXTRA_CA_CERTS` configured; do not disable certificate verification.

Jenkins runs the probe after deployment smoke checks, then verifies the persistent
audit file with `scripts/verify-audit.cjs`. Download `security-validation.json` and
`security-audit-summary.json` from the workflow artifact. The committed
[security execution record](evidence/security-validation.json) records the local
execution against the same application code; the PR's CI check provides deployed
HTTPS execution for the published branch.

Classify a discovered authentication bypass, answer-key leak or unauthorized write
as release blocking. Record the failing case/seed, fix the cause, add a regression
and rerun this plan plus the relevant functional tests before review.

## Review and acceptance

A teammate must review the authorization boundaries, validation, safe rendering,
audit fields and security test results before merging. Confirm review on GitHub;
the pipeline cannot grant a human code-review approval.

This is a bounded penetration-test plan with executable security regressions and
seeded fuzzing. It does not claim an independent professional penetration test,
exhaustive payload coverage or internet-facing production certification. For a
production release, agree scope, infrastructure/TLS/database checks, dependency
review and any independent assessment with the institution before exposure.
