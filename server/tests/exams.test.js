'use strict';

/**
 * Test suite for Exam Management module:
 *   TC-05 (FR-004)            Admin exam creation & validation
 *   TC-07 (FR-006)            Available exams for students based on server time window
 *   TC-08 / SEC-002           Access control: 403 for students, 401 unauthenticated
 *   TC-21 / SEC-003           Input validation against NoSQL injection
 *   TC-22 / SEC-005           Never leak questions or correct answers before active attempts
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.BCRYPT_ROUNDS = '4';

jest.mock('../src/models', () => {
  const users = [];
  const exams = [];
  const questions = [];
  let userCounter = 0;
  let examCounter = 0;
  let questionCounter = 0;

  const ROLES = { STUDENT: 'Student', ADMIN: 'Administrator' };
  const USER_STATUS = { ACTIVE: 'active', DISABLED: 'disabled' };

  const User = {
    __store: users,
    async findById(id) {
      return users.find((u) => u.id === String(id)) || null;
    },
    async create(doc) {
      userCounter += 1;
      const user = { id: `user${userCounter}`, status: 'active', ...doc };
      users.push(user);
      return user;
    },
  };

  const Exam = {
    __store: exams,
    async create(doc) {
      examCounter += 1;
      const exam = { id: `exam${examCounter}`, _id: `exam${examCounter}`, ...doc };
      exams.push(exam);
      return exam;
    },
    async find(query = {}) {
      return exams.filter((e) => {
        if (query.startTime && query.startTime.$lte) {
          if (new Date(e.startTime) > new Date(query.startTime.$lte)) return false;
        }
        if (query.endTime && query.endTime.$gte) {
          if (new Date(e.endTime) < new Date(query.endTime.$gte)) return false;
        }
        return true;
      });
    },
    async findById(id) {
      return exams.find((e) => e.id === String(id) || e._id === String(id)) || null;
    },
  };

  const Question = {
    __store: questions,
    async create(doc) {
      questionCounter += 1;
      const q = { id: `q${questionCounter}`, status: 'active', disabled: false, ...doc };
      questions.push(q);
      return q;
    },
    async countDocuments(filter = {}) {
      return questions.filter((q) => {
        if (filter.category && q.category !== filter.category) return false;
        if (q.disabled === true || q.status === 'disabled') return false;
        return true;
      }).length;
    },
  };

  return { User, Exam, Question, ROLES, USER_STATUS };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { User, Exam, Question, ROLES } = require('../src/models');
const { isExamOpen, validateExamInput } = require('../src/exams');

const app = createApp();

function makeToken(user) {
  return jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', subject: String(user.id), expiresIn: '1h' }
  );
}

describe('FR-004 & FR-006: Exam Management & Scheduling', () => {
  let adminUser;
  let studentUser;
  let adminToken;
  let studentToken;

  beforeAll(async () => {
    adminUser = await User.create({
      name: 'Admin Sam',
      email: 'admin@portal.test',
      passwordHash: 'dummy',
      role: ROLES.ADMIN,
    });
    studentUser = await User.create({
      name: 'Student Alex',
      email: 'student@portal.test',
      passwordHash: 'dummy',
      role: ROLES.STUDENT,
    });
    adminToken = makeToken(adminUser);
    studentToken = makeToken(studentUser);

    // Seed questions for category "DataStructures"
    for (let i = 1; i <= 5; i++) {
      await Question.create({
        text: `DS Question ${i}`,
        category: 'DataStructures',
        options: ['O1', 'O2', 'O3', 'O4'],
        correctOption: 0,
      });
    }
  });

  describe('POST /api/exams (FR-004, SEC-002, SEC-003)', () => {
    test('creates an exam when called by an Administrator with valid inputs (201)', async () => {
      const start = new Date(Date.now() - 1000 * 60).toISOString();
      const end = new Date(Date.now() + 1000 * 60 * 60).toISOString();

      const res = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Midterm Exam - DS',
          category: 'DataStructures',
          durationMinutes: 45,
          questionCount: 3,
          startTime: start,
          endTime: end,
          negativeMarking: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Midterm Exam - DS');
      expect(res.body.durationMinutes).toBe(45);
      expect(res.body.questionCount).toBe(3);
      expect(res.body.negativeMarking).toBe(true);
    });

    test('rejects exam creation from a Student with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Student Attempting Exam Create',
          category: 'DataStructures',
          durationMinutes: 30,
          questionCount: 2,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .post('/api/exams')
        .send({ title: 'No Auth Exam' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    test('rejects invalid window where startTime >= endTime with 400 INVALID_WINDOW', async () => {
      const now = Date.now();
      const res = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Backwards Window Exam',
          category: 'DataStructures',
          durationMinutes: 30,
          questionCount: 2,
          startTime: new Date(now + 10000).toISOString(),
          endTime: new Date(now).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_WINDOW');
    });

    test('rejects non-positive durationMinutes and questionCount (400)', async () => {
      const validDates = {
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
      };

      const res1 = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Bad Duration',
          category: 'DataStructures',
          durationMinutes: 0,
          questionCount: 2,
          ...validDates,
        });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Bad Count',
          category: 'DataStructures',
          durationMinutes: 30,
          questionCount: -5,
          ...validDates,
        });
      expect(res2.status).toBe(400);
    });

    test('TC-05: rejects exam creation if category has insufficient active questions (400 INSUFFICIENT_QUESTIONS)', async () => {
      const res = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Too Many Questions Exam',
          category: 'DataStructures',
          durationMinutes: 60,
          questionCount: 999, // Category only has 5 questions
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INSUFFICIENT_QUESTIONS');
    });

    test('SEC-003: rejects NoSQL injection objects in title or category (400)', async () => {
      const res = await request(app)
        .post('/api/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: { $ne: null },
          category: 'DataStructures',
          durationMinutes: 30,
          questionCount: 2,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/exams/available (FR-006, SEC-005)', () => {
    beforeAll(async () => {
      const now = Date.now();
      // Past exam
      await Exam.create({
        title: 'Past Expired Exam',
        category: 'DataStructures',
        durationMinutes: 30,
        questionCount: 2,
        startTime: new Date(now - 7200000),
        endTime: new Date(now - 3600000),
      });
      // Future exam
      await Exam.create({
        title: 'Upcoming Future Exam',
        category: 'DataStructures',
        durationMinutes: 30,
        questionCount: 2,
        startTime: new Date(now + 3600000),
        endTime: new Date(now + 7200000),
      });
      // Active current exam
      await Exam.create({
        title: 'Currently Active Exam',
        category: 'DataStructures',
        durationMinutes: 45,
        questionCount: 3,
        startTime: new Date(now - 1800000),
        endTime: new Date(now + 1800000),
      });
    });

    test('returns only currently open exams for authenticated students', async () => {
      const res = await request(app)
        .get('/api/exams/available')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const titles = res.body.map((e) => e.title);
      expect(titles).toContain('Currently Active Exam');
      expect(titles).not.toContain('Past Expired Exam');
      expect(titles).not.toContain('Upcoming Future Exam');
    });

    test('SEC-005: available exams endpoint never exposes questions or answers', async () => {
      const res = await request(app)
        .get('/api/exams/available')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      res.body.forEach((exam) => {
        expect(exam).not.toHaveProperty('questions');
        expect(exam).not.toHaveProperty('options');
        expect(exam).not.toHaveProperty('correctOption');
      });
    });

    test('rejects unauthenticated requests to available exams with 401', async () => {
      const res = await request(app).get('/api/exams/available');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('GET /api/exams/:id', () => {
    test('returns exam metadata for a valid ID', async () => {
      const exam = Exam.__store[0];
      const res = await request(app)
        .get(`/api/exams/${exam.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(exam.id);
      expect(res.body.title).toBe(exam.title);
    });

    test('returns 404 for nonexistent exam ID', async () => {
      const res = await request(app)
        .get('/api/exams/nonexistent-id')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('Helper functions', () => {
    test('isExamOpen correctly verifies time bounds', () => {
      const now = new Date('2026-11-01T12:00:00Z');
      const openExam = {
        startTime: '2026-11-01T11:00:00Z',
        endTime: '2026-11-01T13:00:00Z',
      };
      const closedExam = {
        startTime: '2026-11-01T09:00:00Z',
        endTime: '2026-11-01T10:00:00Z',
      };

      expect(isExamOpen(openExam, now)).toBe(true);
      expect(isExamOpen(closedExam, now)).toBe(false);
    });

    test('validateExamInput rejects null or non-object body', () => {
      expect(() => validateExamInput(null)).toThrow('Title is required');
    });
  });
});
