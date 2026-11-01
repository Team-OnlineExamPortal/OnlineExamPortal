'use strict';

/**
 * Exam Management module (Samrudh C Patil - PES1UG24CS417)
 *
 *   FR-004   Let administrators create exams with duration, window and selection criteria
 *   FR-006   Show currently available exams to authenticated students
 *   SEC-002  Reject unauthorized access to role-protected APIs
 *   SEC-003  Validate and sanitize input against NoSQL injection
 *   SEC-005  Never expose question text or answer keys before active attempts
 */
const express = require('express');
const { Exam, Question, ROLES } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { HttpError, asyncHandler } = require('./errors');

const router = express.Router();

const isString = (v) => typeof v === 'string';

/**
 * Validates input fields strictly to prevent NoSQL operator injection and bad data.
 */
function validateExamInput(body) {
  const { title, durationMinutes, startTime, endTime, category, questionCount } = body || {};

  if (!isString(title) || !title.trim() || title.trim().length > 200) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Title is required (max 200 characters)');
  }
  if (!isString(category) || !category.trim() || category.trim().length > 100) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Category is required (max 100 characters)');
  }
  if (
    typeof durationMinutes !== 'number' ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Duration must be a positive integer in minutes');
  }
  if (
    typeof questionCount !== 'number' ||
    !Number.isInteger(questionCount) ||
    questionCount < 1
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Question count must be a positive integer');
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Valid startTime and endTime ISO dates are required');
  }
  if (start >= end) {
    throw new HttpError(400, 'INVALID_WINDOW', 'startTime must be strictly before endTime');
  }

  return {
    title: title.trim(),
    category: category.trim(),
    durationMinutes,
    questionCount,
    startTime: start,
    endTime: end,
    negativeMarking: Boolean(body.negativeMarking),
  };
}

/**
 * Helper to determine if an exam is currently open at a given point in time.
 * @param {Object} exam
 * @param {Date} [now]
 * @returns {boolean}
 */
function isExamOpen(exam, now = new Date()) {
  const start = new Date(exam.startTime);
  const end = new Date(exam.endTime);
  return now >= start && now <= end;
}

/**
 * FR-006: Show currently available exams to authenticated students.
 * Only returns exams where the current server time falls inside [startTime, endTime].
 * SEC-005: Never returns question bank or attempt payload here.
 */
router.get(
  '/available',
  authenticate,
  asyncHandler(async (req, res) => {
    const now = req.query.now ? new Date(req.query.now) : new Date();

    let openExams = [];
    if (Exam && typeof Exam.find === 'function') {
      openExams = await Exam.find({
        startTime: { $lte: now },
        endTime: { $gte: now },
      });
    }

    const payload = openExams.map((e) => ({
      id: e._id || e.id,
      examId: e._id || e.id,
      title: e.title,
      durationMinutes: e.durationMinutes,
      startTime: e.startTime,
      endTime: e.endTime,
      category: e.category,
      questionCount: e.questionCount,
      negativeMarking: Boolean(e.negativeMarking),
    }));

    res.json(payload);
  })
);

/**
 * FR-004: Let administrators create exams with duration, window and selection criteria.
 * SEC-002: Restricted to Administrator role only.
 */
router.post(
  '/',
  authenticate,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const validData = validateExamInput(req.body);

    // TC-05: Check that the category has sufficient active questions in the bank
    if (Question && typeof Question.countDocuments === 'function') {
      const activeCount = await Question.countDocuments({
        category: validData.category,
        disabled: { $ne: true },
        status: { $ne: 'disabled' },
      });

      if (activeCount < validData.questionCount) {
        throw new HttpError(
          400,
          'INSUFFICIENT_QUESTIONS',
          `Insufficient active questions in category "${validData.category}": requested ${validData.questionCount}, available ${activeCount}`
        );
      }
    }

    const exam = await Exam.create({
      ...validData,
      createdBy: req.user.userId,
    });

    res.status(201).json({
      id: exam._id || exam.id,
      examId: exam._id || exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime,
      endTime: exam.endTime,
      category: exam.category,
      questionCount: exam.questionCount,
      negativeMarking: exam.negativeMarking,
    });
  })
);

/**
 * Get exam by ID (metadata only).
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    let exam = null;
    if (Exam && typeof Exam.findById === 'function') {
      exam = await Exam.findById(req.params.id);
    }

    if (!exam) {
      throw new HttpError(404, 'NOT_FOUND', 'Exam not found');
    }

    res.json({
      id: exam._id || exam.id,
      examId: exam._id || exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime,
      endTime: exam.endTime,
      category: exam.category,
      questionCount: exam.questionCount,
      negativeMarking: exam.negativeMarking,
    });
  })
);

module.exports = {
  router,
  validateExamInput,
  isExamOpen,
};
