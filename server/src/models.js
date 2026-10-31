'use strict';

/**
 * Mongoose models.
 *
 * Only the User model lives here for now (Auth/Admin module).
 * Teammates: add Question, Exam, Attempt and Result schemas to this file
 * (SAD 3.5 data design) and export them alongside User.
 */
const mongoose = require('mongoose');

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
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = { User, USER_STATUS };