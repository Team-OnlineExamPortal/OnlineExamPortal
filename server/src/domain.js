/**
 * Domain evaluation & algorithmic services
 *
 * NFR-006: Pure logic layer decoupled from web framework (Express) and database (Mongoose).
 * Functions in this module must not import express, mongoose, or depend on any database connection.
 */

/**
 * Fisher-Yates shuffle algorithm (pure, non-mutating)
 * @param {Array<T>} array - The input array
 * @returns {Array<T>} A new shuffled array
 */
function shuffle(array) {
  if (!Array.isArray(array)) {
    throw new TypeError('Array to shuffle must be an array');
  }
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * FR-005: Randomly select and shuffle questions per attempt
 *
 * @param {Array<Object>} questions - Complete question pool
 * @param {number} count - Target number of questions to select
 * @param {Object} [options] - Additional options (e.g. { shuffleOptions: boolean })
 * @returns {Array<Object>} Shuffled subset of selected questions
 */
function selectQuestions(questions, count, options = {}) {
  if (!Array.isArray(questions)) {
    throw new TypeError('Questions must be an array');
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    throw new Error('Question count must be a positive integer');
  }

  // Filter out disabled questions (satisfies requirement that disabled questions are excluded from new attempts)
  const activeQuestions = questions.filter(
    (q) => q && !q.disabled && q.status !== 'disabled'
  );

  if (activeQuestions.length < count) {
    const error = new Error(`Insufficient active questions: requested ${count}, available ${activeQuestions.length}`);
    error.code = 'INSUFFICIENT_QUESTIONS';
    throw error;
  }

  // Shuffle active pool and select target count
  const shuffled = shuffle(activeQuestions);
  const selected = shuffled.slice(0, count);

  // Return non-mutated clones (optionally shuffling answer choices if specified)
  return selected.map((q) => {
    const questionCopy = { ...q };
    if (options.shuffleOptions && Array.isArray(questionCopy.options)) {
      questionCopy.options = shuffle(questionCopy.options);
    }
    return questionCopy;
  });
}

module.exports = {
  shuffle,
  selectQuestions,
};
