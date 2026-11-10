/**
 * Minimal CodeMirror mode for OpenSCAD: enough highlighting to read a model,
 * not a full grammar (the real parser is OpenSCAD itself).
 */
import CodeMirror from 'codemirror';
import 'codemirror/addon/mode/simple.js';

const KEYWORDS = /^(module|function|if|else|for|each|let|intersection_for|assert|echo|use|include)\b/;

const BUILTINS = new RegExp(
  '^(' +
    [
      // 3D primitives
      'cube', 'sphere', 'cylinder', 'polyhedron',
      // 2D primitives and extrusions
      'circle', 'square', 'polygon', 'text', 'linear_extrude', 'rotate_extrude', 'projection',
      // transforms
      'translate', 'rotate', 'scale', 'resize', 'mirror', 'multmatrix', 'color', 'offset', 'hull', 'minkowski',
      // booleans
      'union', 'difference', 'intersection',
      // misc
      'import', 'surface', 'children', 'render', 'group', 'for',
    ].join('|') +
    ')\\b',
);

export function registerScadMode() {
  CodeMirror.defineSimpleMode('scad', {
    start: [
      { regex: /\/\/.*/, token: 'comment' },
      { regex: /\/\*/, token: 'comment', next: 'comment' },
      { regex: /0x[a-f\d]+|[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i, token: 'number' },
      { regex: /"(?:[^\\"]|\\.)*"/, token: 'string' },
      { regex: KEYWORDS, token: 'keyword' },
      { regex: BUILTINS, token: 'builtin' },
      // Customizer parameters: a bare name directly before "="
      { regex: /[A-Za-z_]\w*(?=\s*=)/, token: 'variable-2' },
      { regex: /[$#%!]/, token: 'meta' },
      { regex: /[{}()[\]]/, token: 'bracket' },
    ],
    comment: [
      { regex: /[^/*]+/, token: 'comment' },
      { regex: /\*\//, token: 'comment', next: 'start' },
      { regex: /[/*]/, token: 'comment' },
    ],
    meta: {
      lineComment: '//',
      blockCommentStart: '/*',
      blockCommentEnd: '*/',
      electricChars: '}',
      indentUnit: 4,
    },
  });
}
