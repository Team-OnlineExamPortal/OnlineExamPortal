# Framework-independent selection and scoring

Verified on 18 November 2026 with `cd server && npm run test:domain`.

All 21 tests pass. The suite starts a fresh Node process, blocks loading Express
and Mongoose, then imports the domain module and executes question selection and
scoring successfully. Other tests cover deterministic selection, inactive
questions, correct/wrong/unanswered answers, and configurable penalties.

No web server or database is needed for this suite.
