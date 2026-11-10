/**
 * Geometry helpers that work on a flat triangle soup (`Float32Array`, 9 values
 * per triangle). Pure functions only — no three.js, so they are cheap to test.
 */

export function bboxOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }

  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  }

  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Signed volume of the closed mesh; the sign depends on winding, so abs(). */
export function volumeOf(positions) {
  let volume = 0;

  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];

    volume +=
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx);
  }

  return Math.abs(volume / 6);
}

/**
 * Unique corner points, used as snap targets for measurements. Values are
 * rounded to `eps` so float noise between neighbouring triangles collapses into
 * one point.
 */
export function uniqueVertices(positions, eps = 1e-4) {
  const seen = new Map();
  const points = [];

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const key = `${round(x, eps)}|${round(y, eps)}|${round(z, eps)}`;
    if (seen.has(key)) continue;
    seen.set(key, points.length);
    points.push([x, y, z]);
  }

  return points;
}

function round(value, eps) {
  return Math.round(value / eps);
}

/**
 * Closest point from `points` to `target`, but only if it is within `maxDistance`.
 *
 * @returns {{ point: number[], distance: number, index: number } | null}
 */
export function nearestVertex(points, target, maxDistance = Infinity) {
  let best = null;
  let bestDistance = maxDistance;

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const dx = point[0] - target[0];
    const dy = point[1] - target[1];
    const dz = point[2] - target[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = { point, distance, index: i };
    }
  }

  return best;
}

/**
 * Distance between two points, split into the three axis components — that is
 * what you actually read off a drawing.
 */
export function measureBetween(a, b) {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);

  return { dx, dy, dz, distance: Math.hypot(dx, dy, dz) };
}

export function formatMm(value) {
  return `${value.toFixed(2)} mm`;
}

/**
 * Corners and edges only: vertices where adjacent triangles meet at more than
 * `angleDeg`, plus vertices on an open mesh boundary.
 *
 * Triangulation vertices that lie flat inside a face are skipped, so a click in
 * the middle of a plate measures the exact surface point instead of snapping to
 * an invisible interior vertex.
 */
export function featureVertices(positions, angleDeg = 20) {
  const corners = new Map();
  const edges = new Map();
  const triangleCount = positions.length / 9;

  const keyAt = (o) =>
    `${round(positions[o], 1e-4)}|${round(positions[o + 1], 1e-4)}|${round(positions[o + 2], 1e-4)}`;

  for (let t = 0; t < triangleCount; t += 1) {
    const i = t * 9;

    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);

    if (length === 0) continue; // degenerate triangle: no usable normal
    nx /= length;
    ny /= length;
    nz /= length;

    const keys = [keyAt(i), keyAt(i + 3), keyAt(i + 6)];

    for (let corner = 0; corner < 3; corner += 1) {
      const o = i + corner * 3;
      let entry = corners.get(keys[corner]);
      if (!entry) {
        entry = { point: [positions[o], positions[o + 1], positions[o + 2]], normals: [] };
        corners.set(keys[corner], entry);
      }
      entry.normals.push([nx, ny, nz]);
    }

    for (let corner = 0; corner < 3; corner += 1) {
      const a = keys[corner];
      const b = keys[(corner + 1) % 3];
      const key = a < b ? `${a}~${b}` : `${b}~${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }

  const openEdges = new Set();
  for (const [key, count] of edges) {
    if (count !== 1) continue;
    const [a, b] = key.split('~');
    openEdges.add(a);
    openEdges.add(b);
  }

  const cosLimit = Math.cos((angleDeg * Math.PI) / 180);
  const features = [];

  for (const [key, { point, normals }] of corners) {
    if (openEdges.has(key)) {
      features.push(point);
      continue;
    }

    let feature = false;
    for (let a = 0; a < normals.length && !feature; a += 1) {
      for (let b = a + 1; b < normals.length; b += 1) {
        const dot =
          normals[a][0] * normals[b][0] + normals[a][1] * normals[b][1] + normals[a][2] * normals[b][2];
        if (dot < cosLimit) {
          feature = true;
          break;
        }
      }
    }

    if (feature) features.push(point);
  }

  return features;
}
