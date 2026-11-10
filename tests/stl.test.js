import { describe, expect, it } from 'vitest';
import { parseStl } from '../src/stl.js';
import { cube } from './helpers.js';

function toAsciiStl(positions) {
  const lines = ['solid test'];

  for (let i = 0; i < positions.length; i += 9) {
    lines.push(' facet normal 0 0 0');
    lines.push('  outer loop');
    for (let corner = 0; corner < 3; corner += 1) {
      const o = i + corner * 3;
      lines.push(`   vertex ${positions[o]} ${positions[o + 1]} ${positions[o + 2]}`);
    }
    lines.push('  endloop');
    lines.push(' endfacet');
  }

  lines.push('endsolid test');
  return lines.join('\n');
}

function toBinaryStl(positions) {
  const triangles = positions.length / 9;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);

  view.setUint32(80, triangles, true);
  view.setUint8(0, 's'.charCodeAt(0)); // binary files may still start with "solid"

  let offset = 84;
  for (let i = 0; i < positions.length; i += 9) {
    offset += 12; // normal
    for (let j = 0; j < 9; j += 1) {
      view.setFloat32(offset, positions[i + j], true);
      offset += 4;
    }
    offset += 2;
  }

  return buffer;
}

describe('parseStl', () => {
  it('parses ASCII STL into a triangle soup', () => {
    const result = parseStl(toAsciiStl(cube(10)));

    expect(result.format).toBe('ascii');
    expect(result.triangleCount).toBe(12);
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.positions).toHaveLength(12 * 9);
  });

  it('detects binary STL even when the header starts with "solid"', () => {
    const result = parseStl(toBinaryStl(cube(10)));

    expect(result.format).toBe('binary');
    expect(result.triangleCount).toBe(12);
    expect(Math.max(...result.positions)).toBe(10);
  });

  it('rejects files without triangles', () => {
    expect(() => parseStl('solid empty\nendsolid empty')).toThrow(/nie zawiera trójkątów/);
  });
});
