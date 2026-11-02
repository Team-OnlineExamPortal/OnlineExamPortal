const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { selectQuestions, shuffle } = require('../src/domain');
const { scoreAttempt } = require('../src/domain');

describe('FR-005 / NFR-006: Question Selection and Shuffle Domain Logic', () => {
  const sampleQuestions = [
    { id: 'q1', text: 'Question 1', options: ['A', 'B', 'C', 'D'], correctOption: 0 },
    { id: 'q2', text: 'Question 2', options: ['A', 'B', 'C', 'D'], correctOption: 1 },
    { id: 'q3', text: 'Question 3', options: ['A', 'B', 'C', 'D'], correctOption: 2 },
    { id: 'q4', text: 'Question 4', options: ['A', 'B', 'C', 'D'], correctOption: 3 },
    { id: 'q5', text: 'Question 5', options: ['A', 'B', 'C', 'D'], correctOption: 0 },
  ];

  describe('selectQuestions', () => {
    test('selects the requested number of questions', () => {
      const selected = selectQuestions(sampleQuestions, 3);
      expect(selected).toHaveLength(3);

      // Verify all selected questions exist in the original set
      const originalIds = sampleQuestions.map((q) => q.id);
      selected.forEach((q) => {
        expect(originalIds).toContain(q.id);
      });
    });

    test('excludes disabled questions (flagged with disabled: true)', () => {
      const pool = [
        { id: 'q1', text: 'Active 1', disabled: false },
        { id: 'q2', text: 'Disabled 1', disabled: true },
        { id: 'q3', text: 'Active 2', disabled: false },
      ];

      const selected = selectQuestions(pool, 2);
      expect(selected).toHaveLength(2);
      expect(selected.map((q) => q.id)).not.toContain('q2');
    });

    test('excludes disabled questions (flagged with status: "disabled")', () => {
      const pool = [
        { id: 'q1', text: 'Active 1', status: 'active' },
        { id: 'q2', text: 'Disabled 1', status: 'disabled' },
        { id: 'q3', text: 'Active 2', status: 'active' },
      ];

      const selected = selectQuestions(pool, 2);
      expect(selected).toHaveLength(2);
      expect(selected.map((q) => q.id)).not.toContain('q2');
    });

    test('throws INSUFFICIENT_QUESTIONS when active questions are less than requested count', () => {
      expect(() => {
        selectQuestions(sampleQuestions, 10);
      }).toThrow('Insufficient active questions');

      try {
        selectQuestions(sampleQuestions, 10);
      } catch (err) {
        expect(err.code).toBe('INSUFFICIENT_QUESTIONS');
      }
    });

    test('throws INSUFFICIENT_QUESTIONS when pool has enough questions but too many are disabled', () => {
      const pool = [
        { id: 'q1', disabled: true },
        { id: 'q2', disabled: true },
        { id: 'q3', disabled: false },
      ];

      expect(() => {
        selectQuestions(pool, 2);
      }).toThrow('Insufficient active questions');
    });

    test('validates inputs strictly', () => {
      expect(() => selectQuestions(null, 2)).toThrow(TypeError);
      expect(() => selectQuestions('invalid', 2)).toThrow(TypeError);
      expect(() => selectQuestions(sampleQuestions, 0)).toThrow('positive integer');
      expect(() => selectQuestions(sampleQuestions, -1)).toThrow('positive integer');
      expect(() => selectQuestions(sampleQuestions, 2.5)).toThrow('positive integer');
      expect(() => selectQuestions(sampleQuestions, '2')).toThrow('positive integer');
    });

    test('does not mutate the original pool or question objects (immutability)', () => {
      const originalCopy = JSON.parse(JSON.stringify(sampleQuestions));
      const pool = [...sampleQuestions];

      selectQuestions(pool, 3, { shuffleOptions: true });

      // Pool array and its items remain completely unchanged
      expect(sampleQuestions).toEqual(originalCopy);
      expect(pool).toEqual(sampleQuestions);
    });

    test('shuffles options when shuffleOptions is enabled', () => {
      const questionWithOptions = [
        { id: 'q1', text: 'Q1', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      ];
      const result = selectQuestions(questionWithOptions, 1, { shuffleOptions: true, rng: () => 0 });
      expect(result[0].options).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'A']);
    });

    test('produces randomized selections across multiple invocations', () => {
      const largePool = Array.from({ length: 20 }, (_, i) => ({ id: `q${i + 1}` }));
      const first = selectQuestions(largePool, 10, { rng: seededRng(7) }).map((q) => q.id);
      const repeated = selectQuestions(largePool, 10, { rng: seededRng(7) }).map((q) => q.id);
      const otherSeed = selectQuestions(largePool, 10, { rng: seededRng(29) }).map((q) => q.id);
      expect(repeated).toEqual(first);
      expect(otherSeed).not.toEqual(first);
    });

    test('rejects invalid options and random source', () => {
      expect(() => selectQuestions(sampleQuestions, 1, null)).toThrow('Options must be an object');
      expect(() => selectQuestions(sampleQuestions, 1, { rng: 1 })).toThrow('Random source must be a function');
      expect(() => selectQuestions(sampleQuestions, 2, { rng: () => 1 })).toThrow('Random source must return');
    });
  });

  describe('shuffle helper', () => {
    test('shuffles an empty array and single-item array correctly', () => {
      expect(shuffle([])).toEqual([]);
      expect(shuffle(['only'])).toEqual(['only']);
    });

    test('throws TypeError when input is not an array', () => {
      expect(() => shuffle(null)).toThrow(TypeError);
      expect(() => shuffle('string')).toThrow(TypeError);
    });

    test('accepts an injectable random source and returns a deterministic permutation', () => {
      expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
    });

    test('rejects random sources that return values outside [0, 1)', () => {
      expect(() => shuffle([1, 2], () => -0.1)).toThrow(RangeError);
      expect(() => shuffle([1, 2], () => NaN)).toThrow(RangeError);
      expect(() => shuffle([1, 2], 'not a function')).toThrow(TypeError);
    });
  });

  describe('scoreAttempt', () => {
    const questions = [
      { id: 'q1', options: ['A', 'B'], correctOption: 0 },
      { id: 'q2', options: [{ optionId: 'q2-a' }, { optionId: 'q2-b' }], correctOption: 1 },
      { id: 'q3', options: ['A', 'B'], correctOption: 1 },
    ];

    test('scores correct, wrong, and unanswered with negative marking disabled', () => {
      expect(scoreAttempt(questions, { q1: 0, q2: 'q2-a' })).toEqual({
        score: 1, correctCount: 1, incorrectCount: 1, unansweredCount: 1, maximumScore: 3,
      });
    });

    test('applies configurable negative penalty and accepts answer records', () => {
      expect(scoreAttempt(questions, [
        { questionId: 'q1', optionId: '0' },
        { questionId: 'q2', optionId: 'q2-b' },
        { questionId: 'q3', optionId: 0 },
      ], { negativeMarking: true, negativeMarkingPenalty: 0.25, pointsPerQuestion: 2 })).toEqual({
        score: 3.75, correctCount: 2, incorrectCount: 1, unansweredCount: 0, maximumScore: 6,
      });
    });

    test('counts a supplied but invalid option as incorrect and leaves score negative when penalty exceeds marks', () => {
      expect(scoreAttempt([questions[0]], { q1: 'not-an-option' }, { negativeMarking: true, negativeMarkingPenalty: 2 }).score).toBe(-2);
    });

    test('handles empty attempts, null answers, alternate question identifiers and option object IDs', () => {
      expect(scoreAttempt([], null)).toEqual({ score: 0, correctCount: 0, incorrectCount: 0, unansweredCount: 0, maximumScore: 0 });
      expect(scoreAttempt([{ questionId: 'q', options: [{ id: 'a' }, { id: 'b' }], correctOption: 1 }], [{ questionId: 'q', answer: 'b' }]).correctCount).toBe(1);
    });

    test('validates question, answer, settings, and score configuration', () => {
      expect(() => scoreAttempt(null, {})).toThrow(TypeError);
      expect(() => scoreAttempt(questions, 'bad')).toThrow(TypeError);
      expect(() => scoreAttempt(questions, {}, null)).toThrow(TypeError);
      expect(() => scoreAttempt(questions, {}, { pointsPerQuestion: 0 })).toThrow(RangeError);
      expect(() => scoreAttempt(questions, {}, { pointsPerQuestion: Infinity })).toThrow(RangeError);
      expect(() => scoreAttempt(questions, {}, { negativeMarkingPenalty: -1 })).toThrow(RangeError);
      expect(() => scoreAttempt(questions, {}, { negativeMarkingPenalty: NaN })).toThrow(RangeError);
      expect(() => scoreAttempt([{ options: [], correctOption: 0 }], {})).toThrow('invalid options');
      expect(() => scoreAttempt([{ options: ['A'], correctOption: -1 }], {})).toThrow('invalid options');
      expect(() => scoreAttempt([{ options: ['A'], correctOption: 1 }], {})).toThrow('invalid options');
    });
  });

  describe('NFR-006: Decoupling / Framework Independence', () => {
    test('domain.js does not import express or mongoose', () => {
      const fileContent = fs.readFileSync(path.join(__dirname, '../src/domain.js'), 'utf8');
      expect(fileContent).not.toMatch(/require\s*\(\s*['"]express['"]\s*\)/);
      expect(fileContent).not.toMatch(/require\s*\(\s*['"]mongoose['"]\s*\)/);
    });

    test('can load and execute selection and scoring when Express and Mongoose imports are blocked', () => {
      const modulePath = path.join(__dirname, '../src/domain.js');
      const script = `
        const Module = require('module');
        const originalLoad = Module._load;
        Module._load = function (request, parent, isMain) {
          if (request === 'express' || request === 'mongoose') throw new Error('framework import: ' + request);
          return originalLoad.call(this, request, parent, isMain);
        };
        const domain = require(${JSON.stringify(modulePath)});
        const qs = [{id:'q',options:['a','b'],correctOption:1}];
        if (domain.selectQuestions(qs, 1, {rng:()=>0}).length !== 1) process.exit(2);
        if (domain.scoreAttempt(qs, {q:1}).score !== 1) process.exit(3);
      `;
      const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });
});

function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
