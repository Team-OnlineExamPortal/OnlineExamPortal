'use strict';

/**
 * Tests for Exam Attempt processing module:
 *   TC-06 / FR-007   Provide timed attempts with remaining time shown
 *   FR-011           Prevent two active attempts by one student for the same exam
 *   SEC-002          Role-based access: Student-only access to start attempt
 *   SEC-005          Ensure questions returned in attempt never expose correctOption
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.BCRYPT_ROUNDS = '4';

const mongoose = require('mongoose');

jest.mock('../src/models', () => {
  const users = [];
  const exams = [];
  const questions = [];
  const attempts = [];
  let userCounter = 0;
  let examCounter = 0;
  let questionCounter = 0;
  let attemptCounter = 0;

  const ROLES = { STUDENT: 'Student', ADMIN: 'Administrator' };
  const USER_STATUS = { ACTIVE: 'active', DISABLED: 'disabled' };

  const User = {
    __store: users,
    async findById(id) {
      return users.find((u) => u.id === String(id) || u._id === String(id)) || null;
    },
    async create(doc) {
      userCounter += 1;
      const user = { id: `user${userCounter}`, _id: `user${userCounter}`, status: 'active', ...doc };
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
    async findById(id) {
      const idStr = String(id);
      if (!/^[0-9a-fA-F]{24}$/.test(idStr) && !/^exam[0-9]+$/.test(idStr)) {
        const err = new Error(`Cast to ObjectId failed for value "${idStr}"`);
        err.name = 'CastError';
        err.kind = 'ObjectId';
        throw err;
      }
      return exams.find((e) => e.id === idStr || e._id === idStr) || null;
    },
  };

  const Question = {
    __store: questions,
    async create(doc) {
      questionCounter += 1;
      const q = { id: `q${questionCounter}`, _id: `q${questionCounter}`, status: 'active', disabled: false, ...doc };
      questions.push(q);
      return q;
    },
    async find(filter = {}) {
      return questions.filter((q) => {
        if (filter.category && q.category !== filter.category) return false;
        if (filter.disabled && filter.disabled.$ne && q.disabled === filter.disabled.$ne) return false;
        if (filter.status && filter.status.$ne && q.status === filter.status.$ne) return false;
        return true;
      });
    },
    async countDocuments(filter = {}) {
      const list = await Question.find(filter);
      return list.length;
    },
  };

  const Attempt = {
    __store: attempts,
    async findOne(query = {}) {
      return attempts.find((a) => {
        if (query.studentId && String(a.studentId) !== String(query.studentId)) return false;
        if (query.examId && String(a.examId) !== String(query.examId)) return false;
        if (query.status && a.status !== query.status) return false;
        return true;
      }) || null;
    },
    async create(doc) {
      if (doc.status === 'active') {
        const dup = attempts.find(
          (a) =>
            String(a.studentId) === String(doc.studentId) &&
            String(a.examId) === String(doc.examId) &&
            a.status === 'active'
        );
        if (dup) {
          const err = new Error('E11000 duplicate key error');
          err.code = 11000;
          throw err;
        }
      }
      attemptCounter += 1;
      const attempt = {
        id: `attempt${attemptCounter}`,
        _id: `attempt${attemptCounter}`,
        ...doc,
        async save() {
          return this;
        },
      };
      attempts.push(attempt);
      return attempt;
    },
    async findById(id) {
      const idStr = String(id);
      if (!/^[0-9a-fA-F]{24}$/.test(idStr) && !/^attempt[0-9]+$/.test(idStr)) {
        const err = new Error(`Cast to ObjectId failed for value "${idStr}"`);
        err.name = 'CastError';
        err.kind = 'ObjectId';
        throw err;
      }
      return attempts.find((a) => a.id === idStr || a._id === idStr) || null;
    },
  };

  return { User, Exam, Question, Attempt, ROLES, USER_STATUS };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { User, Exam, Question, Attempt, ROLES } = require('../src/models');

const app = createApp();

function makeToken(user) {
  return jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', subject: String(user.id), expiresIn: '1h' }
  );
}

describe('FR-007 / FR-011 / SEC-005: Timed Exam Attempts & Active Attempt Guard', () => {
  let student1, student2, admin;
  let student1Token, student2Token, adminToken;
  let activeExam, futureExam, expiredExam, shortWindowExam;

  beforeAll(async () => {
    student1 = await User.create({ name: 'Sam Student', email: 'sam@student.test', role: ROLES.STUDENT });
    student2 = await User.create({ name: 'Other Student', email: 'other@student.test', role: ROLES.STUDENT });
    admin = await User.create({ name: 'Exam Admin', email: 'admin@school.test', role: ROLES.ADMIN });

    student1Token = makeToken(student1);
    student2Token = makeToken(student2);
    adminToken = makeToken(admin);

    // Seed 10 questions for 'Algorithms'
    for (let i = 1; i <= 10; i++) {
      await Question.create({
        text: `Algo Question ${i}`,
        category: 'Algorithms',
        options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`],
        correctOption: (i % 4),
      });
    }

    const now = Date.now();
    activeExam = await Exam.create({
      title: 'Active Algo Exam',
      category: 'Algorithms',
      durationMinutes: 30,
      questionCount: 5,
      startTime: new Date(now - 3600000), // opened 1 hr ago
      endTime: new Date(now + 3600000),   // closes in 1 hr
    });

    futureExam = await Exam.create({
      title: 'Upcoming Algo Exam',
      category: 'Algorithms',
      durationMinutes: 30,
      questionCount: 5,
      startTime: new Date(now + 3600000), // starts in 1 hr
      endTime: new Date(now + 7200000),
    });

    expiredExam = await Exam.create({
      title: 'Past Algo Exam',
      category: 'Algorithms',
      durationMinutes: 30,
      questionCount: 5,
      startTime: new Date(now - 7200000),
      endTime: new Date(now - 3600000),
    });

    shortWindowExam = await Exam.create({
      title: 'Short Window Exam',
      category: 'Algorithms',
      durationMinutes: 60, // 60 minutes requested
      questionCount: 3,
      startTime: new Date(now - 10000),
      endTime: new Date(now + 600000), // only 10 minutes left in window
    });
  });

  describe('POST /api/exams/:id/attempts (Start Attempt)', () => {
    test('successfully starts a timed attempt for an active exam (201)', async () => {
      const res = await request(app)
        .post(`/api/exams/${activeExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('attemptId');
      expect(res.body.examId).toBe(activeExam.id);
      expect(res.body.status).toBe('active');
      expect(res.body.durationMinutes).toBe(30);
      expect(res.body.remainingSeconds).toBeGreaterThan(0);
      expect(res.body.remainingSeconds).toBeLessThanOrEqual(30 * 60);
      expect(res.body.questions).toHaveLength(5);
    });

    test('SEC-005: questions in attempt payload never include correctOption', async () => {
      const examForSec = await Exam.create({
        title: 'SEC Test Exam',
        category: 'Algorithms',
        durationMinutes: 20,
        questionCount: 3,
        startTime: new Date(Date.now() - 10000),
        endTime: new Date(Date.now() + 3600000),
      });

      const res = await request(app)
        .post(`/api/exams/${examForSec.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(201);
      res.body.questions.forEach((q) => {
        expect(q).not.toHaveProperty('correctOption');
        expect(q).toHaveProperty('text');
        expect(q).toHaveProperty('options');
      });
    });

    test('caps attempt deadline when remaining exam window is shorter than durationMinutes', async () => {
      const res = await request(app)
        .post(`/api/exams/${shortWindowExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(201);
      // Window only has ~10 minutes (600s), should be <= 600s even though duration is 60m (3600s)
      expect(res.body.remainingSeconds).toBeLessThanOrEqual(600);
      expect(new Date(res.body.deadline).getTime()).toBeLessThanOrEqual(new Date(shortWindowExam.endTime).getTime());
    });

    test('rejects attempt start for future exam with 403 EXAM_NOT_ACTIVE', async () => {
      const res = await request(app)
        .post(`/api/exams/${futureExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EXAM_NOT_ACTIVE');
    });

    test('rejects attempt start for expired exam with 403 EXAM_NOT_ACTIVE', async () => {
      const res = await request(app)
        .post(`/api/exams/${expiredExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EXAM_NOT_ACTIVE');
    });

    test('rejects attempt start by Administrator with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/exams/${activeExam.id}/attempts`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('rejects unauthenticated request with 401', async () => {
      const res = await request(app).post(`/api/exams/${activeExam.id}/attempts`);
      expect(res.status).toBe(401);
    });

    test('returns 404 for nonexistent exam ID', async () => {
      const res = await request(app)
        .post('/api/exams/exam99999/attempts')
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('FR-011: Prevent multiple active attempts per student per exam', () => {
    test('rejects second attempt while first attempt is active with 409 ACTIVE_ATTEMPT_EXISTS', async () => {
      // student1 already has an active attempt on activeExam from previous test
      const res = await request(app)
        .post(`/api/exams/${activeExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACTIVE_ATTEMPT_EXISTS');
    });

    test('allows different students to have active attempts for the same exam concurrently', async () => {
      const res = await request(app)
        .post(`/api/exams/${activeExam.id}/attempts`)
        .set('Authorization', `Bearer ${student2Token}`);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('active');
    });

    test('allows a student to start an attempt on a different exam concurrently', async () => {
      const anotherExam = await Exam.create({
        title: 'Concurrent Different Exam',
        category: 'Algorithms',
        durationMinutes: 15,
        questionCount: 3,
        startTime: new Date(Date.now() - 10000),
        endTime: new Date(Date.now() + 3600000),
      });

      const res = await request(app)
        .post(`/api/exams/${anotherExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(201);
    });

    test('allows new attempt if previous attempt on same exam has expired', async () => {
      const expiryExam = await Exam.create({
        title: 'Expiry Test Exam',
        category: 'Algorithms',
        durationMinutes: 10,
        questionCount: 2,
        startTime: new Date(Date.now() - 100000),
        endTime: new Date(Date.now() + 3600000),
      });

      // Start attempt 1
      const res1 = await request(app)
        .post(`/api/exams/${expiryExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);
      expect(res1.status).toBe(201);

      // Fast forward: expire attempt 1
      const stored = Attempt.__store.find((a) => a.id === res1.body.attemptId);
      stored.expiresAt = new Date(Date.now() - 1000);

      // Start attempt 2 -> allowed because previous active attempt expired
      const res2 = await request(app)
        .post(`/api/exams/${expiryExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res2.status).toBe(201);
    });
  });

  describe('GET /api/attempts/:id (Get Attempt State)', () => {
    let attemptId;

    beforeAll(async () => {
      const examForGet = await Exam.create({
        title: 'Get Attempt Exam',
        category: 'Algorithms',
        durationMinutes: 25,
        questionCount: 3,
        startTime: new Date(Date.now() - 10000),
        endTime: new Date(Date.now() + 3600000),
      });
      const res = await request(app)
        .post(`/api/exams/${examForGet.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);
      attemptId = res.body.attemptId;
    });

    test('returns attempt details and remaining time for the student who owns it', async () => {
      const res = await request(app)
        .get(`/api/attempts/${attemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.attemptId).toBe(attemptId);
      expect(res.body.status).toBe('active');
      expect(res.body).toHaveProperty('remainingSeconds');
      expect(res.body).toHaveProperty('deadline');
      expect(res.body.questions).toHaveLength(3);
      res.body.questions.forEach((q) => {
        expect(q).not.toHaveProperty('correctOption');
      });
    });

    test('rejects other students trying to access an attempt with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get(`/api/attempts/${attemptId}`)
        .set('Authorization', `Bearer ${student2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('returns 404 for nonexistent attempt ID', async () => {
      const res = await request(app)
        .get('/api/attempts/attempt9999')
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('returns 404 for malformed attempt ID (no 500 crash)', async () => {
      const res = await request(app)
        .get('/api/attempts/invalid-id-xyz')
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});
