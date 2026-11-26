import * as THREE from 'three';

export type SanctumCameraMode = 'pack' | 'dating' | 'guess';

interface BirdRig {
  group: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  radius: number;
  speed: number;
  phase: number;
  height: number;
}

interface ShardRig {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  radialDir: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  phase: number;
}

interface ArchBayRig {
  group: THREE.Group;
  basePos: THREE.Vector3;
  explodeDir: THREE.Vector3;
}

interface FallingNoteRig {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  baseY: number;
  speed: number;
  height: number;
}

interface ProunDiscRig {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  rotSpeed: number;
  phase: number;
}

/**
 * PROUN Constructivist x osu! 3D Sanctum (`方案 A`):
 * minimalist architectural colonnade piers, diagonal Constructivist steel beams & discs,
 * perspective flanking osu!mania 4K falling note/LN columns, breathing osu! Hit Circle
 * Approach Ring centerpiece, blueprint wireframe mode & pulse transitions.
 */
export class GachaSanctumWorld {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.2, 220);
  private root = new THREE.Group();

  private hemiLight = new THREE.HemisphereLight('#f5fbff', '#748a91', 2.4);
  private keyLight = new THREE.DirectionalLight('#fffced', 2.9);
  private rimLight = new THREE.DirectionalLight('#6b8fff', 1.8);
  private pulseLight = new THREE.PointLight('#3a5bc2', 0, 56, 1.5);

  private stoneMat: THREE.MeshStandardMaterial;
  private cobaltMat: THREE.MeshStandardMaterial;
  private signalMat: THREE.MeshStandardMaterial;
  private glassMat: THREE.MeshStandardMaterial;
  private noteMat: THREE.MeshStandardMaterial;
  private lnMat: THREE.MeshStandardMaterial;
  private receptorMat: THREE.MeshStandardMaterial;
  private wingMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private wireGridMat: THREE.LineBasicMaterial;
  private wireframeMats: THREE.MeshStandardMaterial[] = [];

  private archBays: ArchBayRig[] = [];
  private prounGroup = new THREE.Group();
  private prounDiscs: ProunDiscRig[] = [];
  private fallingNotes: FallingNoteRig[] = [];
  private approachRing!: THREE.Mesh;
  private hitCircleDisc!: THREE.Mesh;
  private astrolabeGroup = new THREE.Group();
  private astrolabeRings: THREE.Mesh[] = [];
  private astrolabeCore!: THREE.Mesh;
  private shards: ShardRig[] = [];
  private birds: BirdRig[] = [];
  private floorGroup = new THREE.Group();

  private resizeObserver: ResizeObserver | null = null;
  private rafId = 0;
  private disposed = false;
  private hiddenPaused = false;
  private reducedMotion = false;
  private lastTime = 0;
  private clock = 0;

  private isDark = false;
  private accentColor = new THREE.Color('#3a5bc2');
  private explodeAmount = 0;
  private explodeVelocity = 0;

  private pointerTarget = new THREE.Vector2(0, 0);
  private pointerSmooth = new THREE.Vector2(0, 0);

  private camPosCurrent = new THREE.Vector3(0, 5.4, 14.5);
  private camAimCurrent = new THREE.Vector3(0, 4.4, -18);
  private camPosTarget = new THREE.Vector3(0, 5.4, 14.5);
  private camAimTarget = new THREE.Vector3(0, 4.4, -18);

  constructor(container: HTMLElement) {
    this.container = container;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.stoneMat = new THREE.MeshStandardMaterial({
      color: '#f2f5f4',
      roughness: 0.72,
      metalness: 0.08,
    });
    this.cobaltMat = new THREE.MeshStandardMaterial({
      color: '#3a5bc2',
      emissive: '#223ca0',
      emissiveIntensity: 0.36,
      roughness: 0.34,
      metalness: 0.45,
    });
    this.signalMat = new THREE.MeshStandardMaterial({
      color: '#d62828',
      emissive: '#a61c1c',
      emissiveIntensity: 0.26,
      roughness: 0.38,
      metalness: 0.32,
    });
    this.glassMat = new THREE.MeshStandardMaterial({
      color: '#dbe6f8',
      emissive: '#3a5bc2',
      emissiveIntensity: 0.14,
      roughness: 0.25,
      metalness: 0.2,
      transparent: true,
      opacity: 0.42,
    });
    this.noteMat = new THREE.MeshStandardMaterial({
      color: '#3a5bc2',
      emissive: '#3a5bc2',
      emissiveIntensity: 0.42,
      roughness: 0.28,
      metalness: 0.38,
      transparent: true,
      opacity: 0.78,
    });
    this.lnMat = new THREE.MeshStandardMaterial({
      color: '#6b8fff',
      emissive: '#3a5bc2',
      emissiveIntensity: 0.24,
      roughness: 0.32,
      metalness: 0.25,
      transparent: true,
      opacity: 0.42,
    });
    this.receptorMat = new THREE.MeshStandardMaterial({
      color: '#1b2125',
      emissive: '#3a5bc2',
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.55,
    });
    this.wingMat = new THREE.MeshStandardMaterial({
      color: '#20262b',
      emissive: '#3a5bc2',
      emissiveIntensity: 0.12,
      roughness: 0.55,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    this.floorMat = new THREE.MeshStandardMaterial({
      color: '#e2e8e6',
      roughness: 0.48,
      metalness: 0.12,
    });
    this.wireGridMat = new THREE.LineBasicMaterial({
      color: '#3a5bc2',
      transparent: true,
      opacity: 0.22,
    });

    this.wireframeMats = [
      this.stoneMat,
      this.cobaltMat,
      this.signalMat,
      this.glassMat,
      this.noteMat,
      this.lnMat,
      this.wingMat,
    ];

    this.scene.background = new THREE.Color('#e6ebeb');
    this.scene.fog = new THREE.Fog('#e6ebeb', 22, 92);

    this.keyLight.position.set(-14, 24, 14);
    this.rimLight.position.set(18, 12, -24);
    this.pulseLight.position.set(0, 6.5, -18);
    this.scene.add(this.hemiLight, this.keyLight, this.rimLight, this.pulseLight);
    this.scene.add(this.root);

    this.buildArchitecture();
    this.buildProunAndOsuColumns();
    this.buildAstrolabe();
    this.buildShardsAndWings();
    this.buildFloor();

    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
      this.container.appendChild(renderer.domElement);
      this.renderer = renderer;
    } catch {
      this.renderer = null;
      return;
    }

    this.handleResize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('visibilitychange', this.handleVisibility);

    if (this.reducedMotion) {
      this.renderFrame(0.016);
    } else {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.rafId);
  };

  private handleVisibility = () => {
    this.hiddenPaused = document.hidden;
    if (!this.hiddenPaused && !this.disposed && !this.reducedMotion && this.renderer) {
      this.lastTime = performance.now();
      cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private buildArchitecture() {
    const pierGeom = new THREE.BoxGeometry(0.9, 13.2, 0.9);
    const plinthGeom = new THREE.BoxGeometry(1.45, 0.9, 1.45);
    const beamGeom = new THREE.BoxGeometry(0.45, 8.6, 0.45);
    const ribGeom = new THREE.BoxGeometry(15.2, 0.34, 0.38);

    const bayCount = 6;
    for (let i = 0; i < bayCount; i += 1) {
      const z = -6 - i * 8.2;
      const bayGroup = new THREE.Group();
      bayGroup.position.set(0, 0, z);

      for (const side of [-1, 1]) {
        const x = side * 9.2;
        const pier = new THREE.Mesh(pierGeom, this.stoneMat);
        pier.position.set(x, 6.6, 0);
        const plinth = new THREE.Mesh(plinthGeom, this.stoneMat);
        plinth.position.set(x, 0.45, 0);

        const strut = new THREE.Mesh(beamGeom, this.stoneMat);
        strut.position.set(side * 5.2, 13.6, 0);
        strut.rotation.z = side * 0.68;

        const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.cobaltMat);
        finial.position.set(x, 14.0, 0);

        bayGroup.add(pier, plinth, strut, finial);
      }

      const topTie = new THREE.Mesh(ribGeom, this.glassMat);
      topTie.position.set(0, 12.6, 0);
      bayGroup.add(topTie);

      this.root.add(bayGroup);
      this.archBays.push({
        group: bayGroup,
        basePos: bayGroup.position.clone(),
        explodeDir: new THREE.Vector3(0, 0.35 + i * 0.14, -i * 0.25),
      });
    }

    // Apse Rose Window Halo in far nave
    const roseRingOuter = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.22, 10, 64), this.stoneMat);
    roseRingOuter.position.set(0, 8.8, -50);
    const roseRingInner = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.14, 10, 48), this.cobaltMat);
    roseRingInner.position.set(0, 8.8, -49.7);
    this.root.add(roseRingOuter, roseRingInner);
  }

  private buildProunAndOsuColumns() {
    // 1. Constructivist PROUN Diagonal Steel Beams & Floating Planes
    const girderGeom = new THREE.BoxGeometry(24, 0.38, 0.42);
    const girderA = new THREE.Mesh(girderGeom, this.signalMat);
    girderA.position.set(-3.2, 7.6, -24);
    girderA.rotation.set(0.08, 0.16, -0.44);

    const girderB = new THREE.Mesh(new THREE.BoxGeometry(20, 0.26, 0.32), this.cobaltMat);
    girderB.position.set(4.1, 8.8, -32);
    girderB.rotation.set(-0.06, -0.14, 0.38);

    const beamC = new THREE.Mesh(new THREE.BoxGeometry(15, 0.18, 0.24), this.stoneMat);
    beamC.position.set(0.4, 3.4, -38);
    beamC.rotation.set(0.04, 0.08, -0.19);
    this.prounGroup.add(girderA, girderB, beamC);

    // Floating flat Constructivist geometric discs
    const discSpecs = [
      { r: 2.4, h: 0.12, mat: this.signalMat, pos: new THREE.Vector3(-6.2, 8.2, -28), rx: 1.25, ry: 0.35, speed: 0.14 },
      { r: 1.85, h: 0.1, mat: this.cobaltMat, pos: new THREE.Vector3(6.8, 7.1, -34), rx: 1.18, ry: -0.42, speed: -0.18 },
    ];
    for (const d of discSpecs) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.h, 40), d.mat);
      mesh.position.copy(d.pos);
      mesh.rotation.set(d.rx, d.ry, 0);
      this.prounGroup.add(mesh);
      this.prounDiscs.push({ mesh, basePos: d.pos.clone(), rotSpeed: d.speed, phase: d.pos.x });
    }
    this.root.add(this.prounGroup);

    // 2. Flanking Perspective osu!mania 4K Falling Note & LN Columns
    const trackCenters = [
      { baseX: -12.8, z: -20 },
      { baseX: 10.6, z: -22 },
    ];
    const colRailGeom = new THREE.BoxGeometry(0.06, 15.5, 0.06);
    const receptorGeom = new THREE.BoxGeometry(3.15, 0.14, 0.34);

    for (let tIdx = 0; tIdx < trackCenters.length; tIdx += 1) {
      const track = trackCenters[tIdx];
      const receptor = new THREE.Mesh(receptorGeom, this.receptorMat);
      receptor.position.set(track.baseX + 1.05, 0.15, track.z);
      this.root.add(receptor);

      // Vertical 4K lane divider rails
      for (let lane = 0; lane <= 4; lane += 1) {
        const rail = new THREE.Mesh(colRailGeom, this.glassMat);
        rail.position.set(track.baseX - 0.52 + lane * 0.72, 7.8, track.z);
        this.root.add(rail);
      }

      // 12 falling notes + tall LN bars per flanking column (24 total)
      for (let k = 0; k < 12; k += 1) {
        const lane = k % 4;
        const isLn = k % 3 === 1;
        const h = isLn ? 1.85 + (k % 2) * 0.85 : 0.28;
        const geom = new THREE.BoxGeometry(0.54, h, 0.18);
        const mat = isLn ? this.lnMat : lane === 1 || lane === 2 ? this.signalMat : this.noteMat;
        const mesh = new THREE.Mesh(geom, mat);
        const x = track.baseX - 0.16 + lane * 0.72;
        const y = 1.2 + ((k * 1.18 + tIdx * 0.55) % 13.5);
        mesh.position.set(x, y, track.z);
        this.root.add(mesh);
        this.fallingNotes.push({
          mesh,
          x,
          z: track.z,
          baseY: y,
          speed: 2.3 + (tIdx === 0 ? 0.25 : 0),
          height: h,
        });
      }
    }
  }

  private buildAstrolabe() {
    this.astrolabeGroup.position.set(0, 6.2, -22);

    const ringSpecs = [
      { r: 4.9, tube: 0.085, mat: this.cobaltMat, rx: 0.42, ry: 0.2 },
      { r: 3.7, tube: 0.055, mat: this.stoneMat, rx: -0.68, ry: 0.45 },
      { r: 2.6, tube: 0.05, mat: this.signalMat, rx: 0.18, ry: -0.52 },
    ];

    for (const spec of ringSpecs) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(spec.r, spec.tube, 12, 72), spec.mat);
      m.rotation.set(spec.rx, spec.ry, 0);
      this.astrolabeGroup.add(m);
      this.astrolabeRings.push(m);
    }

    // Center osu! Hit Circle + Contracting Approach Ring
    this.hitCircleDisc = new THREE.Mesh(new THREE.CircleGeometry(1.18, 48), this.glassMat);
    const hitOutline = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.09, 12, 56), this.cobaltMat);
    this.hitCircleDisc.add(hitOutline);
    this.astrolabeGroup.add(this.hitCircleDisc);

    this.approachRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.048, 10, 56), this.signalMat);
    this.approachRing.position.z = 0.08;
    this.astrolabeGroup.add(this.approachRing);

    this.astrolabeCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), this.cobaltMat);
    this.astrolabeCore.position.z = 0.12;
    this.astrolabeGroup.add(this.astrolabeCore);
    this.root.add(this.astrolabeGroup);
  }

  private buildShardsAndWings() {
    const shardGeom = new THREE.OctahedronGeometry(0.55, 0);
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2;
      const dist = 5.5 + (i % 3) * 3.8;
      const bx = Math.cos(angle) * dist;
      const by = 2.6 + (i % 5) * 2.1;
      const bz = -14 - (i % 6) * 5.2;
      const mesh = new THREE.Mesh(shardGeom, i % 3 === 0 ? this.cobaltMat : this.stoneMat);
      mesh.scale.set(0.7, 1.8, 0.55);
      mesh.position.set(bx, by, bz);
      this.root.add(mesh);
      this.shards.push({
        mesh,
        basePos: mesh.position.clone(),
        radialDir: new THREE.Vector3(Math.cos(angle), 0.35, Math.sin(angle) * 0.4).normalize(),
        rotSpeed: new THREE.Vector3(0.18 + (i % 3) * 0.08, 0.25 + (i % 4) * 0.07, 0.14),
        phase: i * 0.65,
      });
    }

    const wingGeom = new THREE.BufferGeometry();
    wingGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 0, 0.85, 0.18, -0.35, 0.25, 0, -0.68]),
        3,
      ),
    );
    wingGeom.computeVertexNormals();

    for (let i = 0; i < 7; i += 1) {
      const g = new THREE.Group();
      const left = new THREE.Mesh(wingGeom, this.wingMat);
      left.scale.x = -1;
      const right = new THREE.Mesh(wingGeom, this.wingMat);
      g.add(left, right);
      this.root.add(g);
      this.birds.push({
        group: g,
        leftWing: left,
        rightWing: right,
        radius: 6 + (i % 4) * 3.4,
        speed: 0.26 + (i % 3) * 0.08,
        phase: i * 1.15,
        height: 4.5 + (i % 3) * 2.2,
      });
    }
  }

  private buildFloor() {
    this.floorGroup.position.y = -0.02;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), this.floorMat);
    plane.rotation.x = -Math.PI / 2;
    this.floorGroup.add(plane);

    // Architectural polar drafting rings + crosshairs on floor
    const pts: THREE.Vector3[] = [];
    for (const r of [6, 12, 20, 32]) {
      const segs = 64;
      for (let i = 0; i < segs; i += 1) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(Math.cos(a0) * r, 0.02, Math.sin(a0) * r - 18),
          new THREE.Vector3(Math.cos(a1) * r, 0.02, Math.sin(a1) * r - 18),
        );
      }
    }
    pts.push(
      new THREE.Vector3(-40, 0.02, -18),
      new THREE.Vector3(40, 0.02, -18),
      new THREE.Vector3(0, 0.02, 12),
      new THREE.Vector3(0, 0.02, -56),
    );
    const gridLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      this.wireGridMat,
    );
    this.floorGroup.add(gridLines);
    this.root.add(this.floorGroup);
  }

  setTheme(isDark: boolean, accentHex = '#3a5bc2', canvasHex?: string) {
    this.isDark = isDark;
    try {
      this.accentColor.set(accentHex || (isDark ? '#6c8eff' : '#3a5bc2'));
    } catch {
      this.accentColor.set(isDark ? '#6c8eff' : '#3a5bc2');
    }

    const fallbackBg = isDark ? '#0b0c12' : '#eef1f5';
    const bgColor = new THREE.Color(fallbackBg);
    if (canvasHex) {
      try {
        bgColor.set(canvasHex);
      } catch {
        bgColor.set(fallbackBg);
      }
    }

    this.scene.background = bgColor.clone();
    this.scene.fog = new THREE.Fog(bgColor.clone(), 20, 88);

    const hsl = { h: 0, s: 0, l: 0 };
    this.accentColor.getHSL(hsl);
    const accentNearRed = (hsl.h < 0.06 || hsl.h > 0.93) && hsl.s > 0.35;
    const signalHex = accentNearRed ? (isDark ? '#f59e0b' : '#1b2125') : isDark ? '#ef476f' : '#d62828';
    this.signalMat.color.set(signalHex);
    this.signalMat.emissive.set(signalHex);
    this.signalMat.emissiveIntensity = isDark ? 0.38 : 0.18;

    if (isDark) {
      const pierColor = bgColor.clone().lerp(new THREE.Color('#344166'), 0.36);
      const floorColor = bgColor.clone().lerp(new THREE.Color('#13192b'), 0.45);
      this.stoneMat.color.copy(pierColor);
      this.stoneMat.roughness = 0.56;
      this.floorMat.color.copy(floorColor);
      this.wingMat.color.copy(this.accentColor).lerp(new THREE.Color('#ffffff'), 0.45);
      this.hemiLight.color.set('#b8ccff');
      this.hemiLight.groundColor.copy(bgColor);
      this.hemiLight.intensity = 2.05;
      this.keyLight.intensity = 2.35;
      this.cobaltMat.color.copy(this.accentColor);
      this.cobaltMat.emissive.copy(this.accentColor);
      this.cobaltMat.emissiveIntensity = 0.62;
      this.noteMat.color.copy(this.accentColor);
      this.noteMat.emissive.copy(this.accentColor);
      this.noteMat.emissiveIntensity = 0.68;
      this.lnMat.color.copy(this.accentColor).lerp(new THREE.Color('#ffffff'), 0.32);
      this.lnMat.emissive.copy(this.accentColor);
      this.receptorMat.color.set('#222a3a');
      this.receptorMat.emissive.copy(this.accentColor);
      this.glassMat.color.copy(this.accentColor).lerp(new THREE.Color('#1a2442'), 0.45);
      this.glassMat.emissive.copy(this.accentColor);
      this.glassMat.emissiveIntensity = 0.34;
      this.wireGridMat.color.copy(this.accentColor);
      this.wireGridMat.opacity = 0.32;
    } else {
      const pierColor = bgColor.clone().lerp(new THREE.Color('#ffffff'), 0.55);
      const floorColor = bgColor.clone().lerp(new THREE.Color('#d2dce0'), 0.35);
      this.stoneMat.color.copy(pierColor);
      this.stoneMat.roughness = 0.68;
      this.floorMat.color.copy(floorColor);
      this.wingMat.color.set('#1f262e');
      this.hemiLight.color.set('#ffffff');
      this.hemiLight.groundColor.set('#7a8f96');
      this.hemiLight.intensity = 2.35;
      this.keyLight.intensity = 2.85;
      this.cobaltMat.color.copy(this.accentColor);
      this.cobaltMat.emissive.copy(this.accentColor);
      this.cobaltMat.emissiveIntensity = 0.28;
      this.noteMat.color.copy(this.accentColor);
      this.noteMat.emissive.copy(this.accentColor);
      this.noteMat.emissiveIntensity = 0.3;
      this.lnMat.color.copy(this.accentColor).lerp(new THREE.Color('#eef4ff'), 0.45);
      this.lnMat.emissive.copy(this.accentColor);
      this.receptorMat.color.set('#1f262e');
      this.receptorMat.emissive.copy(this.accentColor);
      this.glassMat.color.copy(this.accentColor).lerp(new THREE.Color('#eef4ff'), 0.68);
      this.glassMat.emissive.copy(this.accentColor);
      this.glassMat.emissiveIntensity = 0.16;
      this.wireGridMat.color.copy(this.accentColor);
      this.wireGridMat.opacity = 0.28;
    }
    this.rimLight.color.copy(this.accentColor);
  }

  setMode(mode: SanctumCameraMode) {
    if (mode === 'pack') {
      this.camPosTarget.set(0, 5.4, 14.5);
      this.camAimTarget.set(0, 4.4, -18);
    } else if (mode === 'dating') {
      this.camPosTarget.set(4.8, 4.2, 13.0);
      this.camAimTarget.set(-1.0, 4.0, -16);
    } else {
      this.camPosTarget.set(-3.8, 7.6, 15.2);
      this.camAimTarget.set(0.4, 4.2, -17);
    }
    if (this.reducedMotion) {
      this.camPosCurrent.copy(this.camPosTarget);
      this.camAimCurrent.copy(this.camAimTarget);
      this.renderFrame(0.016);
    }
  }

  setBlueprint(enabled: boolean) {
    for (const mat of this.wireframeMats) {
      mat.wireframe = enabled;
    }
    this.wireGridMat.opacity = enabled ? (this.isDark ? 0.56 : 0.48) : this.isDark ? 0.24 : 0.22;
    if (this.reducedMotion) {
      this.renderFrame(0.016);
    }
  }

  setPointer(nx: number, ny: number) {
    this.pointerTarget.set(nx, ny);
  }

  triggerPulse(intensity = 1, hexColor?: string) {
    this.explodeVelocity += intensity * 4.2;
    if (hexColor) {
      this.pulseLight.color.set(hexColor);
    } else {
      this.pulseLight.color.copy(this.accentColor);
    }
    this.pulseLight.intensity = 28 * intensity;
  }

  private handleResize() {
    if (!this.renderer) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private loop = (now: number) => {
    if (this.disposed || this.hiddenPaused || !this.renderer) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.renderFrame(dt);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private renderFrame(dt: number) {
    if (!this.renderer) return;
    this.clock += dt;

    // Dampen pointer and camera transitions
    const pFactor = 1 - Math.exp(-dt * 4.5);
    this.pointerSmooth.lerp(this.pointerTarget, pFactor);

    const cFactor = 1 - Math.exp(-dt * 3.8);
    this.camPosCurrent.lerp(this.camPosTarget, cFactor);
    this.camAimCurrent.lerp(this.camAimTarget, cFactor);

    this.camera.position.set(
      this.camPosCurrent.x + this.pointerSmooth.x * 1.15,
      this.camPosCurrent.y - this.pointerSmooth.y * 0.65,
      this.camPosCurrent.z,
    );
    this.camera.lookAt(this.camAimCurrent);

    // Explode / breathing impulse decay
    this.explodeAmount = THREE.MathUtils.clamp(
      this.explodeAmount + this.explodeVelocity * dt,
      0,
      1.6,
    );
    this.explodeVelocity *= Math.exp(-dt * 5.2);
    this.explodeAmount *= Math.exp(-dt * 2.2);
    this.pulseLight.intensity *= Math.exp(-dt * 3.4);

    for (const bay of this.archBays) {
      bay.group.position.copy(bay.basePos).addScaledVector(bay.explodeDir, this.explodeAmount * 2.2);
    }

    // Astrolabe & osu! Approach Ring breathing cycle
    if (this.astrolabeRings[0]) this.astrolabeRings[0].rotation.z += dt * 0.16;
    if (this.astrolabeRings[1]) this.astrolabeRings[1].rotation.x += dt * 0.21;
    if (this.astrolabeRings[2]) this.astrolabeRings[2].rotation.y -= dt * 0.28;
    if (this.approachRing) {
      const cycle = (this.clock * 0.45) % 1;
      const appScale = 1.9 - cycle * 0.9;
      this.approachRing.scale.setScalar(appScale + this.explodeAmount * 0.35);
    }
    if (this.astrolabeCore) {
      this.astrolabeCore.rotation.y += dt * 0.42;
      this.astrolabeCore.rotation.x += dt * 0.24;
      const coreScale = 1 + this.explodeAmount * 0.35;
      this.astrolabeCore.scale.setScalar(coreScale);
    }

    // PROUN floating Constructivist discs
    for (const disc of this.prounDiscs) {
      disc.mesh.rotation.z += dt * disc.rotSpeed;
      disc.mesh.position.y = disc.basePos.y + Math.sin(this.clock * 0.65 + disc.phase) * 0.32;
    }

    // Falling osu!mania 4K notes & LN pillars
    const noteBoost = 1 + this.explodeAmount * 1.4;
    for (const note of this.fallingNotes) {
      let ny = note.mesh.position.y - dt * note.speed * noteBoost;
      if (ny < 0.25 + note.height * 0.5) {
        ny = 14.5 + note.height * 0.5;
      }
      note.mesh.position.y = ny;
    }

    // Orbiting shards
    for (const s of this.shards) {
      const floatY = Math.sin(this.clock * 0.9 + s.phase) * 0.45;
      s.mesh.position
        .copy(s.basePos)
        .addScaledVector(s.radialDir, this.explodeAmount * 3.4);
      s.mesh.position.y += floatY;
      s.mesh.rotation.x += dt * s.rotSpeed.x;
      s.mesh.rotation.y += dt * s.rotSpeed.y;
    }

    // Flapping architectural wings
    for (const b of this.birds) {
      const a = this.clock * b.speed + b.phase;
      const x = Math.cos(a) * b.radius;
      const z = -22 + Math.sin(a) * (b.radius * 0.65);
      const y = b.height + Math.sin(a * 2.1) * 0.9 + this.explodeAmount * 1.4;
      b.group.position.set(x, y, z);
      b.group.rotation.y = -a + Math.PI * 0.5;
      const flap = Math.sin(this.clock * 5.2 + b.phase * 2.0) * 0.45;
      b.leftWing.rotation.z = flap;
      b.rightWing.rotation.z = -flap;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('visibilitychange', this.handleVisibility);
    this.resizeObserver?.disconnect();

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
      const mat = (obj as THREE.Mesh).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });

    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
  }
}
