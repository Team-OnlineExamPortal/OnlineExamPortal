'use strict';

/**
 * Tests for Exam Attempt processing module:
 *   TC-06 / FR-007   Provide timed attempts with remaining time shown
 *   FR-011           Prevent two active attempts by one student for the same exam
 *   FR-009           Automatically save selected answers during an active exam
 *   FR-008           Allow navigation and mark for review
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
    async findOneAndUpdate(query, update) {
      const attempt = attempts.find((a) => String(a.id) === String(query._id) || String(a._id) === String(query._id));
      if (!attempt || (query.status && attempt.status !== query.status) || attempt.result) return null;
      Object.assign(attempt, update.$set);
      return attempt;
    },
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
        answers: {},
        reviews: {},
        ...doc,
        async save() {
          return this;
        },
        markModified() {},
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

describe('FR-007 / FR-011 / FR-009 / FR-008: Timed Exam Attempts, Active Attempt Guard & Auto-Save', () => {
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

  describe('PUT /api/attempts/:id/answers (FR-009 / FR-008: Auto-Save Answers & Review Flags)', () => {
    let saveAttemptId, qId1, qId2;

    beforeAll(async () => {
      const examForSave = await Exam.create({
        title: 'Auto-Save Test Exam',
        category: 'Algorithms',
        durationMinutes: 45,
        questionCount: 3,
        startTime: new Date(Date.now() - 10000),
        endTime: new Date(Date.now() + 3600000),
      });

      const res = await request(app)
        .post(`/api/exams/${examForSave.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      saveAttemptId = res.body.attemptId;
      qId1 = res.body.questions[0].id;
      qId2 = res.body.questions[1].id;
    });

    test('successfully saves an answer choice for a question (200)', async () => {
      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: qId1,
          optionId: '1',
          review: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('savedAt');
      expect(res.body.answers[qId1]).toBe('1');
      expect(res.body.reviews[qId1]).toBe(false);
    });

    test('updates review mark for a question without altering the answer (FR-008)', async () => {
      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: qId1,
          review: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.answers[qId1]).toBe('1');
      expect(res.body.reviews[qId1]).toBe(true);
    });

    test('supports saving multiple distinct questions independently', async () => {
      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: qId2,
          optionId: '3',
          review: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.answers[qId1]).toBe('1');
      expect(res.body.answers[qId2]).toBe('3');
    });

    test('idempotently overrides prior answer choice (last-write-wins)', async () => {
      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: qId1,
          optionId: '2',
        });

      expect(res.status).toBe(200);
      expect(res.body.answers[qId1]).toBe('2');
    });

    test('clears answer when optionId is null', async () => {
      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: qId1,
          optionId: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.answers[qId1]).toBeUndefined();
    });

    test('rejects save attempt from unauthorized student with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student2Token}`)
        .send({
          questionId: qId1,
          optionId: '1',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('rejects save when questionId does not belong to the attempt with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: 'foreign-question-id',
          optionId: '0',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('rejects save when attempt has expired with 409 ATTEMPT_EXPIRED', async () => {
      const stored = Attempt.__store.find((a) => a.id === saveAttemptId);
      const originalExpiresAt = stored.expiresAt;
      // Expire the attempt
      stored.expiresAt = new Date(Date.now() - 5000);

      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: qId2,
          optionId: '1',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ATTEMPT_EXPIRED');

      // Restore expiresAt
      stored.expiresAt = originalExpiresAt;
      stored.status = 'active';
    });

    test('rejects save when attempt status is not active (e.g. submitted) with 409 ATTEMPT_CLOSED', async () => {
      const stored = Attempt.__store.find((a) => a.id === saveAttemptId);
      stored.status = 'submitted';

      const res = await request(app)
        .put(`/api/attempts/${saveAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: qId2,
          optionId: '1',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ATTEMPT_CLOSED');

      stored.status = 'active';
    });
  });

  describe('FR-008: Question Navigation and Mark for Review Persistence', () => {
    let navAttemptId;
    let questions;

    beforeEach(async () => {
      const exam = await Exam.create({
        title: 'FR-008 Navigation Exam',
        category: 'Algorithms',
        durationMinutes: 45,
        startTime: new Date(Date.now() - 5 * 60 * 1000),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        questionCount: 3,
        rules: { questionCount: 3 },
        status: 'published',
      });

      const res = await request(app)
        .post(`/api/exams/${exam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      navAttemptId = res.body.attemptId;
      questions = res.body.questions;
    });

    test('allows marking an unanswered question for review and retains flag across navigation', async () => {
      const q1 = questions[0].id;

      // Student flags question 1 for review without selecting an option
      const markRes = await request(app)
        .put(`/api/attempts/${navAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          questionId: q1,
          review: true,
        });

      expect(markRes.status).toBe(200);
      expect(markRes.body.reviews[q1]).toBe(true);
      expect(markRes.body.answers[q1]).toBeUndefined();

      // Student navigates: fetches attempt to simulate navigating back to question 1
      const getRes = await request(app)
        .get(`/api/attempts/${navAttemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.reviews[q1]).toBe(true);
      expect(getRes.body.answers[q1]).toBeUndefined();
    });

    test('toggles review flag on and off for an answered question while preserving the answer choice', async () => {
      const q2 = questions[1].id;

      // 1. Answer question 2
      await request(app)
        .put(`/api/attempts/${navAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q2, optionId: '0' });

      // 2. Mark question 2 for review
      const markRes = await request(app)
        .put(`/api/attempts/${navAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q2, review: true });

      expect(markRes.status).toBe(200);
      expect(markRes.body.answers[q2]).toBe('0');
      expect(markRes.body.reviews[q2]).toBe(true);

      // 3. Unmark question 2 from review
      const unmarkRes = await request(app)
        .put(`/api/attempts/${navAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q2, review: false });

      expect(unmarkRes.status).toBe(200);
      expect(unmarkRes.body.answers[q2]).toBe('0');
      expect(unmarkRes.body.reviews[q2]).toBe(false);

      // 4. Verify persisted state on GET
      const getRes = await request(app)
        .get(`/api/attempts/${navAttemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(getRes.body.answers[q2]).toBe('0');
      expect(getRes.body.reviews[q2]).toBe(false);
    });

    test('preserves entire navigation state across multiple questions with mixed answered and reviewed status', async () => {
      const [q0, q1, q2] = questions.map((q) => q.id);

      // Question 0: answered, not marked for review
      await request(app)
        .put(`/api/attempts/${navAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q0, optionId: '2', review: false });

      // Question 1: answered AND marked for review
      await request(app)
        .put(`/api/attempts/${navAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q1, optionId: '1', review: true });

      // Question 2: not answered, marked for review
      await request(app)
        .put(`/api/attempts/${navAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q2, review: true });

      // Fetch attempt (simulating client navigation panel state sync)
      const res = await request(app)
        .get(`/api/attempts/${navAttemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.answers[q0]).toBe('2');
      expect(res.body.reviews[q0]).toBe(false);

      expect(res.body.answers[q1]).toBe('1');
      expect(res.body.reviews[q1]).toBe(true);

      expect(res.body.answers[q2]).toBeUndefined();
      expect(res.body.reviews[q2]).toBe(true);

      // Questions are returned in stable sequence for client indexing
      expect(res.body.questions).toHaveLength(3);
      expect(res.body.questions.map((q) => q.id)).toEqual([q0, q1, q2]);
    });
  });

  describe('FR-010: Explicit and Deadline Auto-Submission (POST /api/attempts/:id/submit)', () => {
    let submitAttemptId;

    beforeEach(async () => {
      const exam = await Exam.create({
        title: 'FR-010 Submission Exam',
        category: 'Algorithms',
        durationMinutes: 30,
        startTime: new Date(Date.now() - 5 * 60 * 1000),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        questionCount: 2,
        rules: { questionCount: 2 },
        status: 'published',
      });

      const startRes = await request(app)
        .post(`/api/exams/${exam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      submitAttemptId = startRes.body.attemptId;
      const q1 = startRes.body.questions[0].id;

      // Student answers question 1
      await request(app)
        .put(`/api/attempts/${submitAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q1, optionId: '1' });
    });

    test('explicit submission marks attempt submitted and records submittedAt (200)', async () => {
      const res = await request(app)
        .post(`/api/attempts/${submitAttemptId}/submit`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('submitted');
      expect(res.body.attemptId).toBe(submitAttemptId);
      expect(res.body).toHaveProperty('submittedAt');
      expect(res.body.answersCount).toBe(1);

      // Verify in store
      const stored = Attempt.__store.find((a) => a.id === submitAttemptId);
      expect(stored.status).toBe('submitted');
      expect(stored.submittedAt).toBeTruthy();
    });

    test('submission is idempotent on duplicate submit calls (200)', async () => {
      // First submit
      await request(app)
        .post(`/api/attempts/${submitAttemptId}/submit`)
        .set('Authorization', `Bearer ${student1Token}`);

      // Second duplicate submit (e.g. rapid double-click or simultaneous timer)
      const res2 = await request(app)
        .post(`/api/attempts/${submitAttemptId}/submit`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('submitted');
      expect(res2.body.alreadySubmitted).toBe(true);
    });

    test('locks attempt after submission: rejects further answer modifications (409 ATTEMPT_CLOSED)', async () => {
      await request(app)
        .post(`/api/attempts/${submitAttemptId}/submit`)
        .set('Authorization', `Bearer ${student1Token}`);

      const stored = Attempt.__store.find((a) => a.id === submitAttemptId);
      const q2 = stored.questions[1].id;

      const answerRes = await request(app)
        .put(`/api/attempts/${submitAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: q2, optionId: '0' });

      expect(answerRes.status).toBe(409);
      expect(answerRes.body.code).toBe('ATTEMPT_CLOSED');
    });

    test('auto-submits an attempt whose deadline has elapsed (200, autoSubmitted: true)', async () => {
      const stored = Attempt.__store.find((a) => a.id === submitAttemptId);
      // Simulate timer expiration on the server clock
      stored.expiresAt = new Date(Date.now() - 1000);

      const res = await request(app)
        .post(`/api/attempts/${submitAttemptId}/submit`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('submitted');
      expect(res.body.autoSubmitted).toBe(true);
      expect(stored.status).toBe('submitted');
    });

    test('lazy auto-expiry: GET /api/attempts/:id lazily marks active attempt expired after deadline', async () => {
      const stored = Attempt.__store.find((a) => a.id === submitAttemptId);
      stored.expiresAt = new Date(Date.now() - 2000);

      const res = await request(app)
        .get(`/api/attempts/${submitAttemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('expired');
      expect(res.body.remainingSeconds).toBe(0);
      expect(stored.status).toBe('expired');
    });

    test('rejects submission from unauthorized student with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/attempts/${submitAttemptId}/submit`)
        .set('Authorization', `Bearer ${student2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('rejects submission with 404 for invalid attempt ID', async () => {
      const res = await request(app)
        .post('/api/attempts/not-a-valid-id/submit')
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('NFR-004: Student Reconnect Recovery (< 1 min State Restoration)', () => {
    let reconnectExam;
    let reconnectAttemptId;
    let qIds;

    beforeEach(async () => {
      reconnectExam = await Exam.create({
        title: 'NFR-004 Reconnect Exam',
        category: 'Algorithms',
        durationMinutes: 30,
        startTime: new Date(Date.now() - 5 * 60 * 1000),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        questionCount: 3,
        rules: { questionCount: 3 },
        status: 'published',
      });

      const startRes = await request(app)
        .post(`/api/exams/${reconnectExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      reconnectAttemptId = startRes.body.attemptId;
      qIds = startRes.body.questions.map((q) => q.id);

      // Save an initial answer and a review mark before simulated disconnect
      await request(app)
        .put(`/api/attempts/${reconnectAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: qIds[0], optionId: '1', review: false });

      await request(app)
        .put(`/api/attempts/${reconnectAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: qIds[1], review: true });
    });

    test('reconnects and restores complete attempt state without data loss', async () => {
      // Simulate client re-establishing connection and fetching saved attempt
      const res = await request(app)
        .get(`/api/attempts/${reconnectAttemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.attemptId).toBe(reconnectAttemptId);
      expect(res.body.status).toBe('active');
      expect(res.body.remainingSeconds).toBeGreaterThan(0);

      // Snapshot order and question content are identical
      expect(res.body.questions.map((q) => q.id)).toEqual(qIds);

      // Answers and review flags are completely restored
      expect(res.body.answers[qIds[0]]).toBe('1');
      expect(res.body.reviews[qIds[1]]).toBe(true);
      expect(res.body.answers[qIds[2]]).toBeUndefined();
    });

    test('replays and merges offline retry-queue answers upon reconnection', async () => {
      // Simulate offline retry queue replaying question 2 answer and updating question 0
      const replayRes1 = await request(app)
        .put(`/api/attempts/${reconnectAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ questionId: qIds[2], optionId: '3', review: false });

      expect(replayRes1.status).toBe(200);
      expect(replayRes1.body.answers[qIds[2]]).toBe('3');

      // Verify merged state on server
      const getRes = await request(app)
        .get(`/api/attempts/${reconnectAttemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(getRes.body.answers[qIds[0]]).toBe('1');
      expect(getRes.body.reviews[qIds[1]]).toBe(true);
      expect(getRes.body.answers[qIds[2]]).toBe('3');
    });

    test('prevents starting a duplicate attempt on reconnect (FR-011 / NFR-004)', async () => {
      const dupRes = await request(app)
        .post(`/api/exams/${reconnectExam.id}/attempts`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe('ACTIVE_ATTEMPT_EXISTS');
    });

    test('restores attempt as expired if reconnect occurs after deadline has passed', async () => {
      const stored = Attempt.__store.find((a) => a.id === reconnectAttemptId);
      stored.expiresAt = new Date(Date.now() - 10000);

      const res = await request(app)
        .get(`/api/attempts/${reconnectAttemptId}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('expired');
      expect(res.body.remainingSeconds).toBe(0);
      // Saved answers are preserved even when expired
      expect(res.body.answers[qIds[0]]).toBe('1');
    });
  });
});
