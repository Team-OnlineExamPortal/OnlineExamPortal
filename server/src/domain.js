'use strict';

/**
 * Framework-independent exam algorithms. Keep this module free of Express,
 * Mongoose, I/O, and implicit clocks so it can be tested as pure logic.
 */

function assertRng(rng) {
  if (typeof rng !== 'function') throw new TypeError('Random source must be a function');
}

/** Fisher-Yates shuffle. Returns a new array and accepts an injectable RNG. */
function shuffle(array, rng = Math.random) {
  if (!Array.isArray(array)) throw new TypeError('Array to shuffle must be an array');
  assertRng(rng);
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const value = rng();
    if (typeof value !== 'number' || value < 0 || value >= 1 || !Number.isFinite(value)) {
      throw new RangeError('Random source must return a finite number in [0, 1)');
    }
    const j = Math.floor(value * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Select an active shuffled question subset without mutating inputs. */
function selectQuestions(questions, count, options = {}) {
  if (!Array.isArray(questions)) throw new TypeError('Questions must be an array');
  if (!Number.isInteger(count) || count < 1) throw new Error('Question count must be a positive integer');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Options must be an object');
  const rng = options.rng === undefined ? Math.random : options.rng;
  assertRng(rng);
  const activeQuestions = questions.filter((question) => question && !question.disabled && question.status !== 'disabled');
  if (activeQuestions.length < count) {
    const error = new Error(`Insufficient active questions: requested ${count}, available ${activeQuestions.length}`);
    error.code = 'INSUFFICIENT_QUESTIONS';
    throw error;
  }
  return shuffle(activeQuestions, rng).slice(0, count).map((question) => {
    const clone = { ...question };
    if (options.shuffleOptions && Array.isArray(clone.options)) clone.options = shuffle(clone.options, rng);
    return clone;
  });
}

function questionKey(question, index) {
  return String(question.questionId || question.id || question._id || index);
}

function answerFor(answers, key) {
  if (Array.isArray(answers)) {
    return answers.find((answer) => answer && String(answer.questionId || answer.id) === key);
  }
  return Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : undefined;
}

function selectedOptionIndex(question, answer) {
  let selected = answer;
  if (answer && typeof answer === 'object') {
    selected = answer.optionId ?? answer.optionIndex ?? answer.answer;
  }
  if (selected === undefined || selected === null || selected === '') return -1;
  const options = question.options;
  if (typeof selected === 'number' && Number.isInteger(selected)) return selected;
  const value = String(selected);
  if (/^\d+$/.test(value)) return Number(value);
  const index = options.findIndex((option) => {
    if (typeof option === 'string') return option === value;
    return option && String(option.optionId || option.id) === value;
  });
  return index < 0 ? -2 : index;
}

/**
 * Score multiple-choice questions without application/framework dependencies.
 * Defaults: +1 for correct, 0 for unanswered, and -1 for a wrong answer when
 * negative marking is enabled. The negative penalty can be configured per call.
 */
function scoreAttempt(questions, answers, settings = {}) {
  if (!Array.isArray(questions)) throw new TypeError('Questions must be an array');
  if (answers !== undefined && answers !== null && !Array.isArray(answers) && (typeof answers !== 'object')) {
    throw new TypeError('Answers must be an array or object');
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new TypeError('Scoring settings must be an object');

  const pointsPerQuestion = settings.pointsPerQuestion === undefined ? 1 : settings.pointsPerQuestion;
  const negativeMarkingPenalty = settings.negativeMarkingPenalty === undefined ? 1 : settings.negativeMarkingPenalty;
  if (!Number.isFinite(pointsPerQuestion) || pointsPerQuestion <= 0) throw new RangeError('Points per question must be a positive finite number');
  if (!Number.isFinite(negativeMarkingPenalty) || negativeMarkingPenalty < 0) throw new RangeError('Negative marking penalty must be a non-negative finite number');

  let score = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  questions.forEach((question, index) => {
    if (!question || !Array.isArray(question.options) || !Number.isInteger(question.correctOption) || question.correctOption < 0 || question.correctOption >= question.options.length) {
      throw new TypeError(`Question at index ${index} has invalid options or correctOption`);
    }
    const answer = answerFor(answers || {}, questionKey(question, index));
    const selected = selectedOptionIndex(question, answer);
    if (selected === -1) { unansweredCount += 1; return; }
    if (selected === question.correctOption) { correctCount += 1; score += pointsPerQuestion; }
    else {
      incorrectCount += 1;
      if (settings.negativeMarking) score -= negativeMarkingPenalty;
    }
  });
  return { score, correctCount, incorrectCount, unansweredCount, maximumScore: questions.length * pointsPerQuestion };
}

module.exports = { shuffle, selectQuestions, scoreAttempt };
