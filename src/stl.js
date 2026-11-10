const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const VERTEX_RE = new RegExp(String.raw`vertex\s+(${NUM})\s+(${NUM})\s+(${NUM})`, 'g');

/**
 * Parse an STL file (ASCII or binary) into a flat triangle soup.
 *
 * @param {string | ArrayBuffer | Uint8Array} data
 * @returns {{ positions: Float32Array, triangleCount: number, format: 'ascii' | 'binary' }}
 */
export function parseStl(data) {
  if (typeof data === 'string') return parseAscii(data);

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (isBinary(bytes)) return parseBinary(bytes);
  return parseAscii(new TextDecoder().decode(bytes));
}

function isBinary(bytes) {
  if (bytes.byteLength < 84) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  // The length check is the reliable signal; some binary exporters still start
  // the file with the word "solid", so the header text cannot be trusted.
  return 84 + count * 50 === bytes.byteLength;
}

function parseBinary(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const positions = new Float32Array(count * 9);

  let offset = 84;
  for (let i = 0; i < count; i += 1) {
    offset += 12; // facet normal, recomputed later from the geometry
    for (let v = 0; v < 9; v += 1) {
      positions[i * 9 + v] = view.getFloat32(offset + v * 4, true);
    }
    offset += 36 + 2; // vertices + attribute byte count
  }

  return { positions, triangleCount: count, format: 'binary' };
}

function parseAscii(text) {
  const values = [];
  for (const match of text.matchAll(VERTEX_RE)) {
    values.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  if (values.length === 0) {
    throw new Error('Plik nie zawiera trójkątów — to nie jest STL albo geometria jest pusta.');
  }

  const triangleCount = Math.floor(values.length / 9);
  const positions = new Float32Array(triangleCount * 9);
  positions.set(values.slice(0, triangleCount * 9));

  return { positions, triangleCount, format: 'ascii' };
}
