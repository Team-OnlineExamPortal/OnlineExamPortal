'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { Attempt, ROLES } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { HttpError, asyncHandler } = require('./errors');
const { gradeAttempt } = require('./grading');

async function finalizeAttempt(id) {
  for (let retry = 0; retry < 5; retry += 1) {
    const attempt = await Attempt.findById(id).select('+gradingSnapshot');
    if (!attempt) throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
    if (attempt.result) return attempt.result;
    const score = await gradeAttempt(attempt);
    const now = new Date();
    const completedAt = new Date(Math.min(now.getTime(), new Date(attempt.expiresAt).getTime()));
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
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
  const attempt = await Attempt.findOne({ _id: req.params.id, studentId: req.user.userId });
  if (!attempt) throw new HttpError(404, 'NOT_FOUND', 'Attempt not found');
  res.json({ ...(await finalizeAttempt(req.params.id)), status: 'submitted' });
}));

module.exports = { router, finalizeAttempt };
