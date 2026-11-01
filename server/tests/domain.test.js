const fs = require('fs');
const path = require('path');
const { selectQuestions, shuffle } = require('../src/domain');

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

      let seenDifferent = false;
      for (let i = 0; i < 20; i++) {
        const result = selectQuestions(questionWithOptions, 1, { shuffleOptions: true });
        if (result[0].options.join('') !== 'ABCDEFG') {
          seenDifferent = true;
          break;
        }
      }
      expect(seenDifferent).toBe(true);
    });

    test('produces randomized selections across multiple invocations', () => {
      const largePool = Array.from({ length: 20 }, (_, i) => ({ id: `q${i + 1}` }));
      const order1 = selectQuestions(largePool, 10).map((q) => q.id).join(',');
      let order2 = selectQuestions(largePool, 10).map((q) => q.id).join(',');

      let randomized = false;
      for (let i = 0; i < 10; i++) {
        if (order1 !== order2) {
          randomized = true;
          break;
        }
        order2 = selectQuestions(largePool, 10).map((q) => q.id).join(',');
      }
      expect(randomized).toBe(true);
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
  });

  describe('NFR-006: Decoupling / Framework Independence', () => {
    test('domain.js does not import express or mongoose', () => {
      const fileContent = fs.readFileSync(path.join(__dirname, '../src/domain.js'), 'utf8');
      expect(fileContent).not.toMatch(/require\s*\(\s*['"]express['"]\s*\)/);
      expect(fileContent).not.toMatch(/require\s*\(\s*['"]mongoose['"]\s*\)/);
    });
  });
});
