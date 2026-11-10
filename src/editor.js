import CodeMirror from 'codemirror';
import { registerScadMode } from './scad-mode.js';

let registered = false;

/**
 * @param {HTMLElement} container
 * @param {{ value: string, onChange?: (code: string) => void, onRender?: () => void }} options
 */
export function createEditor(container, { value, onChange, onRender }) {
  if (!registered) {
    registerScadMode();
    registered = true;
  }

  const editor = CodeMirror(container, {
    value,
    mode: 'scad',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    viewportMargin: 40,
    extraKeys: {
      'Ctrl-Enter': () => onRender?.(),
      'Cmd-Enter': () => onRender?.(),
    },
  });

  editor.on('change', () => onChange?.(editor.getValue()));

  setTimeout(() => editor.refresh(), 0);

  // CodeMirror mierzy wysokość linii przy starcie; jeśli font doładuje się
  // później, zawinięte linie rysują się w złym miejscu.
  document.fonts?.ready.then(() => editor.refresh());

  return editor;
}
