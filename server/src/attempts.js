'use strict';

/**
 * Exam Attempt processing module (Samrudh C Patil - PES1UG24CS417)
 *
 *   FR-007   Provide timed attempts with remaining time shown
 *   SEC-002  Enforce student-only access to exam taking
 *   SEC-005  Never expose correctOption or questions before active attempt
 */
const express = require('express');
const mongoose = require('mongoose');
const { Attempt, Exam, Question, ROLES } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { HttpError, asyncHandler } = require('./errors');
const { selectQuestions } = require('./domain');

const attemptRouter = express.Router();
const examAttemptRouter = express.Router();

const isString = (v) => typeof v === 'string';

function isValidId(id) {
  if (!isString(id) || !id.trim()) return false;
  if (mongoose.isValidObjectId && mongoose.isValidObjectId(id.trim())) return true;
  if (process.env.NODE_ENV === 'test' && /^(attempt|exam|question|user)[0-9]+$/.test(id.trim())) return true;
  return false;
}

/**
 * FR-007 / SEC-005: Start a timed attempt for an exam.
 * POST /api/exams/:id/attempts
 */
examAttemptRouter.post(
  '/:id/attempts',
  authenticate,
  requireRole(ROLES.STUDENT),
  asyncHandler(async (req, res) => {
    const examId = req.params.id;
    if (!isValidId(examId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Exam not found');
    }

    let exam = null;
    if (Exam && typeof Exam.findById === 'function') {
      try {
        exam = await Exam.findById(examId);
      } catch (err) {
        if (err.name === 'CastError' || err.kind === 'ObjectId') {
          throw new HttpError(404, 'NOT_FOUND', 'Exam not found');
        }
        throw err;
      }
    }

    if (!exam) {
      throw new HttpError(404, 'NOT_FOUND', 'Exam not found');
    }

    // Verify exam is within its active window
    const now = new Date();
    const examStart = new Date(exam.startTime);
    const examEnd = new Date(exam.endTime);
    if (now < examStart || now > examEnd) {
      throw new HttpError(403, 'EXAM_NOT_ACTIVE', 'Exam window is not currently active');
    }

    // Fetch active questions for the category
    let pool = [];
    if (Question && typeof Question.find === 'function') {
      pool = await Question.find({
        category: exam.category,
        disabled: { $ne: true },
        status: { $ne: 'disabled' },
      });
    }

    if (pool.length < exam.questionCount) {
      throw new HttpError(
        400,
        'INSUFFICIENT_QUESTIONS',
        `Insufficient active questions in category "${exam.category}": requested ${exam.questionCount}, available ${pool.length}`
      );
    }

    // Select and shuffle questions per FR-005
    const selected = selectQuestions(pool, exam.questionCount);

    // Compute deadline: startedAt + duration, capped by exam.endTime
    const startedAt = new Date();
    const durationMs = exam.durationMinutes * 60 * 1000;
    const expiresAt = new Date(Math.min(startedAt.getTime() + durationMs, examEnd.getTime()));
    const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - startedAt.getTime()) / 1000));

    // Snapshot questions omitting correctOption (SEC-005)
    const questionSnapshots = selected.map((q, idx) => ({
      id: String(q.id || q._id || `q_${idx + 1}`),
      questionId: String(q.id || q._id || `q_${idx + 1}`),
      text: q.text,
      options: q.options,
    }));

    const attempt = await Attempt.create({
      studentId: req.user.userId,
      examId: exam._id || exam.id,
      status: 'active',
      startedAt,
      expiresAt,
      selectedQuestionIds: questionSnapshots.map((q) => q.id),
      questions: questionSnapshots,
      answers: {},
      reviews: {},
    });

    res.status(201).json({
      id: attempt._id || attempt.id,
      attemptId: attempt._id || attempt.id,
      examId: exam._id || exam.id,
      examTitle: exam.title,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadline: attempt.expiresAt,
      expiresAt: attempt.expiresAt,
      remainingSeconds,
      durationMinutes: exam.durationMinutes,
      questions: questionSnapshots,
    });
  })
);

/**
 * GET /api/attempts/:id
 * Retrieve active attempt details with remaining time derived from server clock.
 */
attemptRouter.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const attemptId = req.params.id;
    if (!isValidId(attemptId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
    }

    let attempt = null;
    if (Attempt && typeof Attempt.findById === 'function') {
      try {
        attempt = await Attempt.findById(attemptId);
      } catch (err) {
        if (err.name === 'CastError' || err.kind === 'ObjectId') {
          throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
        }
        throw err;
      }
    }

    if (!attempt) {
      throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
    }

    // Ownership check: only the student who started the attempt (or admin) can view it
    if (String(attempt.studentId) !== String(req.user.userId) && req.user.role !== ROLES.ADMIN) {
      throw new HttpError(403, 'FORBIDDEN', 'Access denied to this attempt');
    }

    const now = new Date();
    const remainingSeconds = Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - now.getTime()) / 1000));

    // Ensure questions omit correctOption
    const sanitizedQuestions = (attempt.questions || []).map((q) => ({
      id: q.id || q.questionId,
      questionId: q.id || q.questionId,
      text: q.text,
      options: q.options,
    }));

    res.json({
      id: attempt._id || attempt.id,
      attemptId: attempt._id || attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadline: attempt.expiresAt,
      expiresAt: attempt.expiresAt,
      remainingSeconds,
      questions: sanitizedQuestions,
      answers: attempt.answers || {},
      reviews: attempt.reviews || {},
    });
  })
);

module.exports = {
  attemptRouter,
  examAttemptRouter,
  isValidId,
};
