'use strict';

const { percentile } = require('../scripts/load-test-attempt');

describe('NFR-001 load-test percentile helper', () => {
  test('calculates nearest-rank p50 and p95 without mutating samples', () => {
    const samples = [9, 1, 7, 3, 5];
    expect(percentile(samples, 0.5)).toBe(5);
    expect(percentile(samples, 0.95)).toBe(9);
    expect(samples).toEqual([9, 1, 7, 3, 5]);
  });

  test('returns null for no samples', () => {
    expect(percentile([], 0.95)).toBeNull();
  });

  test('rejects invalid percentiles and non-finite latency samples', () => {
    expect(() => percentile([1, 2], -0.1)).toThrow(RangeError);
    expect(() => percentile([1, 2], 1.1)).toThrow(RangeError);
    expect(() => percentile([1, Infinity], 0.95)).toThrow(TypeError);
  });
});
