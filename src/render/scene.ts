import * as THREE from 'three'
import { GROUND_SIZE } from '../physics/world.ts'

export type CameraMode = 'driver' | 'chase'

export interface SceneView {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  /** 차체를 따라다니는 그룹 — 차체 로컬 좌표계 */
  carRoot: THREE.Group
  driverCamera: THREE.PerspectiveCamera
  chaseCamera: THREE.PerspectiveCamera
  activeCamera(mode: CameraMode): THREE.PerspectiveCamera
  updateChaseCamera(): void
  resize(): void
}

const SKY_COLOR = 0x1a2028
const GROUND_COLOR = 0x2c3239

export function createScene(driverSeat: { x: number; y: number; z: number }): SceneView {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY_COLOR)
  // 원거리 페이드 — 소실점을 강조해 거리 판단을 돕는다 (1단계에서 본격 조정)
  scene.fog = new THREE.Fog(SKY_COLOR, 60, 160)

  // ── 조명 ──────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x9fb4c7, GROUND_COLOR, 1.1))

  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(40, 60, 20)
  scene.add(sun)

  // ── 지면 ──────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ color: GROUND_COLOR }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  // 격자 — 거리·속도 판단의 1차 단서.
  // 0단계에서는 차가 실제로 움직이는지 확인하는 최소한의 기준선이다.
  // 본격적인 깊이 단서(그림자, 참조물, 격자 텍스처)는 1단계에서 다룬다.
  const fineGrid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE, 0x3d454e, 0x3d454e)
  fineGrid.position.y = 0.01
  scene.add(fineGrid)

  const coarseGrid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 5, 0x556270, 0x556270)
  coarseGrid.position.y = 0.02
  scene.add(coarseGrid)

  // ── 카메라 ────────────────────────────────────────────
  const carRoot = new THREE.Group()
  scene.add(carRoot)

  const driverCamera = new THREE.PerspectiveCamera(70, aspect(), 0.1, 400)
  driverCamera.position.set(driverSeat.x, driverSeat.y, driverSeat.z)
  // 차체 전방은 로컬 +Z 인데 Three.js 카메라는 기본적으로 -Z 를 본다
  driverCamera.rotateY(Math.PI)
  carRoot.add(driverCamera)

  const chaseCamera = new THREE.PerspectiveCamera(60, aspect(), 0.1, 400)

  const view: SceneView = {
    renderer,
    scene,
    carRoot,
    driverCamera,
    chaseCamera,
    activeCamera: (mode) => (mode === 'driver' ? driverCamera : chaseCamera),
    updateChaseCamera() {
      // 차체 뒤 위쪽에서 내려다본다. 차체 로컬 -Z 가 후방이다.
      const offset = new THREE.Vector3(0, 3.2, -8).applyQuaternion(carRoot.quaternion)
      chaseCamera.position.copy(carRoot.position).add(offset)
      chaseCamera.lookAt(carRoot.position.x, carRoot.position.y + 0.8, carRoot.position.z)
    },
    resize() {
      renderer.setSize(window.innerWidth, window.innerHeight)
      for (const camera of [driverCamera, chaseCamera]) {
        camera.aspect = aspect()
        camera.updateProjectionMatrix()
      }
    },
  }

  window.addEventListener('resize', view.resize)
  return view
}

const aspect = () => window.innerWidth / window.innerHeight
