import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildBike, buildCar, buildHouse, disposeTree } from './models';

export type Which = 'all' | 'car' | 'house' | 'bike';

interface Props {
  only?: Which;
  /** No spinning, no controls, fixed 3/4 angle. Used to render PNG stills. */
  still?: boolean;
}

const SPACING = 4.5;

function platform(): Group {
  const g = new Group();
  const base = new Mesh(new CylinderGeometry(2.1, 2.2, 0.22, 72), new MeshStandardMaterial({ color: 0xc9dcd1, roughness: 0.9 }));
  base.position.y = -0.2;
  base.receiveShadow = true;
  const top = new Mesh(new CylinderGeometry(2.0, 2.0, 0.1, 72), new MeshStandardMaterial({ color: 0xf8fbf9, roughness: 0.85 }));
  top.position.y = -0.04;
  top.receiveShadow = true;
  g.add(base, top);
  return g;
}

export default function Showcase3D({ only = 'all', still = false }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: still });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', only === 'all' ? '3D illustration of a car, a house and a motorbike' : `3D illustration of a ${only === 'bike' ? 'motorbike' : only}`);

    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0xcfe3d8, 1.15));
    const sun = new DirectionalLight(0xffffff, 2.6);
    sun.position.set(5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const fill = new DirectionalLight(0xdff2e8, 0.8);
    fill.position.set(-6, 3, -4);
    scene.add(fill);

    const items: Array<{ key: Exclude<Which, 'all'>; build: () => Group; turn: number; scale: number }> = [
      { key: 'car', build: buildCar, turn: -0.62, scale: 1.18 },
      { key: 'house', build: buildHouse, turn: 0.5, scale: 0.95 },
      { key: 'bike', build: buildBike, turn: -0.58, scale: 1.45 },
    ];
    const shown = items.filter((i) => only === 'all' || i.key === only);
    const spinners: Array<{ obj: Group; speed: number }> = [];
    const disposables: Group[] = [];
    shown.forEach((it, i) => {
      const holder = new Group();
      holder.position.x = only === 'all' ? (i - 1) * SPACING : 0;
      holder.add(platform());
      const obj = it.build();
      obj.rotation.y = it.turn;
      obj.scale.setScalar(it.scale);
      holder.add(obj);
      scene.add(holder);
      disposables.push(holder);
      spinners.push({ obj, speed: 0.35 + i * 0.05 });
    });

    const camera = new PerspectiveCamera(28, 1, 0.1, 100);
    const target = { x: 0, y: 0.75, z: 0 };
    const neededWidth = only === 'all' ? 15.4 : 5.4;
    const fit = () => {
      const w = el.clientWidth || 600;
      const h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      const half = Math.tan((camera.fov * Math.PI) / 360);
      const byWidth = neededWidth / (2 * half * camera.aspect);
      const byHeight = 4.6 / (2 * half);
      const dist = Math.max(byWidth, byHeight);
      camera.position.set(0, 0.75 + dist * 0.34, dist * 0.94);
      camera.lookAt(target.x, target.y, target.z);
      camera.updateProjectionMatrix();
      controls?.update();
    };

    let controls: OrbitControls | null = null;
    if (!still) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(target.x, target.y, target.z);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minPolarAngle = Math.PI * 0.22;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.minAzimuthAngle = -0.7;
      controls.maxAzimuthAngle = 0.7;
    }
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!still && !reduce) for (const s of spinners) s.obj.rotation.y += s.speed * dt;
      controls?.update();
      renderer.render(scene, camera);
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls?.dispose();
      disposables.forEach(disposeTree);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [only, still]);

  return <div ref={host} style={{ width: '100%', height: '100%' }} />;
}
