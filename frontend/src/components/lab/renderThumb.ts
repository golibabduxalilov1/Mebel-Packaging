/* Import natijasidan bitta statik rasm (PNG data-URL) yasaydi: izometrik ko'rinish, interaktivsiz. */
import * as THREE from 'three';
import type { ImportResult, Part } from '@/lib/types';

function partGeometry(p: Part): THREE.BufferGeometry | null {
  if (p.positions && p.positions.length >= 9) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    g.computeVertexNormals();
    return g;
  }
  if (p.bbox) {
    const { min, max } = p.bbox;
    const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    return g;
  }
  return null;
}

export function renderThumb(result: ImportResult, width = 480, height = 240): string | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { return null; }
  renderer.setPixelRatio(2);
  renderer.setSize(width, height);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);

  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  for (const p of result.parts) {
    if (p.kind === 'ignore') continue;
    const g = partGeometry(p);
    if (!g) continue;
    const m = new THREE.MeshStandardMaterial({ color: p.color || '#c8b08a', side: THREE.DoubleSide, roughness: 0.7, metalness: 0.05 });
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x33414d, transparent: true, opacity: 0.45 }));
    group.add(new THREE.Mesh(g, m), edge);
    disposables.push(g, m, edge.geometry, edge.material as THREE.Material);
  }
  scene.add(group);

  const box = new THREE.Box3().setFromObject(group);
  let url: string | null = null;
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
    const camera = new THREE.PerspectiveCamera(30, width / height, radius / 100, radius * 50);
    const d = radius * 3.2;
    camera.position.set(center.x + d * 0.7, center.y + d * 0.5, center.z + d * 0.7);
    camera.lookAt(center);
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL('image/png');
  }
  disposables.forEach((x) => x.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
