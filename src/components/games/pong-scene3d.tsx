import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ARENAS, BALL_SKINS, FIELD, PADDLE_SKINS } from "@/lib/pong/config";
import { setArenaTrack } from "@/lib/pong/audio";
import {
  ballRadius, ceilingY, cloneY, courtInset, holeY, paddleHalf,
  sentinelY, splitGap, wallY,
  type Impact,
} from "@/components/games/pong-online";

export type Quality = "auto" | "baixo" | "alto" | "ultra";

/* escala campo -> mundo */
const S = 10;
const W = FIELD.w * S;
const H = FIELD.h * S;
const toX = (fx: number) => (fx - FIELD.w / 2) * S;
const toZ = (fy: number) => (fy - FIELD.h / 2) * S;

const dur = (fx: any, id: string) => (fx?.[id] ?? 0) as number;

function detectQuality(): Exclude<Quality, "auto"> {
  if (typeof navigator === "undefined") return "alto";
  const mem = (navigator as any).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 3 || cores <= 4) return "baixo";
  if (mem >= 8 && cores >= 8) return "ultra";
  return "alto";
}

export default function PongScene3D({
  simRef,
  impactsRef,
  mySide,
  arena,
  paddleSkin,
  ballSkin,
  onTarget,
  quality = "auto",
}: {
  simRef: React.MutableRefObject<any>;
  impactsRef: React.MutableRefObject<Impact[]>;
  mySide: 0 | 1;
  arena: string;
  paddleSkin: string;
  ballSkin: string;
  onTarget: (x: number) => void;
  quality?: Quality;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sideRef = useRef<0 | 1>(mySide);
  sideRef.current = mySide;
  const targetRef = useRef(onTarget);
  targetRef.current = onTarget;

  const q = useMemo<Exclude<Quality, "auto">>(
    () => (quality === "auto" ? detectQuality() : quality),
    [quality],
  );

  useEffect(() => { setArenaTrack(arena); }, [arena]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const arenaDef = ARENAS.find((a) => a.id === arena) ?? ARENAS[0];
    const pSkin = PADDLE_SKINS.find((s) => s.id === paddleSkin) ?? PADDLE_SKINS[0];
    const bSkin = BALL_SKINS.find((s) => s.id === ballSkin) ?? BALL_SKINS[0];
    const accent = new THREE.Color(arenaDef.accent);
    const glow = new THREE.Color(arenaDef.glow);

    /* ---------------- renderer ---------------- */
    const renderer = new THREE.WebGLRenderer({
      antialias: q !== "baixo",
      powerPreference: "high-performance",
      alpha: false,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, q === "baixo" ? 1.25 : q === "alto" ? 1.8 : 2.2);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = q !== "baixo";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    /* ---------------- cena ---------------- */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(arenaDef.bg[0]);
    scene.fog = new THREE.FogExp2(new THREE.Color(arenaDef.bg[0]).getHex(), 0.012);

    const world = new THREE.Group();
    scene.add(world);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    const camBase = new THREE.Vector3(0, 15.5, 15.5);
    camera.position.copy(camBase);
    camera.lookAt(0, 0, -1);

    /* ---------------- luzes ---------------- */
    scene.add(new THREE.HemisphereLight(glow.getHex(), 0x05060a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(6, 22, 8);
    key.castShadow = q !== "baixo";
    if (key.shadow) {
      key.shadow.mapSize.set(q === "ultra" ? 2048 : 1024, q === "ultra" ? 2048 : 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 60;
      const c = key.shadow.camera as THREE.OrthographicCamera;
      c.left = -12; c.right = 12; c.top = 14; c.bottom = -14;
      c.updateProjectionMatrix();
    }
    scene.add(key);
    const rimA = new THREE.PointLight(accent.getHex(), 240, 40, 2);
    rimA.position.set(-W, 6, -H / 2);
    scene.add(rimA);
    const rimB = new THREE.PointLight(glow.getHex(), 240, 40, 2);
    rimB.position.set(W, 6, H / 2);
    scene.add(rimB);

    /* ---------------- mesa ---------------- */
    const gridTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d")!;
      g.fillStyle = "#0a0f1e";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(255,255,255,0.12)";
      g.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        const p = (i / 8) * 256;
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
        g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 3);
      t.anisotropy = 4;
      return t;
    })();

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.6, H),
      new THREE.MeshStandardMaterial({
        map: gridTex,
        color: new THREE.Color(arenaDef.bg[1]),
        roughness: 0.32,
        metalness: 0.65,
        emissive: new THREE.Color(arenaDef.bg[1]),
        emissiveIntensity: 0.25,
      }),
    );
    table.position.y = -0.3;
    table.receiveShadow = true;
    world.add(table);

    // moldura neon
    const frameMat = new THREE.MeshStandardMaterial({
      color: accent, emissive: accent, emissiveIntensity: 2.4, roughness: 0.25, metalness: 0.4,
    });
    for (const sx of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, H + 0.4), frameMat);
      bar.position.set((sx * W) / 2, 0.15, 0);
      world.add(bar);
    }
    for (const sz of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.5, 0.22), frameMat);
      bar.position.set(0, 0.15, (sz * H) / 2);
      world.add(bar);
    }

    // rede
    const netMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: glow, emissiveIntensity: 1.4,
      transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.9), netMat);
    net.rotation.x = 0;
    net.position.set(0, 0.45, 0);
    world.add(net);

    // chão reflexivo distante
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(70, 48),
      new THREE.MeshStandardMaterial({ color: 0x05060c, roughness: 0.45, metalness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.2;
    floor.receiveShadow = q !== "baixo";
    scene.add(floor);

    // pilares/arquibancada holográfica
    const pillarMat = new THREE.MeshStandardMaterial({
      color: glow, emissive: glow, emissiveIntensity: 1.1, transparent: true, opacity: 0.42,
    });
    const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 6, 0.5), pillarMat, 28);
    {
      const m = new THREE.Matrix4();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r = 20 + (i % 3) * 3;
        m.makeTranslation(Math.cos(a) * r, -0.5 + (i % 4), Math.sin(a) * r * 1.2);
        pillars.setMatrixAt(i, m);
      }
      pillars.instanceMatrix.needsUpdate = true;
    }
    scene.add(pillars);

    // estrelas
    const starGeo = new THREE.BufferGeometry();
    {
      const n = q === "baixo" ? 300 : 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 40 + Math.random() * 90;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = 5 + Math.random() * 60;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    }
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.75 }),
    );
    scene.add(stars);

    /* ---------------- raquetes ---------------- */
    const makePaddle = (color: string) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(FIELD.paddleHalf * 2 * S, 0.55, FIELD.paddleH * S * 1.6),
        new THREE.MeshStandardMaterial({
          color, emissive: new THREE.Color(color), emissiveIntensity: 1.6,
          roughness: 0.22, metalness: 0.7,
        }),
      );
      body.castShadow = q !== "baixo";
      g.add(body);
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD.paddleHalf * 2 * S * 1.6, 2.4),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color), transparent: true, opacity: 0.28,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.06;
      g.add(halo);
      g.position.y = 0.35;
      return { g, body, halo };
    };
    const pad0 = makePaddle(pSkin.color);
    const pad1 = makePaddle(arenaDef.accent);
    world.add(pad0.g, pad1.g);

    // clones / sentinelas / muralhas
    const aux = (color: string, wide = false) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(wide ? W : FIELD.paddleHalf * 2 * S, 0.4, 0.35),
        new THREE.MeshStandardMaterial({
          color, emissive: new THREE.Color(color), emissiveIntensity: 1.4,
          transparent: true, opacity: 0.85,
        }),
      );
      m.position.y = 0.3;
      m.visible = false;
      world.add(m);
      return m;
    };
    const clone0 = aux("#f472b6"), clone1 = aux("#f472b6");
    const sent0 = aux("#38bdf8"), sent1 = aux("#38bdf8");
    const wall0 = aux("#a3a3a3", true), wall1 = aux("#a3a3a3", true);
    const ceil0 = aux("#93c5fd", true), ceil1 = aux("#93c5fd", true);
    const curtainBar = aux("#c084fc", true);
    const narrowL = aux("#fb923c"), narrowR = aux("#fb923c");

    /* ---------------- bola ---------------- */
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: new THREE.Color(bSkin?.color ?? "#ffffff"),
      emissiveIntensity: 2.6, roughness: 0.15, metalness: 0.2,
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(FIELD.ballR * S, 24, 18), ballMat);
    ball.castShadow = q !== "baixo";
    world.add(ball);
    const ballLight = new THREE.PointLight(new THREE.Color(bSkin?.color ?? "#ffffff").getHex(), 60, 14, 2);
    world.add(ballLight);

    // rastro
    const TRAIL = q === "baixo" ? 10 : 22;
    const trailMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(FIELD.ballR * S, 10, 8),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(bSkin?.trail ?? "#ffffff"),
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      TRAIL,
    );
    world.add(trailMesh);
    const trail: { x: number; z: number; r: number }[] = [];

    /* ---------------- ondas de impacto ---------------- */
    const RINGS = 14;
    const ringGeo = new THREE.RingGeometry(0.5, 0.62, 40);
    const rings: { mesh: THREE.Mesh; t: number; life: number; scale: number }[] = [];
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      world.add(m);
      rings.push({ mesh: m, t: 0, life: 0, scale: 1 });
    }

    // partículas
    const PN = q === "baixo" ? 90 : 260;
    const partGeo = new THREE.BufferGeometry();
    const partPos = new Float32Array(PN * 3);
    const partCol = new Float32Array(PN * 3);
    partGeo.setAttribute("position", new THREE.BufferAttribute(partPos, 3));
    partGeo.setAttribute("color", new THREE.BufferAttribute(partCol, 3));
    const partsMesh = new THREE.Points(
      partGeo,
      new THREE.PointsMaterial({
        size: 0.32, vertexColors: true, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    world.add(partsMesh);
    const parts = Array.from({ length: PN }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
    let partCursor = 0;

    // buraco negro / refúgio
    const holeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    const holeRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.9, 48),
      new THREE.MeshBasicMaterial({
        color: 0x818cf8, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    holeRing.rotation.x = -Math.PI / 2;
    holeMesh.visible = holeRing.visible = false;
    world.add(holeMesh, holeRing);

    // zona morta
    const deadZone = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H * 0.22),
      new THREE.MeshBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0.92 }),
    );
    deadZone.rotation.x = -Math.PI / 2;
    deadZone.position.y = 0.5;
    deadZone.visible = false;
    world.add(deadZone);

    /* ---------------- pós-processamento ---------------- */
    let composer: EffectComposer | null = null;
    let bloom: UnrealBloomPass | null = null;
    if (q !== "baixo") {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), q === "ultra" ? 0.95 : 0.7, 0.75, 0.22);
      composer.addPass(bloom);
    }

    /* ---------------- resize ---------------- */
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      composer?.setSize(w, h);
      bloom?.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ---------------- input ---------------- */
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35);
    const ndc = new THREE.Vector2();
    const hitPoint = new THREE.Vector3();
    const pick = (clientX: number, clientY: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hitPoint)) return;
      const local = world.worldToLocal(hitPoint.clone());
      const fx = local.x / S + FIELD.w / 2;
      targetRef.current(Math.max(0, Math.min(FIELD.w, fx)));
    };
    const onPointer = (e: PointerEvent) => { e.preventDefault(); pick(e.clientX, e.clientY); };
    const el = renderer.domElement;
    el.addEventListener("pointerdown", onPointer, { passive: false });
    el.addEventListener("pointermove", onPointer, { passive: false });

    /* ---------------- loop ---------------- */
    const seen = new Set<number>();
    let shake = 0;
    let flash = 0;
    let raf = 0;
    let last = performance.now();
    const tmpColor = new THREE.Color();
    const mtx = new THREE.Matrix4();

    const spawnParticles = (x: number, z: number, color: string, n: number) => {
      tmpColor.set(color);
      for (let i = 0; i < n; i++) {
        const p = parts[partCursor];
        partCursor = (partCursor + 1) % PN;
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 8;
        p.x = x; p.y = 0.5; p.z = z;
        p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 2 + Math.random() * 6;
        p.life = 0.5 + Math.random() * 0.5;
        const idx = parts.indexOf(p);
        partCol[idx * 3] = tmpColor.r; partCol[idx * 3 + 1] = tmpColor.g; partCol[idx * 3 + 2] = tmpColor.b;
      }
    };

    const spawnRing = (x: number, z: number, color: string, big: boolean) => {
      const slot = rings.find((r) => r.life <= 0) ?? rings[0];
      slot.mesh.visible = true;
      slot.mesh.position.set(x, 0.45, z);
      (slot.mesh.material as THREE.MeshBasicMaterial).color.set(color);
      slot.life = big ? 0.75 : 0.45;
      slot.t = slot.life;
      slot.scale = big ? 5.5 : 2.4;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      const me = sideRef.current;
      const fxMe = sim.fx?.[me] ?? {};
      const fxFoe = sim.fx?.[me === 0 ? 1 : 0] ?? {};

      // orientação do mundo conforme o lado do jogador
      const wantRot = me === 1 ? Math.PI : 0;
      world.rotation.y += (wantRot - world.rotation.y) * Math.min(1, dt * 6);
      // Espelho Falso: inverte a visão
      const mirrored = dur(fxMe, "mirror") > 0;
      world.scale.x += ((mirrored ? -1 : 1) - world.scale.x) * Math.min(1, dt * 8);

      /* bola */
      const R = ballRadius(sim) * S;
      const bx = toX(sim.bx), bz = toZ(sim.by);
      ball.position.set(bx, 0.5, bz);
      ball.scale.setScalar(R / (FIELD.ballR * S));
      ball.rotation.x += dt * 6; ball.rotation.z += dt * 4;
      ballLight.position.set(bx, 1.4, bz);

      const ghosted = dur(fxMe, "ghost") > 0 && (me === 0 ? sim.by > FIELD.h / 2 : sim.by < FIELD.h / 2);
      const inDead = dur(fxMe, "deadzone") > 0 &&
        Math.abs(sim.by - (me === 0 ? FIELD.h * 0.72 : FIELD.h * 0.28)) < FIELD.h * 0.11;
      const vis = !ghosted && !inDead;
      ball.visible = vis;
      ballLight.intensity = vis ? 60 : 0;

      /* rastro */
      trail.unshift({ x: bx, z: bz, r: R });
      if (trail.length > TRAIL) trail.pop();
      for (let i = 0; i < TRAIL; i++) {
        const t = trail[i];
        const k = 1 - i / TRAIL;
        if (!t || !vis) { mtx.makeScale(0, 0, 0); }
        else { mtx.makeScale(k * 0.9, k * 0.9, k * 0.9); mtx.setPosition(t.x, 0.5, t.z); }
        trailMesh.setMatrixAt(i, mtx);
      }
      trailMesh.instanceMatrix.needsUpdate = true;

      /* raquetes */
      const half0 = paddleHalf(sim.fx?.[0] ?? {}, sim.mom?.[0] ?? 0) * 2 * S;
      const half1 = paddleHalf(sim.fx?.[1] ?? {}, sim.mom?.[1] ?? 0) * 2 * S;
      pad0.g.position.set(toX(sim.p0), 0.35, toZ(FIELD.h - FIELD.paddleInset));
      pad1.g.position.set(toX(sim.p1), 0.35, toZ(FIELD.paddleInset));
      pad0.body.scale.x = half0 / (FIELD.paddleHalf * 2 * S);
      pad1.body.scale.x = half1 / (FIELD.paddleHalf * 2 * S);
      pad0.halo.scale.x = pad0.body.scale.x;
      pad1.halo.scale.x = pad1.body.scale.x;
      // Divisão: abre a raquete ao meio
      pad0.body.scale.z = 1 + splitGap(sim.fx?.[0] ?? {}) * 0.2;
      pad1.body.scale.z = 1 + splitGap(sim.fx?.[1] ?? {}) * 0.2;
      // Camuflagem: some para o adversário
      pad0.g.visible = !(me === 1 && dur(sim.fx?.[0] ?? {}, "stealth") > 0);
      pad1.g.visible = !(me === 0 && dur(sim.fx?.[1] ?? {}, "stealth") > 0);
      // brilho conforme buffs
      const aura = (fx: any) =>
        dur(fx, "fury") > 0 ? "#f97316" : dur(fx, "parry") > 0 ? "#fde047"
          : dur(fx, "shield") > 0 ? "#22d3ee" : dur(fx, "freeze") > 0 ? "#67e8f9"
            : dur(fx, "momentum") > 0 ? "#f59e0b" : null;
      for (const [pad, fx] of [[pad0, sim.fx?.[0] ?? {}], [pad1, sim.fx?.[1] ?? {}]] as const) {
        const a = aura(fx);
        const mat = pad.halo.material as THREE.MeshBasicMaterial;
        mat.opacity = a ? 0.55 + Math.sin(now / 120) * 0.15 : 0.28;
        if (a) mat.color.set(a);
        else mat.color.set(pad === pad0 ? pSkin.color : arenaDef.accent);
      }

      /* auxiliares */
      const setAux = (m: THREE.Mesh, on: boolean, x: number, z: number, sx = 1) => {
        m.visible = on;
        if (on) { m.position.set(x, 0.3, z); m.scale.x = sx; }
      };
      setAux(clone0, dur(sim.fx?.[0] ?? {}, "clone") > 0, toX(sim.p0), toZ(cloneY(0)));
      setAux(clone1, dur(sim.fx?.[1] ?? {}, "clone") > 0, toX(sim.p1), toZ(cloneY(1)));
      setAux(sent0, dur(sim.fx?.[0] ?? {}, "sentinel") > 0, toX(sim.g0 ?? 0.5), toZ(sentinelY(0)), 0.6);
      setAux(sent1, dur(sim.fx?.[1] ?? {}, "sentinel") > 0, toX(sim.g1 ?? 0.5), toZ(sentinelY(1)), 0.6);
      setAux(wall0, dur(sim.fx?.[0] ?? {}, "wall") > 0, 0, toZ(wallY(0)));
      setAux(wall1, dur(sim.fx?.[1] ?? {}, "wall") > 0, 0, toZ(wallY(1)));
      setAux(ceil0, dur(sim.fx?.[0] ?? {}, "ceiling") > 0, 0, toZ(ceilingY(0)));
      setAux(ceil1, dur(sim.fx?.[1] ?? {}, "ceiling") > 0, 0, toZ(ceilingY(1)));
      const curtainOn = dur(sim.fx?.[0] ?? {}, "curtain") > 0 || dur(sim.fx?.[1] ?? {}, "curtain") > 0;
      setAux(curtainBar, curtainOn, 0, 0, 0.6);
      if (curtainOn) curtainBar.position.y = 1.1;
      const inset = courtInset(fxMe);
      setAux(narrowL, inset > 0, toX(inset), 0, 0.2);
      setAux(narrowR, inset > 0, toX(FIELD.w - inset), 0, 0.2);
      if (inset > 0) { narrowL.scale.z = H / 0.35; narrowR.scale.z = H / 0.35; }

      // rede alta
      const netOn = dur(sim.fx?.[0] ?? {}, "netrise") > 0 || dur(sim.fx?.[1] ?? {}, "netrise") > 0;
      net.scale.y = netOn ? 2.4 : 1;
      netMat.opacity = netOn ? 0.7 : 0.3;

      // buraco negro / refúgio
      let holeSide: 0 | 1 | null = null;
      if (dur(sim.fx?.[0] ?? {}, "blackhole") > 0) holeSide = 0;
      else if (dur(sim.fx?.[1] ?? {}, "blackhole") > 0) holeSide = 1;
      holeMesh.visible = holeRing.visible = holeSide !== null;
      if (holeSide !== null) {
        holeMesh.position.set(0, 0.6, toZ(holeY(holeSide)));
        holeRing.position.set(0, 0.55, toZ(holeY(holeSide)));
        holeRing.rotation.z += dt * 2.4;
        holeRing.scale.setScalar(1 + Math.sin(now / 260) * 0.08);
      }

      // zona morta
      const dz = dur(fxMe, "deadzone") > 0;
      deadZone.visible = dz;
      if (dz) deadZone.position.z = toZ(me === 0 ? FIELD.h * 0.72 : FIELD.h * 0.28);

      /* impactos novos */
      const list = impactsRef.current;
      for (let i = Math.max(0, list.length - 12); i < list.length; i++) {
        const im = list[i];
        if (!im || seen.has(im.t)) continue;
        seen.add(im.t);
        const ix = toX(im.x), iz = toZ(im.y);
        spawnRing(ix, iz, im.color, !!im.big);
        spawnParticles(ix, iz, im.color, im.big ? (q === "baixo" ? 8 : 22) : q === "baixo" ? 3 : 9);
        if (im.kind === "goal") { shake = 0.9; flash = 0.5; }
        else if (im.kind === "rewind") { shake = 0.7; flash = 0.85; }
        else if (im.big) shake = Math.max(shake, 0.45);
        else shake = Math.max(shake, 0.16);
      }
      if (seen.size > 400) seen.clear();

      /* anéis */
      for (const r of rings) {
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        r.life -= dt;
        const k = 1 - r.life / r.t;
        r.mesh.scale.setScalar(0.4 + k * r.scale);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.8;
      }

      /* partículas */
      for (let i = 0; i < PN; i++) {
        const p = parts[i];
        if (p.life <= 0) { partPos[i * 3 + 1] = -999; continue; }
        p.life -= dt;
        p.vy -= 16 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.3) { p.y = 0.3; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
        partPos[i * 3] = p.x; partPos[i * 3 + 1] = p.y; partPos[i * 3 + 2] = p.z;
      }
      partGeo.attributes.position.needsUpdate = true;
      partGeo.attributes.color.needsUpdate = true;

      /* câmera cinematográfica */
      shake = Math.max(0, shake - dt * 2.2);
      flash = Math.max(0, flash - dt * 2);
      const followX = THREE.MathUtils.clamp(toX(sim.bx) * 0.18, -2.4, 2.4);
      const rally = Math.min(1, (sim.rally ?? 0) / 8);
      const targetY = camBase.y - rally * 1.6;
      const targetZ = camBase.z - rally * 1.2;
      camera.position.x += (followX - camera.position.x) * Math.min(1, dt * 2.4);
      camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 1.6);
      camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 1.6);
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.9;
        camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      }
      camera.lookAt(THREE.MathUtils.clamp(toX(sim.bx) * 0.1, -1.6, 1.6), 0, -1.2);

      stars.rotation.y += dt * 0.012;
      pillars.rotation.y += dt * 0.03;
      rimA.intensity = 200 + Math.sin(now / 420) * 80;
      rimB.intensity = 200 + Math.cos(now / 380) * 80;
      if (bloom) bloom.strength = (q === "ultra" ? 0.95 : 0.7) + flash * 1.2 + rally * 0.25;

      /* overlays de estado (névoa, clarão) */
      const ov = overlayRef.current;
      if (ov) {
        const fogA = dur(fxMe, "fog") > 0 ? 0.72 : 0;
        const blindA = dur(fxMe, "blind") > 0 ? 0.85 : 0;
        ov.style.setProperty("--fogA", String(fogA));
        ov.style.setProperty("--blindA", String(blindA));
      }
      void fxFoe;

      if (composer) composer.render();
      else renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onPointer);
      el.removeEventListener("pointermove", onPointer);
      composer?.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      gridTex.dispose();
      if (el.parentNode === host) host.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arena, paddleSkin, ballSkin, q]);

  return (
    <div ref={hostRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0"
        style={{ ["--fogA" as any]: 0, ["--blindA" as any]: 0 }}
      >
        <div
          className="absolute inset-0 backdrop-blur-md transition-opacity duration-300"
          style={{ opacity: "var(--fogA)" as any, background: "radial-gradient(circle at 50% 60%, rgba(203,213,225,.35), rgba(15,23,42,.85))" }}
        />
        <div
          className="absolute inset-0 bg-white transition-opacity duration-150"
          style={{ opacity: "var(--blindA)" as any }}
        />
      </div>
    </div>
  );
}
