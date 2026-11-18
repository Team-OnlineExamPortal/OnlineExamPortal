'use strict';

/**
 * Exam Attempt processing module (Samrudh C Patil - PES1UG24CS417)
 *
 *   FR-007   Provide timed attempts with remaining time shown
 *   FR-011   Prevent two active attempts by one student for the same exam
 *   FR-009   Automatically save selected answers during an active exam
 *   FR-008   Allow navigation and mark for review
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
 * FR-007 / FR-011 / SEC-005: Start a timed attempt for an exam.
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

    // FR-011: Prevent two active attempts by the same student for the same exam
    if (Attempt && typeof Attempt.findOne === 'function') {
      const existingAttempt = await Attempt.findOne({
        studentId: req.user.userId,
        examId: exam._id || exam.id,
        status: 'active',
      });

      if (existingAttempt) {
        // If the existing active attempt has passed its deadline, transition to expired
        if (now > new Date(existingAttempt.expiresAt)) {
          existingAttempt.status = 'expired';
          if (typeof existingAttempt.save === 'function') {
            await existingAttempt.save();
          }
        } else {
          throw new HttpError(
            409,
            'ACTIVE_ATTEMPT_EXISTS',
            'An active attempt is already in progress for this exam'
          );
        }
      }
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
    const selected = selectQuestions(
      pool.map((question) => typeof question.toObject === 'function' ? question.toObject() : question),
      exam.questionCount
    );

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

    let attempt;
    try {
      attempt = await Attempt.create({
        studentId: req.user.userId,
        examId: exam._id || exam.id,
        status: 'active',
        startedAt,
        expiresAt,
        selectedQuestionIds: questionSnapshots.map((q) => q.id),
        questions: questionSnapshots,
        examTitle: exam.title,
        gradingSnapshot: {
          questions: selected.map((q) => ({
            id: String(q.id || q._id), options: [...q.options], correctOption: q.correctOption,
          })),
          settings: { negativeMarking: Boolean(exam.negativeMarking) },
        },
        answers: {},
        reviews: {},
      });
    } catch (err) {
      if (err.code === 11000) {
        throw new HttpError(
          409,
          'ACTIVE_ATTEMPT_EXISTS',
          'An active attempt is already in progress for this exam'
        );
      }
      throw err;
    }

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

/**
 * FR-009 / FR-008: Save student answer choice and review flag during an active attempt.
 * PUT /api/attempts/:id/answers
 */
attemptRouter.put(
  '/:id/answers',
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

    // Ownership check: only the student who owns the attempt can save answers
    if (String(attempt.studentId) !== String(req.user.userId)) {
      throw new HttpError(403, 'FORBIDDEN', 'Access denied to this attempt');
    }

    // Status check
    if (attempt.status !== 'active') {
      throw new HttpError(
        409,
        'ATTEMPT_CLOSED',
        `Cannot save answers to an attempt with status "${attempt.status}"`
      );
    }

    // Timer deadline check (server clock)
    const now = new Date();
    if (now > new Date(attempt.expiresAt)) {
      attempt.status = 'expired';
      if (typeof attempt.save === 'function') {
        await attempt.save();
      }
      throw new HttpError(409, 'ATTEMPT_EXPIRED', 'Exam deadline has expired');
    }

    // Input validation
    const { questionId, optionId, review } = req.body || {};
    if (!isString(questionId) || !questionId.trim()) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'questionId is required');
    }

    const trimmedQuestionId = questionId.trim();

    // Verify question belongs to this attempt's snapshot
    const questionExists =
      (attempt.questions || []).some(
        (q) => String(q.id || q.questionId || q._id) === trimmedQuestionId
      ) ||
      (attempt.selectedQuestionIds || []).some(
        (qid) => String(qid) === trimmedQuestionId
      );

    if (!questionExists) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Question does not belong to this attempt'
      );
    }

    if (!attempt.answers) attempt.answers = {};
    if (!attempt.reviews) attempt.reviews = {};

    // Save selected answer choice (or remove if cleared with null)
    if (optionId !== undefined) {
      if (optionId === null) {
        delete attempt.answers[trimmedQuestionId];
      } else {
        attempt.answers[trimmedQuestionId] = String(optionId);
      }
    }

    // Save review mark if provided
    if (review !== undefined) {
      attempt.reviews[trimmedQuestionId] = Boolean(review);
    }

    if (typeof attempt.markModified === 'function') {
      attempt.markModified('answers');
      attempt.markModified('reviews');
    }

    if (typeof attempt.save === 'function') {
      await attempt.save();
    }

    const savedAt = now.toISOString();

    res.status(200).json({
      status: 'ok',
      savedAt,
      attemptId: attempt._id || attempt.id,
      questionId: trimmedQuestionId,
      answers: attempt.answers,
      reviews: attempt.reviews,
    });
  })
);

module.exports = {
  attemptRouter,
  examAttemptRouter,
  isValidId,
};
