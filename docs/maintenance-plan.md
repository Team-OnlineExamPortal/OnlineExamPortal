# Maintenance and release plan

## Ownership

Authentication/RBAC: Saikavin S. Questions/scoring: Samarth Kotian.
Exam/attempts: Samrudh C Patil. Student UI/performance: Satyam Goyal.
Security, integration and release evidence are reviewed by the full team.

## Change and release process

1. Track a bug or requirement in GitHub, identify the affected requirement IDs,
   and implement it on a feature branch.
2. Run the relevant regression suite and the Jenkins validation pipeline.
3. Obtain the required teammate review. Merge through the protected main branch.
4. Record the validated commit, pipeline URL, test artifacts, and an annotated
   release tag after approval. Tag only approved releases.
5. Deploy the reviewed image versions. Retain the prior images and signing secret
   for rollback, and preserve the MongoDB volume.

## Routine operations

- Review failed-save, authentication, finalization and readiness events during
  exam windows. Investigate errors using request IDs without recording passwords,
  JWTs, complete answers or answer keys.
- Use platform monitoring plus readiness samples for availability review.
  Replay the documented load scenario before large or changed exam loads.
- Back up MongoDB before a release and verify restore into an isolated database.
  Keep backup access restricted to institutional administrators.
- Review dependency/security updates before release. Run ESLint, API/UI tests,
  the domain coverage threshold, integration tests and container smoke tests.
- Review failed deadline finalization promptly. Legacy attempts with unavailable
  original grading data require administrator investigation.

## Data retention and result release

The demo keeps data until its owner explicitly removes the local database or
Docker volume. It does not automatically delete student records. Submitted
results are visible immediately to their owner and to authorized administrators.
An institutional retention duration and any delayed result-release policy must
be agreed before a production release.

## Recovery

For an application failure, restart the services and verify /api/ready. MongoDB
data and the JWT signing secret must persist across restarts. The deadline sweep
revisits active overdue attempts after startup and finalization remains
idempotent. Never delete the production volume to fix a startup problem.

For a faulty release, restore the previously approved image and configuration.
If a data migration has occurred, evaluate compatibility before rollback.
Rehearse database restore against a new isolated database before replacing live
data. Record the incident, impact, resolution and follow-up regression case.

## Human review before submission

Verify the requirement matrix against the final commit, attach actual CI and
deployment evidence, collect team contribution/review history, and rehearse
student and administrator workflows. Each owner should explain their code,
tests, data invariants and security decisions.
