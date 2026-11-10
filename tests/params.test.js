import { describe, expect, it } from 'vitest';
import { buildDefines, parseParams } from '../src/params.js';

const SOURCE = `
/* [Płyta] */
width = 60;      // [20:150:5]
depth = 40;      // [20:150]
thick = 5;
corner = true;

/* [Otwory] */
hole_d = 4.5;    // [2:10:0.5]
label = "uchwyt";
mode = "plain";  // [plain, chamfer, fillet]

/* [Hidden] */
secret = 3;

not_a_param = width * 2;
$fn = 48;
`;

describe('parseParams', () => {
  it('finds top-level literal assignments with their sections', () => {
    const { params, sections } = parseParams(SOURCE);

    expect(sections).toEqual(['Płyta', 'Otwory']);
    expect(params.map((p) => p.name)).toEqual([
      'width', 'depth', 'thick', 'corner', 'hole_d', 'label', 'mode',
    ]);
    expect(params[0]).toMatchObject({ section: 'Płyta', type: 'number', value: 60, control: 'slider', min: 20, max: 150, step: 5 });
  });

  it('treats a two-value range as min:max and a three-value one as min:max:step', () => {
    const { params } = parseParams(SOURCE);
    const depth = params.find((p) => p.name === 'depth');
    const hole = params.find((p) => p.name === 'hole_d');

    expect(depth).toMatchObject({ min: 20, max: 150, step: 1 });
    expect(hole).toMatchObject({ min: 2, max: 10, step: 0.5, value: 4.5 });
  });

  it('skips hidden sections, expressions and special variables', () => {
    const { params } = parseParams(SOURCE);
    const names = params.map((p) => p.name);

    expect(names).not.toContain('secret');
    expect(names).not.toContain('not_a_param');
    expect(names).not.toContain('$fn');
  });

  it('builds selects for string choices and text fields otherwise', () => {
    const { params } = parseParams(SOURCE);
    expect(params.find((p) => p.name === 'mode')).toMatchObject({
      control: 'select',
      choices: ['plain', 'chamfer', 'fillet'],
    });
    expect(params.find((p) => p.name === 'label')).toMatchObject({ control: 'text', type: 'string' });
    expect(params.find((p) => p.name === 'corner')).toMatchObject({ control: 'checkbox', value: true });
  });

  it('ignores the second assignment of the same name', () => {
    const { params } = parseParams('a = 1;\na = 2;\n');
    expect(params).toHaveLength(1);
    expect(params[0].value).toBe(1);
  });
});

describe('buildDefines', () => {
  it('passes raw values through — the renderer quotes strings itself', () => {
    const defines = buildDefines({
      width: { type: 'number', value: 42 },
      corner: { type: 'boolean', value: false },
      label: { type: 'string', value: 'uchwyt "v2"' },
    });

    expect(defines).toEqual({ width: 42, corner: false, label: 'uchwyt "v2"' });
  });
});
