import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bboxOf, featureVertices, nearestVertex } from './measure.js';

const MODEL_COLOR = 0x9fb3c8;
const GRID_COLOR = 0xc6cdd6;

export class Viewport {
  /**
   * @param {HTMLElement} container
   * @param {{ onMeasure?: (result: object) => void, onHint?: (text: string) => void }} handlers
   */
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.measureMode = false;
    this.pickPoints = [];
    this.snapPoints = [];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fa);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20000);
    camera.up.set(0, 0, 1); // OpenSCAD is Z-up
    camera.position.set(120, -160, 110);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    this.controls = controls;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.1));

    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(1, -1.4, 2);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-1.2, 1, 0.6);
    scene.add(fill);

    this.grid = new THREE.GridHelper(200, 20, GRID_COLOR, GRID_COLOR);
    this.grid.rotation.x = Math.PI / 2; // lay it in the XY plane, Z-up
    this.grid.material.opacity = 0.4;
    this.grid.material.transparent = true;
    scene.add(this.grid);

    this.mesh = null;
    this.markers = new THREE.Group();
    scene.add(this.markers);

    this.line = null;

    this.pointerDown = null;
    renderer.domElement.addEventListener('pointerdown', (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    renderer.domElement.addEventListener('pointerup', (event) => this.onPointerUp(event));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
  }

  resize() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  clearModel() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.clearMeasurement();
    this.snapPoints = [];
  }

  /**
   * @param {Float32Array} positions flat triangle soup in millimetres
   */
  setGeometry(positions) {
    this.clearModel();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: MODEL_COLOR,
      roughness: 0.62,
      metalness: 0.04,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    this.mesh = mesh;

    const box = bboxOf(positions);
    this.updateHelpers(box);
    this.snapPoints = featureVertices(positions);

    // Keep the viewpoint while tweaking parameters: refit only on the first
    // model or when the part changed size enough to fall out of frame.
    if (this.shouldRefit(box)) {
      this.fitCamera(box);
    }
    this.lastBox = box;
  }

  shouldRefit(box) {
    if (!this.lastBox) return true;

    const previous = Math.hypot(...this.lastBox.size);
    const current = Math.hypot(...box.size);
    if (previous === 0) return true;

    const ratio = current / previous;
    return ratio > 1.6 || ratio < 0.62;
  }

  updateHelpers(box) {
    const size = box.size;
    const center = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ];
    const diag = Math.hypot(size[0], size[1], size[2]) || 100;
    this.grid.scale.setScalar(diag / 200);
    this.grid.position.set(center[0], center[1], box.min[2]);
  }

  fitCamera(box) {
    const size = box.size;
    const center = new THREE.Vector3(
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    );
    const diag = Math.hypot(size[0], size[1], size[2]) || 100;

    // Fit the bounding sphere in both directions: a narrow viewport clips a wide
    // part when only the vertical field of view is taken into account.
    const radius = diag / 2;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distance = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * 1.12;

    this.camera.position.copy(center).add(new THREE.Vector3(0.9, -1.15, 0.8).normalize().multiplyScalar(distance));
    this.camera.near = Math.max(diag / 1000, 0.01);
    this.camera.far = diag * 40;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.update();
  }

  setMeasureMode(enabled) {
    this.measureMode = enabled;
    this.renderer.domElement.style.cursor = enabled ? 'crosshair' : 'grab';
    if (!enabled) this.clearMeasurement();
  }

  clearMeasurement() {
    this.pickPoints = [];
    for (const marker of [...this.markers.children]) {
      this.markers.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    if (this.line) {
      this.markers.remove(this.line);
      this.line.geometry.dispose();
      this.line.material.dispose();
      this.line = null;
    }
    this.handlers.onHint?.('');
  }

  onPointerUp(event) {
    if (!this.measureMode || !this.mesh) return;

    // Ignore drags: orbit must not create measurement points.
    const start = this.pointerDown;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const hit = raycaster.intersectObject(this.mesh, false)[0];
    if (!hit) return;

    const point = this.snap(hit.point);
    if (this.pickPoints.length >= 2) this.clearMeasurement();
    this.addPickPoint(point);

    if (this.pickPoints.length === 2) {
      const [a, b] = this.pickPoints;
      this.handlers.onMeasure?.({ a, b });
    }
  }

  snap(point) {
    const diag = this.mesh.geometry.boundingSphere
      ? this.mesh.geometry.boundingSphere.radius * 2
      : 100;
    const maxDistance = diag * 0.03;
    const target = [point.x, point.y, point.z];
    const nearest = nearestVertex(this.snapPoints, target, maxDistance);
    return nearest ? nearest.point.slice() : target;
  }

  addPickPoint(point) {
    this.pickPoints.push(point);

    const diag = this.mesh.geometry.boundingSphere
      ? this.mesh.geometry.boundingSphere.radius * 2
      : 100;
    const radius = Math.max(diag * 0.006, 0.4);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xd9482f }),
    );
    marker.position.set(point[0], point[1], point[2]);
    this.markers.add(marker);

    if (this.pickPoints.length === 2) {
      const [a, b] = this.pickPoints;
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a[0], a[1], a[2]),
        new THREE.Vector3(b[0], b[1], b[2]),
      ]);
      this.line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xd9482f }));
      this.markers.add(this.line);
    }

    this.handlers.onHint?.(this.pickPoints.length === 1 ? 'Wskaż drugi punkt' : '');
  }

  startOverIfComplete() {
    if (this.pickPoints.length >= 2) this.clearMeasurement();
  }
}
