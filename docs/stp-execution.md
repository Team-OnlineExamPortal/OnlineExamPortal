# STP execution addendum

Execution date: **20 November 2026**. This is the current execution record for
TC-01 through TC-29 in the baseline SRS/SAD/STP. The original PDF is preserved as
the planned specification; its "Planned" labels do not describe this execution.
Submit this addendum with that baseline and the validation/release report.

Application execution: [Jenkins/Docker/HTTPS run 44678707349](https://github.com/Team-OnlineExamPortal/OnlineExamPortal/actions/runs/44678707349),
revision `b57d332911af0e8b465f3b49e5407107fccc7165`. The later published documentation
branch also passed [run 44680124100](https://github.com/Team-OnlineExamPortal/OnlineExamPortal/actions/runs/44680124100).
Additional local security/coverage regressions are recorded in
[review closure](validation-review-closure.md). The new PR's full CI check reruns
the expanded gates and security probe. No human signature or acceptance is implied.

PASS means the specified functional invariant was exercised by the cited evidence.
PENDING means measurement exists but its required acceptance decision remains open.

| Case | Expected result | Actual result | Pass/Fail | Evidence / remaining action |
| --- | --- | --- | --- | --- |
| TC-01 | Unique registration/login; duplicate and invalid login denied | Registration 201; duplicate 409; wrong credentials 401 | PASS | auth.test.js; deployment-smoke.json |
| TC-02 | Student cannot call admin API | Student 403; administrator succeeds | PASS | auth.test.js; admin.test.js; deployed probe |
| TC-03 | Create/edit/disable categorized question | Changes persisted; disabled question excluded from new selection | PASS | questions.test.js; domain.test.js; deployment smoke; browser walkthrough |
| TC-04 | Student cannot mutate questions | Mutation 403; no student write | PASS | questions.test.js; SEC-P03 |
| TC-05 | Valid exam accepted; invalid schedule rejected | Valid exam 201; invalid windows/durations 400 | PASS | exams.test.js; deployment smoke |
| TC-06 | Valid randomized selection saved, without duplicates | Selection diversity and uniqueness passed; per-attempt order persisted | PASS | domain.test.js; attempts.test.js; MongoDB integration |
| TC-07 | Only currently available exams startable | Future/expired windows excluded; current exam listed | PASS | exams.test.js; deployment smoke |
| TC-08 | Start outside window blocked | Future/expired starts 403; no active attempt created | PASS | attempts.test.js |
| TC-09 | Timer follows server deadline | Server-recorded deadline and UI expiry/submission assertions passed | PASS | attempts.test.js; App.test.jsx |
| TC-10 | Navigation preserves answer and review flag | Answer/review persisted across navigation and reload | PASS | attempts.test.js; App.test.jsx; browser walkthrough |
| TC-11 | Latest answer persisted and acknowledged | Save/reload checks passed; overlapping-save regression retains newest choice before submit | PASS | attempts.test.js; App.test.jsx; deployment smoke |
| TC-12 | Saved state restored on reconnect within 1 minute | Automated reconnect/reload cases complete within test timeout below 1 minute; live reload restored answer/review | PASS | attempts.test.js; App.test.jsx; browser walkthrough; representative network conditions still need release acceptance |
| TC-13 | Deadline finalizes and blocks late writes | Overdue result scored by sweep/read; late writes rejected | PASS | MongoDB integration; attempts.test.js; deadlines.test.js |
| TC-14 | Concurrent start creates at most one active attempt | Real MongoDB unique index/concurrent-start case passed | PASS | test-results-integration.js |
| TC-15 | Correct/wrong/unanswered scoring matches key | Known scoring cases passed, with unanswered contributing zero | PASS | domain.test.js; grading.test.js; MongoDB integration |
| TC-16 | Negative marking uses configured penalty | Configurable penalty cases passed | PASS | domain.test.js; grading.test.js |
| TC-17 | Submit retry retains one durable result | Concurrent submissions share one result ID; later writes blocked | PASS | MongoDB integration; deployment smoke |
| TC-18 | Own results available; other student's denied | Owner history returned; unrelated student receives 404 | PASS | MongoDB integration; SEC-P07 |
| TC-19 | bcrypt stored; plaintext absent | Stored hash and authentication assertions passed | PASS | auth.test.js |
| TC-20 | Invalid/expired token and failed login rejected/audited | 401 with safe events; expiry/signature/algorithm cases passed | PASS | auth.test.js; security-audit-summary.json |
| TC-21 | NoSQL/XSS inputs cannot bypass queries or execute | Operator/type corpus rejected; text renders inertly in React; no query bypass | PASS | input.test.js; App.test.jsx; security-validation.json |
| TC-22 | No early questions or answer-key leak | Metadata omits questions; attempt payload omits private grading key | PASS | exams.test.js; attempts.test.js; SEC-P05 |
| TC-23 | Admin reports agree; students denied | Stored score/count match exam and student reports; student 403 | PASS | MongoDB integration; deployment smoke; browser walkthrough |
| TC-24 | p95 <=500 ms at agreed load | 20 clients/30 s: 21,090 HTTP 200 responses; p95 47.76 ms | PENDING | performance.json passes measured profile; team/faculty must approve representative load/environment |
| TC-25 | Observed availability >=99.9% in accepted exam window | 60/60 successful samples during the recorded two-minute test exam | PENDING | availability.jsonl; accept monitoring window/environment and continue operational monitoring; no long-term SLA claim |
| TC-26 | Start exam within 3 dashboard clicks | Start exam link directly opens the attempt (one navigation action) | PASS | App.test.jsx; live browser walkthrough |
| TC-27 | Evaluation coverage >=80% | 100% lines; 96.46% branches; dedicated threshold passes | PASS | server domain coverage; expanded server/client gates described in review closure |
| TC-28 | Selection/scoring work without web/database imports | Fresh-process test blocks Express/Mongoose and executes both functions | PASS | domain.test.js |
| TC-29 | Every forbidden request audited without secrets | Repeated-denial/unit deduplication cases pass; deployed safe audit types present | PASS | auth.test.js; authorization-audit.test.js; audit.test.js; security-audit-summary.json |

Summary: **29 cases have actual results; 27 PASS, 0 FAIL, 2 PENDING acceptance**.
No empty Actual Result or Pass/Fail cells remain in this addendum. Pending cases
are acceptance limits, not omitted measurements. Teammate code-review approval,
test/development lead sign-off and faculty acceptance must be recorded by the
responsible people; their signatures are not filled by automation.
