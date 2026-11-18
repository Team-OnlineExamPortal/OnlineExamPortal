'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { Attempt, ROLES } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { HttpError, asyncHandler } = require('./errors');
const { finalizeAttempt } = require('./submissions');

const router = express.Router();
router.use(authenticate, requireRole(ROLES.STUDENT));
router.get('/me', asyncHandler(async (req, res) => {
  const studentId = req.user.userId;
  const overdue = await Attempt.find({
    studentId, result: { $exists: false },
    $or: [{ expiresAt: { $lte: new Date() } }, { status: 'submitted' }],
  }).select('_id');
  for (const attempt of overdue) await finalizeAttempt(attempt._id);
  const attempts = await Attempt.find({ studentId, result: { $exists: true } })
    .select('result').sort({ submittedAt: -1, _id: -1 }).lean();
  res.json(attempts.map((attempt) => attempt.result));
}));
router.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw new HttpError(404, 'NOT_FOUND', 'Result not found');
  const attempt = await Attempt.findOne({
    _id: req.params.id, studentId: req.user.userId, result: { $exists: true },
  }).select('result').lean();
  if (!attempt) throw new HttpError(404, 'NOT_FOUND', 'Result not found');
  res.json(attempt.result);
}));
module.exports = { router };
