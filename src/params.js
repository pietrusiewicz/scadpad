/**
 * Parameters of a .scad file, in the format the OpenSCAD Customizer uses:
 *
 *   /* [Section] *\/
 *   width = 40;        // [20:100]
 *   height = 25;       // [15:80:5]
 *   rounded = true;
 *
 * Only single-line top-level assignments with a literal value are turned into
 * controls. Anything else (expressions, functions, modules) is left alone and
 * simply stays in the code.
 */

const SECTION_RE = /^\s*\/\*\s*\[(.+?)\]\s*\*\/\s*$/;
const ASSIGN_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);(.*)$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

const HIDDEN = 'Hidden';

/**
 * @param {string} source
 * @returns {{ params: Array<object>, sections: string[] }}
 */
export function parseParams(source) {
  const params = [];
  const sections = [];
  const seen = new Set();
  let section = '';

  for (const line of source.split(/\r?\n/)) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      if (section !== HIDDEN && !sections.includes(section)) sections.push(section);
      continue;
    }

    if (section === HIDDEN) continue;

    const assign = line.match(ASSIGN_RE);
    if (!assign) continue;

    const [, name, rawValue, tail] = assign;
    if (name.startsWith('$') || seen.has(name)) continue;

    const literal = parseLiteral(rawValue.trim());
    if (!literal) continue;

    const control = buildControl(literal, tail);
    if (!control) continue;

    seen.add(name);
    params.push({ name, section, line, ...literal, ...control });
  }

  return { params, sections };
}

function parseLiteral(raw) {
  if (NUMBER_RE.test(raw)) return { type: 'number', value: Number(raw) };
  if (raw === 'true' || raw === 'false') return { type: 'boolean', value: raw === 'true' };
  if (/^".*"$/.test(raw)) return { type: 'string', value: raw.slice(1, -1) };
  return null;
}

function buildControl(literal, tail) {
  const comment = tail.trim();
  const bracket = comment.match(/^\/\/\s*\[([^\]]*)\]/);
  const annotation = bracket ? bracket[1].trim() : '';

  if (literal.type === 'number') {
    const range = annotation.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)(?:\s*:\s*(-?\d+(?:\.\d+)?))?$/);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      const step = range[3] === undefined ? 1 : Number(range[3]);
      if (max <= min || step <= 0) return null;
      return { control: 'slider', min, max, step };
    }
    return { control: 'number' };
  }

  if (literal.type === 'string' && annotation) {
    const choices = annotation.split(',').map((choice) => choice.trim()).filter(Boolean);
    if (choices.length > 0) return { control: 'select', choices };
  }

  if (literal.type === 'boolean') return { control: 'checkbox' };
  if (literal.type === 'string') return { control: 'text' };
  return null;
}

/**
 * Turn the UI values into the `defines` map expected by the renderer, which
 * quotes strings for OpenSCAD itself.
 *
 * @param {Record<string, { type: string, value: any }>} values
 * @returns {Record<string, string | number | boolean>}
 */
export function buildDefines(values) {
  const defines = {};

  for (const [name, entry] of Object.entries(values)) {
    defines[name] = entry.value;
  }

  return defines;
}
