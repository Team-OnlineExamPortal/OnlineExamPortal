'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { Attempt, ROLES } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { HttpError, asyncHandler } = require('./errors');
const { gradeAttempt } = require('./grading');

async function finalizeAttempt(id) {
  for (let retry = 0; retry < 5; retry += 1) {
    const query = Attempt.findById(id);
    const attempt = typeof query?.select === 'function' ? await query.select('+gradingSnapshot') : await query;
    if (!attempt) throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
    if (attempt.result) return attempt.result;
    const score = await gradeAttempt(attempt);
    const now = new Date();
    const completedAt = attempt.submittedAt ||
      new Date(Math.min(now.getTime(), new Date(attempt.expiresAt).getTime()));
    const result = {
      resultId: String(attempt._id), attemptId: String(attempt._id),
      examId: String(attempt.examId), studentId: String(attempt.studentId),
      examTitle: attempt.examTitle || 'Exam', completedAt, status: 'Completed', ...score,
    };
    // One document write commits both final status and result. Version matching
    // serializes this write with answer saves, so a concurrent save is included
    // on retry or rejected after submission.
    const saved = await Attempt.findOneAndUpdate(
      { _id: id, __v: attempt.__v, result: { $exists: false } },
      { $set: { status: 'submitted', submittedAt: completedAt, result }, $inc: { __v: 1 } },
      { new: true }
    );
    if (saved) return saved.result;
  }
  throw new HttpError(409, 'ATTEMPT_BUSY', 'The attempt changed during submission; retry submission');
}

const router = express.Router();
router.post('/:id/submit', authenticate, requireRole(ROLES.STUDENT), asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isObjectIdOrHexString(id) && !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
  }
  let attempt = null;
  try {
    attempt = await Attempt.findById(id);
  } catch (err) {
    if (err.name === 'CastError' || err.kind === 'ObjectId') {
      throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
    }
    throw err;
  }
  if (!attempt) throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
  if (String(attempt.studentId) !== String(req.user.userId)) {
    throw new HttpError(403, 'FORBIDDEN', 'Access denied to this attempt');
  }
  const isDuplicate = Boolean(attempt.result || attempt.status === 'submitted');
  const isAutoSubmitted = new Date() > new Date(attempt.expiresAt);
  const finalized = await finalizeAttempt(id);
  res.json({
    ...finalized,
    status: 'submitted',
    submittedAt: finalized.completedAt,
    answersCount: Object.keys(attempt.answers || {}).length,
    ...(isDuplicate ? { alreadySubmitted: true } : {}),
    ...(isAutoSubmitted ? { autoSubmitted: true } : {}),
  });
}));

module.exports = { router, finalizeAttempt };
