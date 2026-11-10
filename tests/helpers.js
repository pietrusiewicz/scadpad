/** A closed, consistently wound box of `size` mm — the reference mesh for tests. */

export function cube(size = 10) {
  const s = size;
  const v = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
  ];

  const faces = [
    [0, 3, 2], [0, 2, 1], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // front
    [3, 7, 6], [3, 6, 2], // back
    [0, 4, 7], [0, 7, 3], // left
    [1, 2, 6], [1, 6, 5], // right
  ];

  const positions = new Float32Array(faces.length * 9);
  faces.forEach((face, index) => {
    face.forEach((vertex, corner) => {
      positions.set(v[vertex], index * 9 + corner * 3);
    });
  });

  return positions;
}
