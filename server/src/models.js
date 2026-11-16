'use strict';

/**
 * Mongoose models.
 *
 * Schemas defined per SAD §3.5 data design.
 */
const mongoose = require('mongoose');

const ROLES = Object.freeze({
  STUDENT: 'Student',
  ADMIN: 'Administrator',
});

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  DISABLED: 'disabled',
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: true },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.STUDENT,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

// FR-004: Exam management schema
const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    durationMinutes: { type: Number, required: true, min: 1 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    category: { type: String, required: true, trim: true },
    questionCount: { type: Number, required: true, min: 1 },
    negativeMarking: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);

// FR-003: Question bank schema
const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    options: [{ type: String, required: true }],
    correctOption: { type: Number, required: true },
    category: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Question =
  mongoose.models.Question || mongoose.model('Question', questionSchema);

// SEC-005 & FR-007: An attempt authorizes a student to access assigned questions.
const attemptSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'submitted', 'expired'],
      default: 'active',
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    selectedQuestionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    questions: [
      {
        id: String,
        questionId: String,
        text: String,
        options: [mongoose.Schema.Types.Mixed],
      },
    ],
    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    reviews: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    submittedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// FR-011: Prevent two active attempts by one student for the same exam
attemptSchema.index(
  { studentId: 1, examId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

const Attempt =
  mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);

module.exports = {
  User,
  Exam,
  Question,
  Attempt,
  ROLES,
  USER_STATUS,
};
