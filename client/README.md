# Student client

React student portal built with Vite. It supports student registration and login, viewing currently available exams, exam details, and a results-history view.

## Run locally

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

The Vite development server runs at `http://localhost:5173`. The API defaults to `http://localhost:5000/api`; set `VITE_API_BASE_URL` in `.env` to override it. Start the server separately using the instructions in `../server/README.md`.

The current server implements `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/exams/available`, and exam metadata. Attempt and results APIs are not in this clone yet. The client reports missing endpoints honestly and does not indicate that an attempt or answer was saved.

## API shape needed to finish the exam flow

The attempt screen follows the handoff/SAD contract: `POST /api/exams/:examId/attempts` returns `{ attemptId, deadline, questions }`; `GET /api/attempts/:attemptId` restores an active attempt; `PUT /api/attempts/:attemptId/answers` accepts `{ questionId, optionId, review }`; and `POST /api/attempts/:attemptId/submit` finalizes it. Question payloads must omit answer keys. `GET /api/results/me` must return only the authenticated student's results. The server must enforce ownership, deadlines, and idempotency.

The Start exam action is directly available on the dashboard card. The client stores the active attempt ID for refresh recovery, keeps retryable answer/review writes in browser storage while offline, and confirms manual submission. Server routes are still required for end-to-end use.

## Build

```bash
npm run build
```
