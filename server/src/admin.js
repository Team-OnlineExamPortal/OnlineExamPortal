'use strict';
const express = require('express');
const { User, ROLES } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { asyncHandler } = require('./errors');
const router = express.Router();
router.get('/students', authenticate, requireRole(ROLES.ADMIN), asyncHandler(async (req, res) => {
  res.json(await User.find({ role: ROLES.STUDENT }).select('_id name email').sort({ name: 1 }));
}));
module.exports = { router };
