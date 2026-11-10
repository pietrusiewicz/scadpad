import { describe, expect, it } from 'vitest';
import {
  bboxOf,
  featureVertices,
  formatMm,
  measureBetween,
  nearestVertex,
  uniqueVertices,
  volumeOf,
} from '../src/measure.js';
import { cube } from './helpers.js';

describe('bboxOf', () => {
  it('returns min, max and size of the mesh', () => {
    const box = bboxOf(cube(10));
    expect(box.min).toEqual([0, 0, 0]);
    expect(box.max).toEqual([10, 10, 10]);
    expect(box.size).toEqual([10, 10, 10]);
  });
});

describe('volumeOf', () => {
  it('computes the volume of a closed cube regardless of winding', () => {
    expect(volumeOf(cube(10))).toBeCloseTo(1000, 3);
    expect(volumeOf(cube(4))).toBeCloseTo(64, 3);
  });
});

describe('uniqueVertices', () => {
  it('merges duplicated corner points', () => {
    const points = uniqueVertices(cube(10));
    expect(points).toHaveLength(8);
  });

  it('merges points that differ only by float noise', () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
    const noisy = new Float32Array([...positions, 0.00001, 0, 0, 10.00001, 0, 0, 0, 10.00001, 0]);
    expect(uniqueVertices(noisy)).toHaveLength(3);
  });
});

describe('nearestVertex', () => {
  const points = [[0, 0, 0], [10, 0, 0], [0, 10, 0]];

  it('snaps to the closest corner inside the radius', () => {
    const hit = nearestVertex(points, [0.4, 0.2, 0.1], 2);
    expect(hit.point).toEqual([0, 0, 0]);
    expect(hit.index).toBe(0);
  });

  it('returns null when nothing is close enough', () => {
    expect(nearestVertex(points, [5, 5, 5], 0.5)).toBeNull();
  });
});

describe('measureBetween', () => {
  it('splits the distance into axis components', () => {
    const result = measureBetween([0, 0, 0], [3, 4, 12]);

    expect(result.dx).toBe(3);
    expect(result.dy).toBe(4);
    expect(result.dz).toBe(12);
    expect(result.distance).toBeCloseTo(13, 6);
  });

  it('is symmetric', () => {
    const a = measureBetween([1, 2, 3], [4, 6, 3]);
    const b = measureBetween([4, 6, 3], [1, 2, 3]);
    expect(a).toEqual(b);
  });
});

describe('formatMm', () => {
  it('always shows two decimals and the unit', () => {
    expect(formatMm(4.5)).toBe('4.50 mm');
    expect(formatMm(100)).toBe('100.00 mm');
  });
});

describe('featureVertices', () => {
  it('returns the 8 corners of a cube', () => {
    expect(featureVertices(cube(10))).toHaveLength(8);
  });

  it('ignores vertices that lie flat inside a face', () => {
    // The same box, but the top face is a four-triangle fan around its centre.
    const size = 10;
    const centre = [5, 5, 10];
    const fan = [
      [0, 0, 10], [10, 0, 10], centre,
      [10, 0, 10], [10, 10, 10], centre,
      [10, 10, 10], [0, 10, 10], centre,
      [0, 10, 10], [0, 0, 10], centre,
    ];

    const base = cube(size);
    const kept = [];
    for (let i = 0; i < base.length; i += 9) {
      const allTop = base[i + 2] === size && base[i + 5] === size && base[i + 8] === size;
      if (allTop) continue; // drop the two original top triangles
      kept.push(...base.slice(i, i + 9));
    }

    const positions = new Float32Array([...kept, ...fan.flat()]);

    expect(uniqueVertices(positions)).toHaveLength(9);
    expect(featureVertices(positions)).toHaveLength(8);
  });
});
