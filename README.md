# Online Exam Portal  

**Web-Based Examination, Question Bank and Result Management System**
 
Project ID: OEP-2026-13 | Team 13 (G-13) | UE24CS341A — Software Engineering, V Semester
 
## Team
 
| Member | SRN | Module |
|---|---|---|
| Saikavin S | PES1UG24CS402 | Authentication & Administration |
| Samarth Kotian | PES1UG24CS406 | Question Bank & Exam Evaluation |
| Samrudh C Patil | PES1UG24CS417 | Exam Management & Attempt Processing |
| Satyam Goyal | PES1UG24CS424 | Student Examination & Performance |
 
## Description
 
The Online Exam Portal is a web-based examination management system designed for educational institutions. It digitizes the examination workflow from question-bank preparation and exam scheduling to timed student attempts, automatic evaluation, result generation and performance reporting. The system provides a centralized, secure and manageable platform for students and examination administrators/faculty.
 
## Scope
 
**In scope:** registration/login with role-based access, categorized MCQ question bank, exam creation and scheduling, randomized question selection, timed attempts with navigation and auto-save, automatic submission on time expiry, objective scoring, student result history, and administrator reports.
 
**Out of scope:** AI/webcam proctoring, subjective-answer grading, ERP integration, native mobile apps, and live invigilation.
 
## Tech stack
 
- **Frontend:** React.js
- **Backend:** Node.js + Express.js
- **Database:** MongoDB
- **Auth:** JWT
- **CI/CD:** GitHub Actions / Jenkins
- **Containerization:** Docker
## Project structure
 
```
online-exam-portal/
├── client/          # React frontend
├── server/          # Node.js/Express backend
├── docs/            # SRS, SAD, STP and other deliverables
├── .gitignore
└── README.md
```
 
## Development methodology
 
Agile (Scrum, 6 sprints). See `docs/` for the full SRS, SAD, STP and sprint plan.
 
## Getting started
 
From the project root, run:

```bash
npm start
```

Open **http://localhost:5173**. Choose **Create account** to register a student.
Press **Ctrl+C** to stop the project.

The launcher installs locked dependencies on first use, generates a persistent local
signing secret, starts MongoDB, and launches the API and frontend. Later starts reuse
the installed dependencies and saved database. Node.js 22.12+ and MongoDB Community
Server must be installed.

MongoDB is detected on PATH or in the standard Windows installation directory.
Set `OEP_MONGOD` for another installation path. Database files are stored outside
the checkout and OneDrive, under the operating system's local application data
directory. Generated settings in `.local/` are git-ignored.

Existing environment variables and `server/.env` settings are supported. If
`MONGO_URI` is configured, the launcher connects to that database instead of
starting a local MongoDB process. Defaults are API port 5000, frontend port 5173,
and local database port 27018. Set `PORT`, `OEP_CLIENT_PORT`, or `OEP_MONGO_PORT`
to change them.

The browser interface supports students and administrators. Administrator sign-in
opens question management, exam scheduling and result reports. See [server/README.md](server/README.md) for
administrator setup and [client/README.md](client/README.md) for frontend details.
