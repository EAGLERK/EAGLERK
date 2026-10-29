import {
  BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, IcosahedronGeometry, Mesh,
  MeshStandardMaterial, Shape, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Matches the chart colours used across the app: car = blue, house = orange, bike = aqua. */
export const PALETTE = {
  blue: 0x2a78d6,
  orange: 0xeb6834,
  aqua: 0x1baf7a,
  yellow: 0xf5b82e,
  ink: 0x23302a,
  white: 0xf7f8f6,
  glass: 0xbfdcf7,
  steel: 0x9aa5a0,
  leaf: 0x3aa66b,
  bark: 0x8a5a3c,
};

const clay = (color: number, roughness = 0.6, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: number) => new MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.55 });

function add(group: Group, geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const rbox = (w: number, h: number, d: number, r = 0.06) => new RoundedBoxGeometry(w, h, d, 5, r);

/** A cylinder joining two points. */
function bar(group: Group, a: Vector3, b: Vector3, radius: number, mat: Material): Mesh {
  const dir = b.clone().sub(a);
  const m = new Mesh(new CylinderGeometry(radius, radius, dir.length(), 16), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  group.add(m);
  return m;
}

/** Front faces +x. About 2.5 long. Built from an extruded side profile so it has a real car silhouette. */
export function buildCar(): Group {
  const g = new Group();
  const body = clay(PALETTE.blue, 0.4, 0.15);
  const tyre = clay(PALETTE.ink, 0.9);
  const hub = clay(PALETTE.steel, 0.35, 0.6);
  const extrudeProfile = (pts: Array<[number, number]>, depth: number, bevel: number, mat: Material, y = 0) => {
    const sh = new Shape();
    pts.forEach(([x, yy], i) => (i ? sh.lineTo(x, yy) : sh.moveTo(x, yy)));
    sh.closePath();
    const geo = new ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 8 });
    geo.translate(0, y, -depth / 2);
    return add(g, geo, mat);
  };

  // lower body and cabin in one silhouette
  extrudeProfile([[-1.2, 0.3], [-1.2, 0.7], [-0.92, 0.8], [-0.6, 1.24], [0.26, 1.24], [0.7, 0.86], [1.2, 0.74], [1.2, 0.3]], 0.98, 0.09, body);
  // window band, a touch wider than the body so it reads as glass set into the sides
  extrudeProfile([[-0.5, 0.87], [-0.32, 1.17], [0.2, 1.17], [0.56, 0.87]], 1.14, 0.02, clay(PALETTE.glass, 0.12, 0.1));
  // windshield and rear window: slanted glass panels on the front and back slopes
  const glassMat = clay(PALETTE.glass, 0.1, 0.1);
  // the body bevel pushes its surface ~0.09 outward, so the glass sits ~0.12 out from the slope
  const wind = add(g, rbox(0.52, 0.035, 0.88, 0.015), glassMat, 0.559, 1.141, 0);
  wind.rotation.z = -0.713;
  const rear = add(g, rbox(0.46, 0.035, 0.88, 0.015), glassMat, -0.857, 1.091, 0);
  rear.rotation.z = 0.942;
  // B pillar
  add(g, rbox(0.07, 0.3, 1.2, 0.02), body, -0.06, 1.02, 0);
  // door seams and handles
  for (const z of [-0.6, 0.6]) {
    add(g, rbox(0.12, 0.035, 0.03, 0.012), clay(PALETTE.steel, 0.3, 0.6), 0.2, 0.84, z);
    add(g, rbox(0.12, 0.035, 0.03, 0.012), clay(PALETTE.steel, 0.3, 0.6), -0.34, 0.84, z);
  }
  // wheels
  for (const x of [-0.82, 0.82]) {
    for (const z of [-0.58, 0.58]) {
      const t = add(g, new CylinderGeometry(0.32, 0.32, 0.26, 40), tyre, x, 0.32, z);
      t.rotation.x = Math.PI / 2;
      const h = add(g, new CylinderGeometry(0.18, 0.18, 0.28, 28), hub, x, 0.32, z);
      h.rotation.x = Math.PI / 2;
      const cap = add(g, new CylinderGeometry(0.06, 0.06, 0.3, 16), clay(PALETTE.ink, 0.5), x, 0.32, z);
      cap.rotation.x = Math.PI / 2;
    }
  }
  // lights and bumpers
  for (const z of [-0.36, 0.36]) {
    add(g, rbox(0.06, 0.12, 0.22, 0.03), glow(PALETTE.yellow), 1.3, 0.62, z);
    add(g, rbox(0.06, 0.1, 0.22, 0.03), glow(0xe34948), -1.3, 0.62, z);
  }
  add(g, rbox(0.1, 0.1, 0.96, 0.04), clay(PALETTE.steel, 0.4, 0.5), 1.28, 0.38, 0);
  add(g, rbox(0.1, 0.1, 0.96, 0.04), clay(PALETTE.steel, 0.4, 0.5), -1.28, 0.38, 0);
  return g;
}

/** Front door faces +z. About 2.4 wide. */
export function buildHouse(): Group {
  const g = new Group();
  const wall = clay(PALETTE.white, 0.7);
  const roofMat = clay(PALETTE.orange, 0.55);

  add(g, rbox(2.1, 1.45, 1.7, 0.05), wall, 0, 0.725, 0);

  // pitched roof: triangle profile extruded along z
  const s = new Shape();
  s.moveTo(-1.2, 0);
  s.lineTo(1.2, 0);
  s.lineTo(0, 0.8);
  s.closePath();
  const roofGeo = new ExtrudeGeometry(s, { depth: 1.86, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  const roof = add(g, roofGeo, roofMat, 0, 1.43, -0.93);
  roof.castShadow = true;

  add(g, rbox(0.28, 0.6, 0.28, 0.03), clay(0x6b7a72, 0.8), 0.6, 1.95, -0.3); // chimney
  // door with frame
  add(g, rbox(0.54, 0.95, 0.06, 0.03), clay(PALETTE.white, 0.7), -0.45, 0.48, 0.86);
  add(g, rbox(0.42, 0.85, 0.07, 0.03), clay(PALETTE.blue, 0.5), -0.45, 0.43, 0.89);
  add(g, new SphereGeometry(0.035, 12, 12), clay(PALETTE.yellow, 0.3, 0.6), -0.3, 0.42, 0.94);
  // windows
  for (const [x, y] of [[0.55, 0.88]] as const) {
    add(g, rbox(0.56, 0.5, 0.06, 0.03), clay(PALETTE.white, 0.7), x, y, 0.86);
    add(g, rbox(0.46, 0.4, 0.07, 0.02), clay(PALETTE.glass, 0.12, 0.1), x, y, 0.88);
    add(g, rbox(0.04, 0.4, 0.08, 0.01), clay(PALETTE.white, 0.7), x, y, 0.9);
    add(g, rbox(0.46, 0.04, 0.08, 0.01), clay(PALETTE.white, 0.7), x, y, 0.9);
  }
  // round attic window
  const attic = add(g, new CylinderGeometry(0.15, 0.15, 0.06, 28), clay(PALETTE.glass, 0.12), 0, 1.78, 0.97);
  attic.rotation.x = Math.PI / 2;
  // step
  add(g, rbox(0.7, 0.07, 0.3, 0.03), clay(PALETTE.steel, 0.8), -0.45, 0.035, 1.0);
  // tree
  add(g, new CylinderGeometry(0.06, 0.08, 0.4, 12), clay(PALETTE.bark, 0.9), 1.75, 0.2, 0.9);
  add(g, new IcosahedronGeometry(0.34, 1), clay(PALETTE.leaf, 0.8), 1.75, 0.62, 0.9);
  add(g, new IcosahedronGeometry(0.24, 1), clay(0x4cbb7c, 0.8), 1.75, 0.95, 0.9);
  // small bush
  add(g, new IcosahedronGeometry(0.2, 1), clay(0x4cbb7c, 0.8), 1.3, 0.2, 1.2);
  return g;
}

/** Motorcycle. Front faces +x. About 2.1 long. */
export function buildBike(): Group {
  const g = new Group();
  const body = clay(PALETTE.aqua, 0.4, 0.15);
  const dark = clay(PALETTE.ink, 0.7);
  const steel = clay(PALETTE.steel, 0.3, 0.7);
  const tyre = clay(0x1c2420, 0.95);

  const wheel = (x: number) => {
    const t = add(g, new TorusGeometry(0.42, 0.1, 20, 48), tyre, x, 0.52, 0);
    t.castShadow = true;
    const disc = add(g, new CircleGeometry(0.34, 40), clay(0xdfe5e2, 0.4, 0.4), x, 0.52, 0.005);
    const disc2 = add(g, new CircleGeometry(0.34, 40), clay(0xdfe5e2, 0.4, 0.4), x, 0.52, -0.005);
    disc2.rotation.y = Math.PI;
    disc.castShadow = false;
    disc2.castShadow = false;
    const hubMesh = add(g, new CylinderGeometry(0.09, 0.09, 0.22, 20), steel, x, 0.52, 0);
    hubMesh.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const spoke = add(g, new BoxGeometry(0.62, 0.02, 0.012), steel, x, 0.52, 0.015);
      spoke.rotation.z = (i * Math.PI) / 6;
      spoke.castShadow = false;
    }
  };
  wheel(0.88);
  wheel(-0.88);

  const frontHub = new Vector3(0.88, 0.52, 0);
  const steerTop = new Vector3(0.56, 1.28, 0);
  for (const z of [-0.1, 0.1]) bar(g, frontHub.clone().setZ(z), steerTop.clone().setZ(z), 0.035, steel);
  bar(g, new Vector3(0.56, 1.3, -0.3), new Vector3(0.56, 1.3, 0.3), 0.03, dark); // handlebar
  for (const z of [-0.3, 0.3]) add(g, new SphereGeometry(0.045, 12, 12), dark, 0.56, 1.3, z);

  // headlight and fender
  add(g, new SphereGeometry(0.14, 24, 24), glow(PALETTE.yellow), 0.74, 1.12, 0);
  add(g, rbox(0.5, 0.05, 0.22, 0.02), body, 0.94, 0.98, 0);

  // frame, tank, seat, engine
  add(g, rbox(0.9, 0.4, 0.46, 0.16), body, 0.12, 1.04, 0); // tank
  add(g, rbox(0.8, 0.12, 0.36, 0.05), dark, -0.5, 0.96, 0); // seat
  add(g, rbox(0.52, 0.38, 0.3, 0.06), clay(0x56635d, 0.5, 0.4), 0.1, 0.58, 0); // engine
  add(g, rbox(0.34, 0.1, 0.26, 0.04), steel, 0.1, 0.38, 0);
  bar(g, steerTop.clone().setZ(0.04), new Vector3(0.2, 0.7, 0.04), 0.04, dark);
  bar(g, new Vector3(-0.88, 0.52, 0.12), new Vector3(-0.15, 0.66, 0.12), 0.04, dark); // swingarm
  bar(g, new Vector3(-0.88, 0.52, -0.12), new Vector3(-0.15, 0.66, -0.12), 0.04, dark);
  add(g, rbox(0.55, 0.05, 0.22, 0.02), body, -0.92, 0.98, 0); // tail
  add(g, rbox(0.06, 0.08, 0.14, 0.02), glow(0xe34948), -1.25, 0.92, 0);
  // exhaust
  const ex = add(g, new CylinderGeometry(0.07, 0.09, 0.9, 20), steel, -0.5, 0.46, 0.2);
  ex.rotation.z = Math.PI / 2 + 0.06;
  add(g, new ConeGeometry(0.07, 0.08, 20), dark, -0.97, 0.4, 0.2).rotation.z = Math.PI / 2;
  return g;
}

export function disposeTree(root: Group) {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
