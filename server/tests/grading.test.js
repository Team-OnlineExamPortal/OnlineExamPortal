'use strict';
jest.mock('../src/models', () => ({ Exam: { findById: jest.fn() }, Question: { find: jest.fn() } }));
const { gradeAttempt } = require('../src/grading');
const { Exam, Question } = require('../src/models');

test('scores correct, wrong and unanswered choices using immutable private keys', async () => {
  const questions = ['a', 'b', 'c'].map((id) => ({ id, options: ['no', 'yes'], correctOption: 1 }));
  const attempt = { answers: { a: '1', b: '0' }, gradingSnapshot: { questions, settings: { negativeMarking: true, negativeMarkingPenalty: 0.25 } } };
  expect(await gradeAttempt(attempt)).toEqual({ score: 0.75, correctCount: 1, incorrectCount: 1, unansweredCount: 1, maximumScore: 3 });
  expect(Question.find).not.toHaveBeenCalled();
});

test('grades a legacy attempt and refuses changed option order', async () => {
  Question.find.mockResolvedValue([{ _id: 'q', options: ['no', 'yes'], correctOption: 1 }]);
  Exam.findById.mockResolvedValue({ negativeMarking: false });
  const attempt = { selectedQuestionIds: ['q'], questions: [{ id: 'q', options: ['no', 'yes'] }], answers: { q: '1' } };
  expect((await gradeAttempt(attempt)).score).toBe(1);
  attempt.questions[0].options.reverse();
  await expect(gradeAttempt(attempt)).rejects.toMatchObject({ code: 'GRADING_UNAVAILABLE' });
});
