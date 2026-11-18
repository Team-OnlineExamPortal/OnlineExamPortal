'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { Attempt, ROLES } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { HttpError, asyncHandler } = require('./errors');
const router = express.Router();
router.use(authenticate, requireRole(ROLES.ADMIN));

function report(field) {
  return asyncHandler(async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw new HttpError(404, 'NOT_FOUND', 'Report not found');
    const filter = { [field]: new mongoose.Types.ObjectId(req.params.id), result: { $exists: true } };
    const rows = await Attempt.find(filter).select('result').sort({ submittedAt: -1 }).lean();
    const results = rows.map((attempt) => attempt.result);
    res.json({
      results, count: results.length,
      averageScore: results.length ? results.reduce((sum, result) => sum + result.score, 0) / results.length : null,
      totalMaximumScore: results.reduce((sum, result) => sum + result.maximumScore, 0),
      totalScore: results.reduce((sum, result) => sum + result.score, 0),
    });
  });
}
router.get('/exams/:id', report('examId'));
router.get('/students/:id', report('studentId'));
module.exports = { router };
