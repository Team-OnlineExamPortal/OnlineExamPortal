# Server (Node.js / Express Backend)

## Question bank (FR-003)

Use an administrator bearer token for these endpoints:

| Method and path | Behavior |
| --- | --- |
| `GET /api/questions` | List questions, optionally filtered by an exact `category` query parameter. |
| `POST /api/questions` | Create an active question. |
| `PUT /api/questions/:id` | Replace a question's content and category without changing its status. |
| `PATCH /api/questions/:id/disable` | Disable a question for future selection while keeping it available to attempts already assigned it. |

Create and edit require `text`, `category`, `options` (2 to 10 strings), and
`correctOption` (the zero-based index of the correct option).

This folder will hold the Express API.

## To initialize

From the repo root:

```bash
cd server
npm init -y
npm install express mongoose jsonwebtoken bcrypt dotenv cors
npm install --save-dev nodemon
```

## Planned structure (per SAD)

```
server/
├── src/
│   ├── app.js          # Express app, routes, middleware
│   ├── auth.js          # Login/register, JWT issue+validate, RBAC
│   ├── models.js        # Mongoose schemas (User, Question, Exam, Attempt, Result)
│   ├── domain.js         # Pure selection/scoring logic (no Express/Mongo deps)
│   └── ...
├── .env                  # PORT, MONGO_URI, JWT_SECRET (not committed)
└── package.json
```

## Responsibilities by module owner

- **Auth/RBAC** (`auth.js`) — Saikavin S
- **Question bank / scoring** (`domain.js` selection+scoring) — Samarth Kotian
- **Exam/attempt service** — Samrudh C Patil
- **API reliability / error handling** — Samrudh C Patil

## Environment variables

Create a `.env` file (already gitignored) with:

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/oep
JWT_SECRET=replace-with-a-real-secret
```
