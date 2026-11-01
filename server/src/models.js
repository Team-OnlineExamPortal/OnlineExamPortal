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
    // FR-001: unique email. Stored lower-cased; the unique index is the final
    // guard against two simultaneous registrations with the same address.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // SEC-001: only the bcrypt hash is ever stored.
    passwordHash: { type: String, required: true, select: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.STUDENT, required: true },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

// FR-004: Exam management schema (SAD §3.5)
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

// FR-003: Question bank schema (SAD §3.5)
const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    options: [{ type: String, required: true }],
    correctOption: { type: Number, required: true },
    category: { type: String, required: true, trim: true },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Question = mongoose.models.Question || mongoose.model('Question', questionSchema);

module.exports = { User, Exam, Question, ROLES, USER_STATUS };
