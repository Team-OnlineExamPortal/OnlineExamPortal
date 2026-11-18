'use strict';

const { Exam, Question } = require('./models');
const { scoreAttempt } = require('./domain');
const { HttpError } = require('./errors');

async function gradeAttempt(attempt) {
  let snapshot = attempt.gradingSnapshot;
  if (!snapshot) {
    // Legacy attempts predate private answer-key snapshots. Require the bank's
    // option order to still match before using its answer keys.
    const bank = await Question.find({ _id: { $in: attempt.selectedQuestionIds } });
    const questions = (attempt.questions || []).map((q) => {
      const key = String(q.questionId || q.id);
      const stored = bank.find((item) => String(item._id || item.id) === key);
      if (!stored || JSON.stringify([...stored.options]) !== JSON.stringify([...q.options])) {
        throw new HttpError(409, 'GRADING_UNAVAILABLE', 'An original answer key is unavailable; administrator review is required');
      }
      return { id: key, options: [...q.options], correctOption: stored.correctOption };
    });
    if (!questions.length || questions.length !== attempt.selectedQuestionIds.length) {
      throw new HttpError(409, 'GRADING_UNAVAILABLE', 'The attempt question set is incomplete');
    }
    const exam = await Exam.findById(attempt.examId);
    if (!exam) throw new HttpError(409, 'GRADING_UNAVAILABLE', 'Exam configuration is unavailable');
    snapshot = { questions, settings: { negativeMarking: Boolean(exam.negativeMarking) } };
  }
  return scoreAttempt(snapshot.questions, attempt.answers, snapshot.settings);
}

module.exports = { gradeAttempt };
