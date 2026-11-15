'use strict';

const express = require('express');
const { isObjectIdOrHexString } = require('mongoose');
const { Question, ROLES, USER_STATUS } = require('./models');
const { authenticate, requireRole } = require('./auth');
const { HttpError, asyncHandler } = require('./errors');

const router = express.Router();
router.use(authenticate, requireRole(ROLES.ADMIN));

function validationError(message) {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw validationError(`${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value.trim();
}

function validateQuestion(body) {
  const { text, options, correctOption, category } = body || {};
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
    throw validationError('Provide between 2 and 10 answer options');
  }
  const answers = options.map((option) => requiredText(option, 'Option', 1000));
  if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption >= answers.length) {
    throw validationError('correctOption must be a zero-based index into options');
  }
  return {
    text: requiredText(text, 'Question text', 4000),
    options: answers,
    correctOption,
    category: requiredText(category, 'Category', 100),
  };
}

router.param('id', (req, res, next, id) => {
  if (!isObjectIdOrHexString(id)) {
    return next(new HttpError(404, 'NOT_FOUND', 'Question not found'));
  }
  return next();
});

router.get('/', asyncHandler(async (req, res) => {
  const { category } = req.query;
  const filter = category === undefined ? {} : { category: requiredText(category, 'Category', 100) };
  res.json(await Question.find(filter).sort({ category: 1, _id: 1 }));
}));

router.post('/', asyncHandler(async (req, res) => {
  const question = await Question.create(validateQuestion(req.body));
  res.status(201).json(question);
}));

async function updateQuestion(id, fields) {
  const question = await Question.findByIdAndUpdate(
    id, { $set: fields }, { new: true, runValidators: true }
  );
  if (!question) throw new HttpError(404, 'NOT_FOUND', 'Question not found');
  return question;
}

router.put('/:id', asyncHandler(async (req, res) => {
  res.json(await updateQuestion(req.params.id, validateQuestion(req.body)));
}));

router.patch('/:id/disable', asyncHandler(async (req, res) => {
  res.json(await updateQuestion(req.params.id, {
    status: USER_STATUS.DISABLED,
    disabled: true,
  }));
}));

module.exports = { router };
