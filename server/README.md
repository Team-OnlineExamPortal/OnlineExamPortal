# Server (Node.js / Express Backend)

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
