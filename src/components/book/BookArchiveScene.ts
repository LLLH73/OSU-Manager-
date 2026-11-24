import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BookSummary } from '../../types';
import { BookTextureManager } from './BookTextureManager';
import {
  computeHoverWaveLift,
  damp,
  idleWave,
  returnStep,
  selectionWave,
  smooth,
  Spring,
} from './rhineMotion';

export const BOOK_WIDTH = 4.4;
export const BOOK_HEIGHT = 3.32;
export const BOOK_THICKNESS = 0.44;
export const COLUMN_SPACING = 5.15;
export const ROW_SPACING = 0.66;
export const EXTRACT_LIFT = 4.15;

const ROW_BACK = 20;
const ROW_FRONT = 16;

export type BookOpenPhase = 'idle' | 'extracting' | 'opening' | 'open' | 'closing' | 'returning';

export interface BookSceneCallbacks {
  onFocusChange?: (book: BookSummary | null, index: number) => void;
  onHoverChange?: (book: BookSummary | null, index: number) => void;
  onPhaseChange?: (phase: BookOpenPhase, book: BookSummary | null, index: number) => void;
  onCameraOffsetChange?: (moved: boolean) => void;
  onWebglUnavailable?: (reason: string) => void;
}

interface CellCoord {
  lane: number;
  row: number;
}

interface SlotMeshEntry {
  cellKey: string;
  physLane: number;
  physRow: number;
  bookIndex: number;
  bookKey: string;
  mesh: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  fadeUniform: { value: number };
  ySpring: Spring;
  spawnAlpha: number;
  exiting: boolean;
}

interface HeroBookRig {
  group: THREE.Group;
  backCover: THREE.Mesh;
  spineCap: THREE.Mesh;
  pageBlock: THREE.Mesh;
  frontCoverPivot: THREE.Group;
  frontCoverBlurred: THREE.Mesh;
  frontCoverSharp: THREE.Mesh;
  frontCoverInner: THREE.Mesh;
  turningPagePivot: THREE.Group;
  turningPageMesh: THREE.Mesh;
  sharpCanvas: HTMLCanvasElement;
  sharpTex: THREE.CanvasTexture;
  frontBlurredMat: THREE.MeshStandardMaterial;
  frontSharpMat: THREE.MeshStandardMaterial;
  frontInnerMat: THREE.MeshStandardMaterial;
  spineMat: THREE.MeshStandardMaterial;
  backMat: THREE.MeshStandardMaterial;
  pageMat: THREE.MeshStandardMaterial;
  turningPageMat: THREE.MeshStandardMaterial;
}

function makeCellKey(lane: number, row: number): string {
  return `${lane}:${row}`;
}

export class BookArchiveScene {
  private container: HTMLElement;
  private callbacks: BookSceneCallbacks;
  private isDark: boolean;
  private reducedMotion: boolean;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private textures!: BookTextureManager;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private floorMesh!: THREE.Mesh;

  private sharedBoxGeom!: THREE.BoxGeometry;
  private slotGroup = new THREE.Group();
  private slotPool = new Map<string, SlotMeshEntry>();
  private freeSlotPool: SlotMeshEntry[] = [];
  private ySpringsByCellKey = new Map<string, Spring>();
  private heroRig!: HeroBookRig;

  private books: BookSummary[] = [];
  private laneCount = 5;
  private rowCount = 1;
  private laneBooks: number[][] = [];
  private laneRowOffsets: number[] = [];
  private loopEnabled = false;

  private focusIndex = -1;
  private focusCell: CellCoord = { lane: 0, row: 0 };
  private hoverIndex = -1;
  private hoverCell: CellCoord | null = null;
  private hoverBookKey: string | null = null;

  private trackLane: Spring = { value: 2, velocity: 0 };
  private trackRow: Spring = { value: 2, velocity: 0 };
  private cameraAim = new THREE.Vector3(0, 0, 0);
  private cameraPos = new THREE.Vector3(-40, 25, 45);
  private cameraFov = 11;
  private pointerParallax = { x: 0, y: 0 };

  // Middle-mouse damped camera offset state
  private camUserYaw = 0;
  private camUserYawTarget = 0;
  private camUserElev = 0;
  private camUserElevTarget = 0;
  private camUserPanX = 0;
  private camUserPanXTarget = 0;
  private camUserPanY = 0;
  private camUserPanYTarget = 0;
  private middlePanning = false;
  private middleStart = { x: 0, y: 0, yaw: 0, elev: 0, panX: 0, panY: 0 };
  private lastMiddleClickTime = 0;
  private cameraOffsetMoved = false;

  // Hero opening & progressive unblur state
  private heroPhase: BookOpenPhase = 'idle';
  private heroIndex = -1;
  private heroCell: CellCoord | null = null;
  private heroLift = 0;
  private heroOpenAmount = 0;
  private heroClarity = 0;
  private heroRotY = 0;
  private pulses: Array<{ row: number; lane: number; time: number }> = [];

  // Staggered filter wave state
  private filterWavePhase: 'idle' | 'out' | 'in' = 'idle';
  private filterWaveT = 0;
  private filterWaveSeq = 0;

  // Raycast & drag state
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2(99, 99);
  private pointerInside = false;
  private pointerDirty = false;
  private dragging = false;
  private dragMoved = false;
  private dragStart = { x: 0, y: 0, lane: 0, row: 0 };
  private dragPrev = { x: 0, y: 0, time: 0 };
  private dragVel = { lane: 0, row: 0 };

  // Scratch vectors / arrays to eliminate per-frame heap churn
  private _tmpShelfAim = new THREE.Vector3();
  private _tmpHeroAim = new THREE.Vector3();
  private _tmpAim = new THREE.Vector3();
  private _tmpViewDir = new THREE.Vector3();
  private _tmpPos = new THREE.Vector3();
  private _pickMeshes: THREE.Mesh[] = [];
  private _activeBookKeys = new Set<string>();
  private _neededCellKeys = new Set<string>();

  private frameCounter = 0;
  private rafId: number | null = null;
  private startTime = performance.now();
  private lastFrameTime = performance.now();
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  constructor(
    container: HTMLElement,
    isDark: boolean,
    reducedMotion: boolean,
    callbacks: BookSceneCallbacks = {},
  ) {
    this.container = container;
    this.isDark = isDark;
    this.reducedMotion = reducedMotion;
    this.callbacks = callbacks;

    this.initRendererAndScene();
  }

  private initRendererAndScene(): void {
    try {
      const width = Math.max(320, this.container.clientWidth || 1280);
      const height = Math.max(240, this.container.clientHeight || 720);

      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(width, height, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this.isDark ? 0.96 : 1.04;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.container.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      const bgHex = this.isDark ? '#11181b' : '#eae5e1';
      this.scene.background = new THREE.Color(bgHex);
      this.scene.fog = new THREE.Fog(bgHex, 78, 108);

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.scene.environment = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
      this.scene.environmentIntensity = this.isDark ? 0.34 : 0.48;

      this.camera = new THREE.PerspectiveCamera(11, width / height, 2, 260);

      this.hemiLight = new THREE.HemisphereLight(
        '#fffaf5',
        this.isDark ? '#3a464c' : '#b4a18c',
        this.isDark ? 0.42 : 0.56,
      );
      this.keyLight = new THREE.DirectionalLight(
        this.isDark ? '#f4ede2' : '#fff7ed',
        this.isDark ? 1.15 : 1.55,
      );
      this.keyLight.position.set(-10, 22, 8);
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.near = 2;
      this.keyLight.shadow.camera.far = 85;
      const sc = 26;
      this.keyLight.shadow.camera.left = -sc;
      this.keyLight.shadow.camera.right = sc;
      this.keyLight.shadow.camera.top = sc;
      this.keyLight.shadow.camera.bottom = -sc;
      this.keyLight.shadow.bias = -0.0005;

      this.fillLight = new THREE.DirectionalLight('#ffffff', this.isDark ? 0.28 : 0.45);
      this.fillLight.position.set(10, 9, -12);
      this.scene.add(this.hemiLight, this.keyLight, this.keyLight.target, this.fillLight);

      const floorGeo = new THREE.PlaneGeometry(240, 240);
      const floorMat = new THREE.MeshStandardMaterial({
        color: this.isDark ? '#182024' : '#e4ded7',
        roughness: 0.94,
        metalness: 0.02,
      });
      this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
      this.floorMesh.rotation.x = -Math.PI / 2;
      this.floorMesh.position.y = -BOOK_HEIGHT * 0.5 - 0.16;
      this.floorMesh.receiveShadow = true;
      this.scene.add(this.floorMesh);

      this.textures = new BookTextureManager(this.isDark);
      this.sharedBoxGeom = new THREE.BoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, BOOK_THICKNESS);

      this.scene.add(this.slotGroup);
      this.heroRig = this.createHeroRig();
      this.heroRig.group.visible = false;
      this.scene.add(this.heroRig.group);

      this.bindEvents();
      this.updateCameraImmediate();
      this.startLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WebGL initialization failed';
      this.callbacks.onWebglUnavailable?.(msg);
    }
  }

  private createHeroRig(): HeroBookRig {
    const group = new THREE.Group();
    const coverThick = 0.048;
    const innerThick = BOOK_THICKNESS - coverThick * 2;
    const dark = this.isDark;

    const spineMat = new THREE.MeshStandardMaterial({
      color: dark ? '#313b40' : '#ece6de',
      roughness: 0.62,
      metalness: 0.04,
    });
    const backMat = new THREE.MeshStandardMaterial({
      map: this.textures.backShellTexture,
      roughness: 0.68,
      metalness: 0.03,
    });
    const pageMat = new THREE.MeshStandardMaterial({
      map: this.textures.pageEdgeTexture,
      roughness: 0.85,
      metalness: 0.01,
    });
    const frontBlurredMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.5,
      metalness: 0.04,
    });

    const sharpCanvas = document.createElement('canvas');
    sharpCanvas.width = 768;
    sharpCanvas.height = 576;
    const sharpTex = new THREE.CanvasTexture(sharpCanvas);
    sharpTex.colorSpace = THREE.SRGBColorSpace;
    sharpTex.anisotropy = 4;

    const frontSharpMat = new THREE.MeshStandardMaterial({
      map: sharpTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      roughness: 0.45,
      metalness: 0.04,
    });
    const frontInnerMat = new THREE.MeshStandardMaterial({
      map: this.textures.heroInnerPageTexture,
      roughness: 0.8,
      metalness: 0.02,
    });
    const turningPageMat = new THREE.MeshStandardMaterial({
      map: this.textures.heroInnerPageTexture,
      roughness: 0.88,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });

    const backCover = new THREE.Mesh(
      new THREE.BoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, coverThick),
      backMat,
    );
    backCover.position.set(0, 0, -BOOK_THICKNESS * 0.5 + coverThick * 0.5);
    backCover.castShadow = true;

    const spineCap = new THREE.Mesh(
      new THREE.BoxGeometry(coverThick * 1.4, BOOK_HEIGHT, BOOK_THICKNESS),
      spineMat,
    );
    spineCap.position.set(-BOOK_WIDTH * 0.5 + coverThick * 0.7, 0, 0);
    spineCap.castShadow = true;

    const pageW = BOOK_WIDTH - 0.08;
    const pageH = BOOK_HEIGHT - 0.1;
    const pageBlock = new THREE.Mesh(
      new THREE.BoxGeometry(pageW, pageH, innerThick),
      [
        pageMat,
        spineMat,
        pageMat,
        pageMat,
        frontInnerMat,
        backMat,
      ],
    );
    pageBlock.position.set(0.02, 0, 0);
    pageBlock.castShadow = true;

    const frontCoverPivot = new THREE.Group();
    frontCoverPivot.position.set(-BOOK_WIDTH * 0.5, 0, BOOK_THICKNESS * 0.5 - coverThick * 0.5);

    const frontCoverBlurred = new THREE.Mesh(
      new THREE.PlaneGeometry(BOOK_WIDTH, BOOK_HEIGHT),
      frontBlurredMat,
    );
    frontCoverBlurred.position.set(BOOK_WIDTH * 0.5, 0, coverThick * 0.5 + 0.002);

    const frontCoverSharp = new THREE.Mesh(
      new THREE.PlaneGeometry(BOOK_WIDTH, BOOK_HEIGHT),
      frontSharpMat,
    );
    frontCoverSharp.position.set(BOOK_WIDTH * 0.5, 0, coverThick * 0.5 + 0.005);

    const frontCoverInner = new THREE.Mesh(
      new THREE.PlaneGeometry(BOOK_WIDTH, BOOK_HEIGHT),
      frontInnerMat,
    );
    frontCoverInner.rotation.y = Math.PI;
    frontCoverInner.position.set(BOOK_WIDTH * 0.5, 0, -coverThick * 0.5 - 0.002);

    const frontCoverEdge = new THREE.Mesh(
      new THREE.BoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, coverThick),
      backMat,
    );
    frontCoverEdge.position.set(BOOK_WIDTH * 0.5, 0, 0);
    frontCoverEdge.castShadow = true;

    frontCoverPivot.add(frontCoverEdge, frontCoverBlurred, frontCoverSharp, frontCoverInner);

    const turningPagePivot = new THREE.Group();
    turningPagePivot.position.set(-BOOK_WIDTH * 0.5 + 0.04, 0, innerThick * 0.5 + 0.005);
    const turningPageMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pageW - 0.06, pageH - 0.04),
      turningPageMat,
    );
    turningPageMesh.position.set((pageW - 0.06) * 0.5, 0, 0);
    turningPagePivot.add(turningPageMesh);

    group.add(backCover, spineCap, pageBlock, turningPagePivot, frontCoverPivot);

    return {
      group,
      backCover,
      spineCap,
      pageBlock,
      frontCoverPivot,
      frontCoverBlurred,
      frontCoverSharp,
      frontCoverInner,
      turningPagePivot,
      turningPageMesh,
      sharpCanvas,
      sharpTex,
      frontBlurredMat,
      frontSharpMat,
      frontInnerMat,
      spineMat,
      backMat,
      pageMat,
      turningPageMat,
    };
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.pointerParallax.x = this.pointerNdc.x;
      this.pointerParallax.y = this.pointerNdc.y;
      this.pointerDirty = true;
    };

    const preventMiddleBrowserAutoscroll = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.disposed) return;
      this.pointerInside = true;
      updateNdc(e.clientX, e.clientY);

      if (this.middlePanning && this.heroPhase === 'idle') {
        const dx = e.clientX - this.middleStart.x;
        const dy = e.clientY - this.middleStart.y;
        this.camUserYawTarget = THREE.MathUtils.clamp(
          this.middleStart.yaw - dx * 0.0022,
          -0.55,
          0.48,
        );
        this.camUserPanXTarget = THREE.MathUtils.clamp(
          this.middleStart.panX - dx * 0.012,
          -10,
          10,
        );
        this.camUserElevTarget = THREE.MathUtils.clamp(
          this.middleStart.elev + dy * 0.002,
          -0.22,
          0.42,
        );
        this.camUserPanYTarget = THREE.MathUtils.clamp(
          this.middleStart.panY + dy * 0.008,
          -2.5,
          4.5,
        );
        this.notifyCameraOffsetState();
        return;
      }

      if (this.dragging && this.heroPhase === 'idle') {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 8) this.dragMoved = true;

        if (this.dragMoved) {
          const deltaLane = -dx * 0.011 + dy * 0.004;
          const deltaRow = -dy * 0.022 - dx * 0.013;
          const nextLane = Math.max(0, Math.min(this.laneCount - 1, this.dragStart.lane + deltaLane));
          const rawRow = this.dragStart.row + deltaRow;
          const nextRow = this.loopEnabled
            ? rawRow
            : Math.max(0, Math.min(this.rowCount - 1, rawRow));
          const now = performance.now();
          const dtMs = Math.max(8, now - this.dragPrev.time);
          this.dragVel.lane = ((nextLane - this.trackLane.value) / dtMs) * 1000;
          this.dragVel.row = ((nextRow - this.trackRow.value) / dtMs) * 1000;
          this.trackLane.value = nextLane;
          this.trackRow.value = nextRow;
          this.trackLane.velocity = 0;
          this.trackRow.velocity = 0;
          this.dragPrev = { x: e.clientX, y: e.clientY, time: now };
          this.syncFocusFromTracks();
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (this.disposed || this.heroPhase !== 'idle') return;
      updateNdc(e.clientX, e.clientY);

      if (e.button === 1) {
        e.preventDefault();
        const now = performance.now();
        if (now - this.lastMiddleClickTime < 320) {
          this.lastMiddleClickTime = 0;
          this.resetCameraView();
          return;
        }
        this.lastMiddleClickTime = now;
        this.middlePanning = true;
        this.middleStart = {
          x: e.clientX,
          y: e.clientY,
          yaw: this.camUserYawTarget,
          elev: this.camUserElevTarget,
          panX: this.camUserPanXTarget,
          panY: this.camUserPanYTarget,
        };
        dom.setPointerCapture?.(e.pointerId);
        return;
      }

      if (e.button !== 0) return;
      this.dragging = true;
      this.dragMoved = false;
      this.dragStart = {
        x: e.clientX,
        y: e.clientY,
        lane: this.trackLane.value,
        row: this.trackRow.value,
      };
      this.dragPrev = { x: e.clientX, y: e.clientY, time: performance.now() };
      this.dragVel = { lane: 0, row: 0 };
      dom.setPointerCapture?.(e.pointerId);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.disposed) return;

      if (e.button === 1 && this.middlePanning) {
        this.middlePanning = false;
        if (dom.hasPointerCapture?.(e.pointerId)) {
          dom.releasePointerCapture(e.pointerId);
        }
        return;
      }

      const wasDragging = this.dragging;
      const hadMoved = this.dragMoved;
      this.dragging = false;
      if (dom.hasPointerCapture?.(e.pointerId)) {
        dom.releasePointerCapture(e.pointerId);
      }

      if (wasDragging && hadMoved) {
        if (!this.reducedMotion) {
          this.trackLane.velocity = THREE.MathUtils.clamp(this.dragVel.lane * 0.45, -14, 14);
          this.trackRow.velocity = THREE.MathUtils.clamp(this.dragVel.row * 0.45, -24, 24);
        }
        this.focusClosestToTracks();
        return;
      }

      if (e.button === 0 && this.heroPhase === 'idle') {
        updateNdc(e.clientX, e.clientY);
        const hit = this.pickSlotAtPointer();
        if (hit) {
          this.openBookByIndex(hit.bookIndex, { lane: hit.lane, row: hit.row });
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      this.dragging = false;
      this.middlePanning = false;
      if (dom.hasPointerCapture?.(e.pointerId)) {
        dom.releasePointerCapture(e.pointerId);
      }
    };

    const onPointerLeave = () => {
      this.pointerInside = false;
      this.pointerDirty = false;
      if (this.hoverIndex !== -1 || this.hoverCell !== null) {
        this.hoverIndex = -1;
        this.hoverCell = null;
        this.hoverBookKey = null;
        this.callbacks.onHoverChange?.(null, -1);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (this.disposed || this.heroPhase !== 'idle' || this.books.length === 0) return;
      e.preventDefault();
      const step = Math.sign(e.deltaY) * Math.max(1, Math.min(3, Math.round(Math.abs(e.deltaY) / 90)));
      this.stepFocus(step, 0);
    };

    dom.addEventListener('mousedown', preventMiddleBrowserAutoscroll);
    dom.addEventListener('auxclick', preventMiddleBrowserAutoscroll);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointercancel', onPointerCancel);
    dom.addEventListener('pointerleave', onPointerLeave);
    dom.addEventListener('wheel', onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    this.unbindDomEvents = () => {
      dom.removeEventListener('mousedown', preventMiddleBrowserAutoscroll);
      dom.removeEventListener('auxclick', preventMiddleBrowserAutoscroll);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerCancel);
      dom.removeEventListener('pointerleave', onPointerLeave);
      dom.removeEventListener('wheel', onWheel);
    };
  }

  private unbindDomEvents: () => void = () => {};

  private notifyCameraOffsetState(): void {
    const moved =
      Math.abs(this.camUserYawTarget) > 0.004 ||
      Math.abs(this.camUserElevTarget) > 0.004 ||
      Math.abs(this.camUserPanXTarget) > 0.05 ||
      Math.abs(this.camUserPanYTarget) > 0.05;
    if (moved !== this.cameraOffsetMoved) {
      this.cameraOffsetMoved = moved;
      this.callbacks.onCameraOffsetChange?.(moved);
    }
  }

  resetCameraView(): void {
    this.camUserYawTarget = 0;
    this.camUserElevTarget = 0;
    this.camUserPanXTarget = 0;
    this.camUserPanYTarget = 0;
    if (this.reducedMotion) {
      this.camUserYaw = 0;
      this.camUserElev = 0;
      this.camUserPanX = 0;
      this.camUserPanY = 0;
    }
    this.notifyCameraOffsetState();
  }

  resize(): void {
    if (this.disposed || !this.renderer || !this.camera) return;
    const width = Math.max(320, this.container.clientWidth);
    const height = Math.max(240, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private applyEnvironmentPalette(isDark: boolean): void {
    const bgHex = isDark ? '#11181b' : '#eae5e1';
    if (this.scene) {
      this.scene.background = new THREE.Color(bgHex);
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.color.set(bgHex);
      }
      this.scene.environmentIntensity = isDark ? 0.34 : 0.48;
    }
    if (this.renderer) {
      this.renderer.toneMappingExposure = isDark ? 0.96 : 1.04;
    }
    if (this.hemiLight) {
      this.hemiLight.groundColor.set(isDark ? '#3a464c' : '#b4a18c');
      this.hemiLight.intensity = isDark ? 0.42 : 0.56;
    }
    if (this.keyLight) {
      this.keyLight.color.set(isDark ? '#f4ede2' : '#fff7ed');
      this.keyLight.intensity = isDark ? 1.15 : 1.55;
    }
    if (this.floorMesh?.material instanceof THREE.MeshStandardMaterial) {
      this.floorMesh.material.color.set(isDark ? '#182024' : '#e4ded7');
    }
    if (this.heroRig) {
      this.heroRig.spineMat.color.set(isDark ? '#313b40' : '#ece6de');
    }
  }

  setDarkMode(isDark: boolean): void {
    if (this.isDark === isDark || this.disposed) return;
    this.isDark = isDark;
    this.textures?.setDarkMode(isDark);
    this.applyEnvironmentPalette(isDark);
    for (const slot of this.slotPool.values()) {
      slot.materials[3].color.set(isDark ? '#283237' : '#dfd8ce');
    }
  }

  async setDarkModeAsync(
    isDark: boolean,
    onProgress?: (p: number) => void,
  ): Promise<void> {
    if (this.disposed) return;
    this.isDark = isDark;
    this.applyEnvironmentPalette(isDark);

    const activeSlots = Array.from(this.slotPool.values()).sort((a, b) => {
      const da = Math.hypot(a.physRow - this.focusCell.row, (a.physLane - this.focusCell.lane) * 2);
      const db = Math.hypot(b.physRow - this.focusCell.row, (b.physLane - this.focusCell.lane) * 2);
      return da - db;
    });

    for (const slot of activeSlots) {
      slot.materials[3].color.set(isDark ? '#283237' : '#dfd8ce');
    }
    for (const slot of this.freeSlotPool) {
      slot.materials[3].color.set(isDark ? '#283237' : '#dfd8ce');
    }

    const prioritizedKeys = activeSlots.map((s) => s.bookKey);
    await this.textures?.setDarkModeAsync(isDark, prioritizedKeys, onProgress);

    if (this.heroPhase !== 'idle' && this.heroIndex >= 0 && this.books[this.heroIndex]) {
      this.textures?.paintHeroSharpCover(
        this.heroRig.sharpCanvas,
        this.heroRig.sharpTex,
        this.books[this.heroIndex],
        this.heroIndex,
      );
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  async waitForInitialReady(timeoutMs = 700): Promise<void> {
    if (this.disposed || this.books.length === 0 || !this.textures) return;
    const centerRow = Math.round(this.trackRow.value);
    const centerKeys: string[] = [];
    for (let r = centerRow - 5; r <= centerRow + 5; r++) {
      for (let l = 0; l < this.laneCount; l++) {
        const idx = this.cellToBookIndex(l, r);
        if (idx >= 0 && this.books[idx]) centerKeys.push(this.books[idx].bookKey);
      }
    }
    if (centerKeys.length === 0) return;

    const start = performance.now();
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.disposed) {
          resolve();
          return;
        }
        this.textures.processPaintQueue(4, 10);
        const { total, ready } = this.textures.getVisualReadyCount(centerKeys);
        const elapsed = performance.now() - start;
        if (ready >= total || elapsed >= timeoutMs) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  setBooks(nextBooks: BookSummary[], preserveBookKey?: string | null): void {
    this.filterWaveSeq += 1;
    this.filterWavePhase = 'idle';
    this.filterWaveT = 0;
    this.applyBooks(nextBooks, preserveBookKey);
  }

  async transitionToBooks(
    nextBooks: BookSummary[],
    preserveBookKey?: string | null,
    immediate = false,
  ): Promise<void> {
    if (this.disposed) return;
    const seq = ++this.filterWaveSeq;

    if (immediate || this.reducedMotion || this.books.length === 0) {
      this.filterWavePhase = 'idle';
      this.applyBooks(nextBooks, preserveBookKey);
      return;
    }

    this.filterWavePhase = 'out';
    this.filterWaveT = 0;

    await new Promise<void>((r) => window.setTimeout(r, 165));
    if (this.disposed || seq !== this.filterWaveSeq) return;

    this.applyBooks(nextBooks, preserveBookKey);
    this.textures?.processPaintQueue(6, 12);

    this.filterWavePhase = 'in';
    this.filterWaveT = 0;

    await new Promise<void>((r) => window.setTimeout(r, 280));
    if (this.disposed || seq !== this.filterWaveSeq) return;
    this.filterWavePhase = 'idle';
  }

  private applyBooks(
    nextBooks: BookSummary[],
    preserveBookKey?: string | null,
  ): void {
    if (this.disposed) return;

    if (this.heroPhase !== 'idle') {
      this.forceResetHero();
    }

    this.books = nextBooks;
    this.laneCount =
      nextBooks.length >= 25
        ? 5
        : Math.max(1, Math.min(5, Math.ceil(nextBooks.length / 5)));

    this.laneBooks = Array.from({ length: this.laneCount }, () => []);
    for (let i = 0; i < nextBooks.length; i++) {
      this.laneBooks[i % this.laneCount].push(i);
    }
    this.laneRowOffsets = Array(this.laneCount).fill(0);
    this.rowCount = Math.max(1, ...this.laneBooks.map((c) => c.length));
    this.loopEnabled = this.rowCount >= 2 && nextBooks.length >= 2;

    // Recycle active slot meshes cleanly into the shared pool without disposing WebGL shaders
    for (const slot of this.slotPool.values()) {
      slot.mesh.visible = false;
      this.freeSlotPool.push(slot);
    }
    this.slotPool.clear();
    this.ySpringsByCellKey.clear();
    this.hoverIndex = -1;
    this.hoverCell = null;
    this.hoverBookKey = null;

    let targetIdx = 0;
    if (preserveBookKey) {
      const found = nextBooks.findIndex((b) => b.bookKey === preserveBookKey);
      if (found >= 0) targetIdx = found;
    }
    this.focusIndex = nextBooks.length > 0 ? Math.min(nextBooks.length - 1, targetIdx) : -1;

    if (this.focusIndex >= 0) {
      const coords = this.indexToCoords(this.focusIndex);
      this.focusCell = { lane: coords.lane, row: coords.row };
      this.trackLane.value = coords.lane;
      this.trackRow.value = coords.row;
    } else {
      this.focusCell = { lane: 0, row: 0 };
      this.trackLane.value = 0;
      this.trackRow.value = 0;
    }
    this.trackLane.velocity = 0;
    this.trackRow.velocity = 0;

    // Populate initial visible slots so first frame displays without pop-in
    const centerRow = Math.round(this.trackRow.value);
    this.syncVisiblePool(centerRow, true);
    this.updateCameraImmediate();

    this.callbacks.onFocusChange?.(
      this.focusIndex >= 0 ? this.books[this.focusIndex] : null,
      this.focusIndex,
    );
    this.callbacks.onHoverChange?.(null, -1);
  }

  private indexToCoords(index: number): CellCoord {
    const lc = Math.max(1, this.laneCount);
    return {
      lane: index % lc,
      row: Math.floor(index / lc),
    };
  }

  private cellToBookIndex(lane: number, physRow: number): number {
    if (lane < 0 || lane >= this.laneCount) return -1;
    const col = this.laneBooks[lane];
    if (!col || col.length === 0) return -1;
    if (!this.loopEnabled) {
      return physRow >= 0 && physRow < col.length ? col[physRow] : -1;
    }
    const len = col.length;
    const offset = this.laneRowOffsets[lane] || 0;
    const wrapped = (((physRow + offset) % len) + len) % len;
    return col[wrapped];
  }

  private findClosestPhysRowForIndex(targetIdx: number): CellCoord {
    const lane = targetIdx % Math.max(1, this.laneCount);
    const localRow = Math.floor(targetIdx / Math.max(1, this.laneCount));
    const col = this.laneBooks[lane];
    if (!col || col.length === 0 || !this.loopEnabled) {
      return { lane, row: localRow };
    }
    const len = col.length;
    const offset = this.laneRowOffsets[lane] || 0;
    const base = (((localRow - offset) % len) + len) % len;
    const k = Math.round((this.trackRow.value - base) / len);
    return { lane, row: base + k * len };
  }

  private syncFocusFromTracks(): void {
    if (this.books.length === 0) return;
    const lane = Math.max(0, Math.min(this.laneCount - 1, Math.round(this.trackLane.value)));
    let row = Math.round(this.trackRow.value);
    if (!this.loopEnabled) {
      row = Math.max(0, Math.min(this.rowCount - 1, row));
    }
    let idx = this.cellToBookIndex(lane, row);
    if (idx < 0) {
      row = Math.max(0, (this.laneBooks[lane]?.length || 1) - 1);
      idx = this.cellToBookIndex(lane, row);
    }
    if (idx >= 0 && (idx !== this.focusIndex || row !== this.focusCell.row || lane !== this.focusCell.lane)) {
      this.focusCell = { lane, row };
      this.focusIndex = idx;
      this.callbacks.onFocusChange?.(this.books[idx], idx);
    }
  }

  private focusClosestToTracks(): void {
    if (this.books.length === 0) return;
    const lane = Math.max(0, Math.min(this.laneCount - 1, Math.round(this.trackLane.value)));
    let row = Math.round(this.trackRow.value);
    if (!this.loopEnabled) {
      row = Math.max(0, Math.min(this.rowCount - 1, row));
    }
    let idx = this.cellToBookIndex(lane, row);
    if (idx < 0) {
      row = Math.max(0, (this.laneBooks[lane]?.length || 1) - 1);
      idx = this.cellToBookIndex(lane, row);
    }
    if (idx >= 0) {
      this.focusCell = { lane, row };
      this.focusIndex = idx;
      this.callbacks.onFocusChange?.(this.books[idx], idx);
    }
  }

  focusBookByIndex(index: number): void {
    if (index < 0 || index >= this.books.length || this.heroPhase !== 'idle') return;
    const cell = this.findClosestPhysRowForIndex(index);
    this.focusCell = cell;
    this.focusIndex = index;
    this.callbacks.onFocusChange?.(this.books[index], index);
  }

  stepFocus(dRow: number, dLane: number): void {
    if (this.books.length === 0 || this.heroPhase !== 'idle') return;
    const cur = this.focusCell;
    const nextLane = (cur.lane + dLane + this.laneCount) % this.laneCount;
    let nextRow = cur.row + dRow;

    if (!this.loopEnabled) {
      nextRow = Math.max(0, Math.min(this.rowCount - 1, nextRow));
      while (nextRow > 0 && this.cellToBookIndex(nextLane, nextRow) < 0) {
        nextRow -= 1;
      }
    }

    const idx = this.cellToBookIndex(nextLane, nextRow);
    if (idx < 0) return;
    this.focusCell = { lane: nextLane, row: nextRow };
    this.focusIndex = idx;
    this.callbacks.onFocusChange?.(this.books[idx], idx);
  }

  openBookByIndex(index: number, explicitCell?: CellCoord): void {
    if (index < 0 || index >= this.books.length || this.disposed) return;
    if (this.heroPhase !== 'idle' && this.heroPhase !== 'returning') return;

    let cell: CellCoord;
    if (explicitCell) {
      cell = explicitCell;
    } else if (this.hoverCell && this.hoverIndex === index) {
      cell = { ...this.hoverCell };
    } else if (this.focusIndex === index) {
      cell = { ...this.focusCell };
    } else {
      cell = this.findClosestPhysRowForIndex(index);
    }

    this.focusCell = { ...cell };
    this.focusIndex = index;
    this.heroCell = { ...cell };
    this.heroIndex = index;
    this.heroPhase = 'extracting';
    this.heroOpenAmount = 0;
    this.heroClarity = 0;
    this.heroRotY = 0;

    const currentSpring = this.ySpringsByCellKey.get(makeCellKey(cell.lane, cell.row));
    this.heroLift = currentSpring ? currentSpring.value : 0.4;

    const book = this.books[index];
    const tex = this.textures.getBookTextures(book, index, true);
    this.heroRig.frontBlurredMat.map = tex.frontCover;
    this.heroRig.frontBlurredMat.needsUpdate = true;
    this.heroRig.frontSharpMat.opacity = 0;
    this.textures.paintHeroSharpCover(this.heroRig.sharpCanvas, this.heroRig.sharpTex, book, index);

    this.heroRig.frontCoverPivot.rotation.y = 0;
    this.heroRig.turningPagePivot.rotation.y = 0;
    this.heroRig.group.visible = true;

    this.callbacks.onFocusChange?.(book, index);
    this.callbacks.onPhaseChange?.('extracting', book, index);

    if (this.reducedMotion) {
      this.heroLift = EXTRACT_LIFT;
      this.heroOpenAmount = 1;
      this.heroClarity = 1;
      this.heroRotY = 0.14;
      this.heroRig.frontSharpMat.opacity = 1;
      this.heroRig.frontCoverPivot.rotation.y = -2.72;
      this.heroRig.turningPagePivot.rotation.y = -2.18;
      this.heroPhase = 'open';
      this.callbacks.onPhaseChange?.('open', book, index);
    }
  }

  swapOpenBook(index: number): void {
    if (index < 0 || index >= this.books.length || this.disposed) return;
    if (this.heroPhase === 'idle') {
      this.openBookByIndex(index);
      return;
    }

    const cell = this.findClosestPhysRowForIndex(index);
    this.focusCell = { ...cell };
    this.focusIndex = index;
    this.heroCell = { ...cell };
    this.heroIndex = index;
    this.trackLane.value = cell.lane;
    this.trackRow.value = cell.row;

    const book = this.books[index];
    const tex = this.textures.getBookTextures(book, index, true);
    this.heroRig.frontBlurredMat.map = tex.frontCover;
    this.heroRig.frontBlurredMat.needsUpdate = true;
    this.textures.paintHeroSharpCover(this.heroRig.sharpCanvas, this.heroRig.sharpTex, book, index);

    this.heroPhase = 'open';
    this.heroLift = EXTRACT_LIFT;
    this.heroOpenAmount = 1;
    this.heroClarity = 1;
    this.heroRotY = 0.14;
    this.heroRig.frontSharpMat.opacity = 1;
    this.heroRig.frontCoverPivot.rotation.y = -2.72;
    this.heroRig.turningPagePivot.rotation.y = -2.18;

    this.callbacks.onFocusChange?.(book, index);
    this.callbacks.onPhaseChange?.('open', book, index);
  }

  closeBook(): void {
    if (this.heroPhase === 'idle' || this.heroPhase === 'closing' || this.heroPhase === 'returning') {
      return;
    }
    const book = this.heroIndex >= 0 ? this.books[this.heroIndex] : null;
    if (this.reducedMotion) {
      this.forceResetHero();
      return;
    }
    this.heroPhase = 'closing';
    this.callbacks.onPhaseChange?.('closing', book, this.heroIndex);
  }

  private forceResetHero(): void {
    const prevIdx = this.heroIndex;
    const prevBook = prevIdx >= 0 ? this.books[prevIdx] ?? null : null;
    this.heroPhase = 'idle';
    this.heroIndex = -1;
    this.heroCell = null;
    this.heroLift = 0;
    this.heroOpenAmount = 0;
    this.heroClarity = 0;
    this.heroRotY = 0;
    if (this.heroRig) {
      this.heroRig.group.visible = false;
      this.heroRig.frontSharpMat.opacity = 0;
      this.heroRig.frontCoverPivot.rotation.y = 0;
      this.heroRig.turningPagePivot.rotation.y = 0;
    }
    this.callbacks.onPhaseChange?.('idle', prevBook, prevIdx);
  }

  private worldPosForCoords(lane: number, row: number): { x: number; z: number } {
    const centerLane = (this.laneCount - 1) * 0.5;
    return {
      x: (lane - centerLane) * COLUMN_SPACING,
      z: row * ROW_SPACING,
    };
  }

  private pickSlotAtPointer(): { bookIndex: number; lane: number; row: number } | null {
    if (!this.pointerInside || !this.camera || this.slotPool.size === 0) return null;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    this._pickMeshes.length = 0;
    for (const s of this.slotPool.values()) {
      if (s.mesh.visible && !s.exiting) {
        this._pickMeshes.push(s.mesh);
      }
    }
    if (this._pickMeshes.length === 0) return null;
    const hits = this.raycaster.intersectObjects(this._pickMeshes, false);
    if (hits.length === 0) return null;
    const ud = (hits[0].object as THREE.Mesh).userData;
    if (typeof ud.bookIndex !== 'number' || typeof ud.physLane !== 'number' || typeof ud.physRow !== 'number') {
      return null;
    }
    return {
      bookIndex: ud.bookIndex,
      lane: ud.physLane,
      row: ud.physRow,
    };
  }

  private allocateSlotEntry(): SlotMeshEntry {
    const dark = this.isDark;
    const fadeUniform = { value: 0 };

    const materials = [
      new THREE.MeshStandardMaterial({
        map: this.textures.pageEdgeTexture,
        roughness: 0.86,
        metalness: 0.01,
      }),
      new THREE.MeshStandardMaterial({
        roughness: 0.42,
        metalness: 0.05,
      }),
      new THREE.MeshStandardMaterial({
        roughness: 0.36,
        metalness: 0.06,
      }),
      new THREE.MeshStandardMaterial({
        color: dark ? '#283237' : '#dfd8ce',
        roughness: 0.9,
        metalness: 0,
      }),
      new THREE.MeshStandardMaterial({
        roughness: 0.44,
        metalness: 0.04,
      }),
      new THREE.MeshStandardMaterial({
        map: this.textures.backShellTexture,
        roughness: 0.72,
        metalness: 0.02,
      }),
    ];

    for (const mat of materials) {
      mat.fog = true;
      mat.customProgramCacheKey = () => 'rhine-book-fade-v1';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSlotFade = fadeUniform;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uSlotFade;')
          .replace(
            '#include <fog_fragment>',
            `#include <fog_fragment>
#ifdef USE_FOG
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, clamp(uSlotFade, 0.0, 1.0) );
#endif`,
          );
      };
    }

    const mesh = new THREE.Mesh(this.sharedBoxGeom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.slotGroup.add(mesh);

    return {
      cellKey: '',
      physLane: 0,
      physRow: 0,
      bookIndex: -1,
      bookKey: '',
      mesh,
      materials,
      fadeUniform,
      ySpring: { value: 0, velocity: 0 },
      spawnAlpha: 0,
      exiting: false,
    };
  }

  private acquireSlotEntry(
    lane: number,
    physRow: number,
    bookIndex: number,
    immediateVisible: boolean,
  ): SlotMeshEntry {
    const slot = this.freeSlotPool.pop() ?? this.allocateSlotEntry();
    const cKey = makeCellKey(lane, physRow);
    const book = this.books[bookIndex];
    const tex = this.textures.getBookTextures(book, bookIndex, true);

    slot.cellKey = cKey;
    slot.physLane = lane;
    slot.physRow = physRow;
    slot.bookIndex = bookIndex;
    slot.bookKey = book.bookKey;

    slot.materials[0].map = this.textures.pageEdgeTexture;
    slot.materials[1].map = tex.sideSpine;
    slot.materials[2].map = tex.topSpine;
    slot.materials[3].color.set(this.isDark ? '#283237' : '#dfd8ce');
    slot.materials[4].map = tex.frontCover;
    slot.materials[5].map = this.textures.backShellTexture;

    slot.mesh.userData.bookIndex = bookIndex;
    slot.mesh.userData.physLane = lane;
    slot.mesh.userData.physRow = physRow;
    slot.mesh.visible = true;

    slot.exiting = false;
    slot.spawnAlpha = immediateVisible || this.reducedMotion ? 1 : 0;
    slot.fadeUniform.value = immediateVisible || this.reducedMotion ? 0 : 1;

    let ySpring = this.ySpringsByCellKey.get(cKey);
    if (!ySpring) {
      ySpring = { value: 0, velocity: 0 };
      this.ySpringsByCellKey.set(cKey, ySpring);
    }
    slot.ySpring = ySpring;

    return slot;
  }

  private releaseSlotEntry(slot: SlotMeshEntry): void {
    slot.mesh.visible = false;
    slot.exiting = false;
    this.slotPool.delete(slot.cellKey);
    this.freeSlotPool.push(slot);
  }

  private syncVisiblePool(centerRow: number, immediateVisible = false): void {
    const rawMin = centerRow - ROW_BACK;
    const rawMax = centerRow + ROW_FRONT;
    const minRow = this.loopEnabled ? rawMin : Math.max(0, rawMin);
    const maxRow = this.loopEnabled ? rawMax : Math.min(this.rowCount - 1, rawMax);

    this._neededCellKeys.clear();
    this._activeBookKeys.clear();

    for (let r = minRow; r <= maxRow; r++) {
      for (let l = 0; l < this.laneCount; l++) {
        const idx = this.cellToBookIndex(l, r);
        if (idx < 0) continue;
        const cKey = makeCellKey(l, r);
        this._neededCellKeys.add(cKey);
        this._activeBookKeys.add(this.books[idx].bookKey);

        const existing = this.slotPool.get(cKey);
        if (!existing) {
          this.slotPool.set(cKey, this.acquireSlotEntry(l, r, idx, immediateVisible));
        } else {
          existing.exiting = false;
          if (existing.bookIndex !== idx) {
            const book = this.books[idx];
            const tex = this.textures.getBookTextures(book, idx, true);
            existing.bookIndex = idx;
            existing.bookKey = book.bookKey;
            existing.materials[1].map = tex.sideSpine;
            existing.materials[2].map = tex.topSpine;
            existing.materials[4].map = tex.frontCover;
            existing.mesh.userData.bookIndex = idx;
          }
          // Rebind latest texture maps (no-op reference copy in Three.js)
          const tex = this.textures.getBookTextures(this.books[idx], idx, false);
          if (existing.materials[1].map !== tex.sideSpine) existing.materials[1].map = tex.sideSpine;
          if (existing.materials[2].map !== tex.topSpine) existing.materials[2].map = tex.topSpine;
          if (existing.materials[4].map !== tex.frontCover) existing.materials[4].map = tex.frontCover;
        }
      }
    }

    for (const slot of this.slotPool.values()) {
      if (!this._neededCellKeys.has(slot.cellKey)) {
        if (this.reducedMotion || slot.spawnAlpha <= 0.02) {
          this.releaseSlotEntry(slot);
        } else {
          slot.exiting = true;
        }
      }
    }

    this.textures.setActiveKeys(this._activeBookKeys);
  }

  private rebaseCoordinatesIfNeeded(): void {
    if (!this.loopEnabled || this.heroPhase !== 'idle' || this.dragging || this.middlePanning) return;
    if (Math.abs(this.trackRow.value) <= 4000) return;

    const shift = Math.round(this.trackRow.value);
    for (let l = 0; l < this.laneCount; l++) {
      const len = Math.max(1, this.laneBooks[l]?.length || 1);
      this.laneRowOffsets[l] = (((this.laneRowOffsets[l] + shift) % len) + len) % len;
    }

    this.trackRow.value -= shift;
    this.focusCell.row -= shift;
    if (this.hoverCell) this.hoverCell.row -= shift;
    for (const p of this.pulses) p.row -= shift;

    const dz = -shift * ROW_SPACING;
    this.cameraAim.z += dz;
    this.cameraPos.z += dz;

    const nextPool = new Map<string, SlotMeshEntry>();
    for (const slot of this.slotPool.values()) {
      slot.physRow -= shift;
      slot.cellKey = makeCellKey(slot.physLane, slot.physRow);
      slot.mesh.userData.physRow = slot.physRow;
      slot.mesh.position.z += dz;
      nextPool.set(slot.cellKey, slot);
    }
    this.slotPool = nextPool;

    const nextSprings = new Map<string, Spring>();
    for (const [k, sp] of this.ySpringsByCellKey) {
      const colon = k.indexOf(':');
      if (colon < 0) continue;
      const lane = Number(k.slice(0, colon));
      const row = Number(k.slice(colon + 1)) - shift;
      nextSprings.set(makeCellKey(lane, row), sp);
    }
    this.ySpringsByCellKey = nextSprings;
  }

  private getTargetCameraPose(): {
    aim: THREE.Vector3;
    pos: THREE.Vector3;
    fov: number;
    distance: number;
  } {
    const focusCoords =
      this.heroCell && this.heroPhase !== 'idle'
        ? this.heroCell
        : { lane: this.trackLane.value, row: this.trackRow.value };
    const focusWorld = this.worldPosForCoords(focusCoords.lane, focusCoords.row);

    const detailBlend =
      this.heroPhase === 'idle'
        ? 0
        : this.heroPhase === 'extracting'
          ? smooth(Math.min(1, this.heroLift / EXTRACT_LIFT)) * 0.55
          : this.heroPhase === 'opening'
            ? 0.55 + smooth(this.heroOpenAmount) * 0.45
            : this.heroPhase === 'open'
              ? 1
              : this.heroPhase === 'closing'
                ? 0.55 + smooth(this.heroOpenAmount) * 0.45
                : smooth(Math.min(1, this.heroLift / EXTRACT_LIFT)) * 0.55;

    const userWeight = 1 - detailBlend;
    const yaw =
      THREE.MathUtils.lerp(THREE.MathUtils.degToRad(56), THREE.MathUtils.degToRad(6), detailBlend) +
      this.camUserYaw * userWeight;
    const elev =
      THREE.MathUtils.lerp(THREE.MathUtils.degToRad(21), THREE.MathUtils.degToRad(7), detailBlend) +
      this.camUserElev * userWeight;
    const distance = THREE.MathUtils.lerp(76, 46, detailBlend);
    const span = THREE.MathUtils.lerp(11.8, 7.6, detailBlend);

    const balancedX = THREE.MathUtils.lerp(focusWorld.x, 0, 0.52) + 0.8 + this.camUserPanX * userWeight;
    const balancedZ = focusWorld.z + 2.2;
    this._tmpShelfAim.set(balancedX, 0.35 + this.camUserPanY * userWeight, balancedZ);
    this._tmpHeroAim.set(
      focusWorld.x - 1.5,
      Math.max(0.5, this.heroLift),
      focusWorld.z,
    );
    this._tmpAim.copy(this._tmpShelfAim).lerp(this._tmpHeroAim, detailBlend);

    const cosElev = Math.cos(elev);
    this._tmpViewDir
      .set(-Math.sin(yaw) * cosElev, Math.sin(elev), Math.cos(yaw) * cosElev)
      .normalize();

    this._tmpPos.copy(this._tmpAim).addScaledVector(this._tmpViewDir, distance);
    if (!this.reducedMotion && this.heroPhase === 'idle' && !this.middlePanning) {
      this._tmpPos.x += this.pointerParallax.x * 0.22;
      this._tmpPos.y -= this.pointerParallax.y * 0.16;
    }

    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(span / (2 * distance)));
    return { aim: this._tmpAim, pos: this._tmpPos, fov, distance };
  }

  private updateCameraImmediate(): void {
    if (!this.camera) return;
    const pose = this.getTargetCameraPose();
    this.cameraAim.copy(pose.aim);
    this.cameraPos.copy(pose.pos);
    this.cameraFov = pose.fov;
    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(this.cameraAim);
    this.camera.fov = this.cameraFov;
    this.camera.updateProjectionMatrix();
  }

  private startLoop(): void {
    const step = (now: number) => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(step);
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      const elapsed = (now - this.startTime) / 1000;
      this.lastFrameTime = now;

      this.update(dt, elapsed);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(step);
  }

  private update(dt: number, elapsed: number): void {
    this.frameCounter += 1;

    // 0. Drain frame-budgeted async canvas blur & texture paint queue
    this.textures.processPaintQueue(2, 3.5);

    // 1. Update shelf track springs (driven by focusCell when not dragging)
    if (!this.dragging && this.heroPhase === 'idle' && this.focusIndex >= 0) {
      const trackRate = this.reducedMotion ? 35 : 5.2;
      damp(this.trackLane, this.focusCell.lane, trackRate, dt);
      damp(this.trackRow, this.focusCell.row, trackRate, dt);
    }

    // Rebase continuous coordinates cleanly when scrolling very far in circular mode
    this.rebaseCoordinatesIfNeeded();

    // Update damped manual camera offsets
    const camOffsetRate = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 9.5);
    this.camUserYaw = THREE.MathUtils.lerp(this.camUserYaw, this.camUserYawTarget, camOffsetRate);
    this.camUserElev = THREE.MathUtils.lerp(this.camUserElev, this.camUserElevTarget, camOffsetRate);
    this.camUserPanX = THREE.MathUtils.lerp(this.camUserPanX, this.camUserPanXTarget, camOffsetRate);
    this.camUserPanY = THREE.MathUtils.lerp(this.camUserPanY, this.camUserPanYTarget, camOffsetRate);

    // Advance filter wave timer
    if (this.filterWavePhase === 'out') {
      this.filterWaveT = Math.min(1, this.filterWaveT + dt / 0.165);
    } else if (this.filterWavePhase === 'in') {
      this.filterWaveT = Math.min(1, this.filterWaveT + dt / 0.28);
    }

    // 2. Sync pooled visible window around current track row
    const rawCenter = Math.round(this.trackRow.value);
    const centerRow = this.loopEnabled
      ? rawCenter
      : Math.max(0, Math.min(this.rowCount - 1, rawCenter));
    this.syncVisiblePool(centerRow);

    // 3. Hover raycast when idle & not dragging (skip redundant picks when pointer static)
    const shelfMoving =
      Math.abs(this.trackRow.velocity) > 0.08 || Math.abs(this.trackLane.velocity) > 0.08;
    if (
      this.heroPhase === 'idle' &&
      !this.dragging &&
      !this.middlePanning &&
      this.pointerInside &&
      (this.pointerDirty || (shelfMoving && this.frameCounter % 2 === 0))
    ) {
      this.pointerDirty = false;
      const hit = this.pickSlotAtPointer();
      const hitKey = hit ? makeCellKey(hit.lane, hit.row) : '';
      const prevKey = this.hoverCell ? makeCellKey(this.hoverCell.lane, this.hoverCell.row) : '';

      if (hitKey !== prevKey) {
        if (hit) {
          this.hoverCell = { lane: hit.lane, row: hit.row };
          this.hoverIndex = hit.bookIndex;
          const b = this.books[hit.bookIndex];
          this.hoverBookKey = b?.bookKey ?? null;
          this.callbacks.onHoverChange?.(b ?? null, hit.bookIndex);
          this.renderer.domElement.style.cursor = 'pointer';
        } else {
          this.hoverCell = null;
          this.hoverIndex = -1;
          this.hoverBookKey = null;
          this.callbacks.onHoverChange?.(null, -1);
          this.renderer.domElement.style.cursor = 'grab';
        }
      }
    } else if (this.middlePanning) {
      this.renderer.domElement.style.cursor = 'move';
    } else if (this.dragging) {
      this.renderer.domElement.style.cursor = 'grabbing';
    } else if (this.heroPhase !== 'idle') {
      this.renderer.domElement.style.cursor = 'default';
    } else if (this.hoverIndex < 0) {
      this.renderer.domElement.style.cursor = 'grab';
    }

    // Prune expired return ripples
    if (this.pulses.length > 0) {
      this.pulses = this.pulses.filter((p) => elapsed - p.time < 3.2);
    }

    // 4. Update all visible pooled shelf books with hover wave, edge fog fade, & filter wave
    const springRate = this.reducedMotion ? 35 : 10.5;
    const activeHover = this.heroPhase === 'idle' && this.hoverCell !== null;
    const hoverCell = this.hoverCell;
    const focusCell = this.focusIndex >= 0 ? this.focusCell : null;

    const rawMin = centerRow - ROW_BACK;
    const rawMax = centerRow + ROW_FRONT;
    const minRow = this.loopEnabled ? rawMin : Math.max(0, rawMin);
    const maxRow = this.loopEnabled ? rawMax : Math.min(this.rowCount - 1, rawMax);

    const toRelease: SlotMeshEntry[] = [];

    for (const slot of this.slotPool.values()) {
      const lane = slot.physLane;
      const row = slot.physRow;
      const wp = this.worldPosForCoords(lane, row);
      const isHeroActive =
        this.heroPhase !== 'idle' &&
        this.heroCell !== null &&
        lane === this.heroCell.lane &&
        row === this.heroCell.row;

      // Spawn/exit smooth opacity fade in fog
      if (slot.exiting) {
        slot.spawnAlpha *= Math.exp(-dt * 8.5);
        if (slot.spawnAlpha <= 0.02) {
          toRelease.push(slot);
          continue;
        }
      } else if (slot.spawnAlpha < 1) {
        slot.spawnAlpha = Math.min(1, slot.spawnAlpha + (1 - slot.spawnAlpha) * (1 - Math.exp(-dt * 7.2)) + dt * 0.25);
      }

      // Outer visible window boundary fade into fog so scrolling has zero hard pop
      let edgeFade = 0;
      if (this.loopEnabled || minRow > 0) {
        const dMin = row - minRow;
        if (dMin < 4) edgeFade = Math.max(edgeFade, 1 - smooth(dMin / 4));
      }
      if (this.loopEnabled || maxRow < this.rowCount - 1) {
        const dMax = maxRow - row;
        if (dMax < 3) edgeFade = Math.max(edgeFade, 1 - smooth(dMax / 3));
      }

      // Compute primary target Y lift (strictly vertical hover & neighbor shoulder extraction)
      let targetY = 0;
      if (activeHover && hoverCell) {
        targetY += computeHoverWaveLift(row, lane, hoverCell.row, hoverCell.lane);
      } else if (this.heroPhase === 'idle' && focusCell) {
        const dl = Math.abs(lane - focusCell.lane);
        const dr = Math.abs(row - focusCell.row);
        if (dl === 0 && dr === 0) targetY += 0.42;
        else if (dl === 0 && dr <= 4) targetY += 0.2 * Math.exp(-0.5 * (dr / 1.8) ** 2);
      }

      if (!this.reducedMotion && this.heroPhase === 'idle') {
        targetY += idleWave(row, lane, elapsed);
        for (let i = 0; i < this.pulses.length; i++) {
          const p = this.pulses[i];
          const dist = Math.hypot(row - p.row, (lane - p.lane) * 2.2);
          targetY += selectionWave(dist, elapsed - p.time);
        }
      }

      // Filter wave offset & fog fade
      let filterDropY = 0;
      let filterFade = 0;
      if (this.filterWavePhase !== 'idle') {
        const delay = Math.min(0.48, lane * 0.06 + Math.min(8, Math.abs(row - centerRow)) * 0.026);
        const localT = THREE.MathUtils.clamp((this.filterWaveT - delay) / (1 - delay), 0, 1);
        const eased = smooth(localT);
        if (this.filterWavePhase === 'out') {
          filterDropY = -1.6 * eased;
          filterFade = eased;
        } else {
          filterDropY = -1.8 * (1 - eased);
          filterFade = 1 - eased;
        }
      }

      damp(slot.ySpring, targetY, springRate, dt);

      const visAlpha = slot.spawnAlpha * (1 - edgeFade) * (1 - filterFade);
      slot.fadeUniform.value = THREE.MathUtils.clamp(1 - visAlpha, 0, 1);
      slot.mesh.castShadow = slot.fadeUniform.value < 0.65;
      slot.mesh.visible = !isHeroActive;
      slot.mesh.position.set(wp.x, slot.ySpring.value + filterDropY, wp.z);
      slot.mesh.rotation.x = 0;
    }

    for (let i = 0; i < toRelease.length; i++) {
      this.releaseSlotEntry(toRelease[i]);
    }

    // 5. Hero Book extraction -> progressive unblur -> hinge open -> close -> return
    if (this.heroPhase !== 'idle' && this.heroIndex >= 0 && this.heroCell) {
      const hWorld = this.worldPosForCoords(this.heroCell.lane, this.heroCell.row);
      const book = this.books[this.heroIndex];

      if (this.heroPhase === 'extracting') {
        this.heroLift = THREE.MathUtils.lerp(this.heroLift, EXTRACT_LIFT, 1 - Math.exp(-dt * 6.8));
        this.heroClarity = Math.min(0.78, this.heroClarity + dt * 2.1);
        if (this.heroLift >= EXTRACT_LIFT * 0.8 && this.heroClarity >= 0.58) {
          this.heroPhase = 'opening';
          this.callbacks.onPhaseChange?.('opening', book, this.heroIndex);
        }
      } else if (this.heroPhase === 'opening') {
        this.heroLift = THREE.MathUtils.lerp(this.heroLift, EXTRACT_LIFT, 1 - Math.exp(-dt * 8.5));
        this.heroOpenAmount = Math.min(1, this.heroOpenAmount + dt * 2.5);
        this.heroClarity = Math.min(1, this.heroClarity + dt * 2.6);
        this.heroRotY = THREE.MathUtils.lerp(this.heroRotY, 0.14, 1 - Math.exp(-dt * 7));
        const easedOpen = smooth(this.heroOpenAmount);
        this.heroRig.frontCoverPivot.rotation.y = -2.72 * easedOpen;
        this.heroRig.turningPagePivot.rotation.y = -2.18 * smooth(Math.max(0, this.heroOpenAmount - 0.1) / 0.9);
        if (this.heroOpenAmount >= 0.995) {
          this.heroOpenAmount = 1;
          this.heroClarity = 1;
          this.heroPhase = 'open';
          this.callbacks.onPhaseChange?.('open', book, this.heroIndex);
        }
      } else if (this.heroPhase === 'closing') {
        this.heroLift = THREE.MathUtils.lerp(this.heroLift, EXTRACT_LIFT, 1 - Math.exp(-dt * 9));
        this.heroOpenAmount = Math.max(0, this.heroOpenAmount - dt * 3.1);
        this.heroClarity = Math.max(0, this.heroClarity - dt * 3.2);
        this.heroRotY = returnStep(this.heroRotY, dt, this.reducedMotion);
        const easedOpen = smooth(this.heroOpenAmount);
        this.heroRig.frontCoverPivot.rotation.y = -2.72 * easedOpen;
        this.heroRig.turningPagePivot.rotation.y = -2.18 * smooth(Math.max(0, this.heroOpenAmount - 0.1) / 0.9);
        if (this.heroOpenAmount <= 0.005 && this.heroRotY === 0) {
          this.heroOpenAmount = 0;
          this.heroClarity = 0;
          this.heroRig.frontCoverPivot.rotation.y = 0;
          this.heroRig.turningPagePivot.rotation.y = 0;
          this.heroPhase = 'returning';
          this.callbacks.onPhaseChange?.('returning', book, this.heroIndex);
        }
      } else if (this.heroPhase === 'returning') {
        const restSpring = this.ySpringsByCellKey.get(makeCellKey(this.heroCell.lane, this.heroCell.row));
        const restY = restSpring ? restSpring.value : 0;
        this.heroClarity = Math.max(0, this.heroClarity - dt * 4);
        this.heroLift = THREE.MathUtils.lerp(this.heroLift, restY, 1 - Math.exp(-dt * 7.5));
        if (Math.abs(this.heroLift - restY) < 0.03) {
          this.heroRig.group.visible = false;
          this.pulses.push({ lane: this.heroCell.lane, row: this.heroCell.row, time: elapsed });
          this.heroPhase = 'idle';
          const returnedIdx = this.heroIndex;
          this.heroIndex = -1;
          this.heroCell = null;
          this.callbacks.onPhaseChange?.('idle', this.books[returnedIdx] ?? null, returnedIdx);
        }
      }

      if (this.heroPhase !== 'idle') {
        const c = smooth(this.heroClarity);
        this.heroRig.frontSharpMat.opacity = c;
        this.heroRig.frontSharpMat.roughness = THREE.MathUtils.lerp(0.5, 0.22, c);
        this.heroRig.frontBlurredMat.roughness = THREE.MathUtils.lerp(0.5, 0.28, c);
        this.heroRig.group.position.set(hWorld.x, this.heroLift, hWorld.z);
        this.heroRig.group.rotation.set(0, this.heroRotY, 0);
      }
    }

    // 6. Camera damping & distance-anchored fog
    const pose = this.getTargetCameraPose();
    const camBlend = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 5.8);
    this.cameraAim.lerp(pose.aim, camBlend);
    this.cameraPos.lerp(pose.pos, camBlend);
    this.cameraFov = THREE.MathUtils.lerp(this.cameraFov, pose.fov, camBlend);

    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(this.cameraAim);
    this.camera.fov = this.cameraFov;
    this.camera.updateProjectionMatrix();

    this.keyLight.position.set(this.cameraAim.x - 10, 22, this.cameraAim.z + 8);
    this.keyLight.target.position.copy(this.cameraAim);
    this.keyLight.target.updateMatrixWorld();

    if (this.scene.fog instanceof THREE.Fog) {
      const renderedDist = this.camera.position.distanceTo(this.cameraAim);
      const isDetail = this.heroPhase !== 'idle' ? 1 : 0;
      this.scene.fog.near = renderedDist + THREE.MathUtils.lerp(this.isDark ? 1.5 : 3.5, 8, isDetail);
      this.scene.fog.far = renderedDist + THREE.MathUtils.lerp(this.isDark ? 18 : 23, 28, isDetail);
    }
  }

  getHoverBookKey(): string | null {
    return this.hoverBookKey;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.filterWaveSeq += 1;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.unbindDomEvents();

    for (const slot of this.slotPool.values()) {
      for (const m of slot.materials) m.dispose();
    }
    this.slotPool.clear();

    for (const slot of this.freeSlotPool) {
      for (const m of slot.materials) m.dispose();
    }
    this.freeSlotPool = [];

    if (this.heroRig) {
      this.heroRig.sharpTex.dispose();
      this.heroRig.frontBlurredMat.dispose();
      this.heroRig.frontSharpMat.dispose();
      this.heroRig.frontInnerMat.dispose();
      this.heroRig.spineMat.dispose();
      this.heroRig.backMat.dispose();
      this.heroRig.pageMat.dispose();
      this.heroRig.turningPageMat.dispose();
      this.heroRig.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
    }

    this.sharedBoxGeom?.dispose();
    this.floorMesh?.geometry.dispose();
    if (this.floorMesh?.material instanceof THREE.Material) this.floorMesh.material.dispose();
    this.textures?.dispose();
    if (this.scene?.environment) this.scene.environment.dispose();
    this.renderer?.dispose();
    if (this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
