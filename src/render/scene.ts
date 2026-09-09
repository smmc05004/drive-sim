import * as THREE from 'three'
import { GROUND_SIZE, LOT_SIZE } from '../physics/world.ts'

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
  /** 그림자 카메라를 차량 주변으로 옮긴다 */
  updateShadowFocus(): void
  resize(): void
}

const SKY_COLOR = 0x1b2229
const GROUND_COLOR = 0x333a42

/** 그림자 카메라가 덮는 범위 (m). 넓힐수록 그림자가 거칠어진다 */
const SHADOW_RANGE = 30

export function createScene(driverSeat: { x: number; y: number; z: number }): SceneView {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  // NOTE: three 0.186 에서 PCFSoftShadowMap 이 제거됐다
  renderer.shadowMap.type = THREE.PCFShadowMap
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY_COLOR)
  // 원거리 페이드 — 소실점을 강조해 거리 판단을 돕는다
  scene.fog = new THREE.Fog(SKY_COLOR, 70, 190)

  // ── 조명 ──────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x9fb4c7, GROUND_COLOR, 0.9))

  // 그림자가 이 게임에서 하는 일: 물체가 지면 어디에 붙어 있는지 알려준다.
  // 그림자가 없으면 라바콘이 얼마나 앞에 있는지 판단이 크게 어려워진다.
  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -SHADOW_RANGE
  sun.shadow.camera.right = SHADOW_RANGE
  sun.shadow.camera.top = SHADOW_RANGE
  sun.shadow.camera.bottom = -SHADOW_RANGE
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 160
  sun.shadow.bias = -0.0006
  scene.add(sun)
  scene.add(sun.target)

  /** 태양의 방향 (차량 기준 상대 위치) */
  const sunOffset = new THREE.Vector3(35, 55, -25)

  // ── 지면 ──────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ color: GROUND_COLOR }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // 격자 — 거리·속도 판단의 1차 단서. 이 게임에서 가장 중요한 깊이 단서다.
  // 1m 간격으로 세밀도를, 5m 간격으로 거리 감각을 준다.
  const fineGrid = new THREE.GridHelper(LOT_SIZE, LOT_SIZE, 0x404850, 0x404850)
  fineGrid.position.y = 0.01
  scene.add(fineGrid)

  const coarseGrid = new THREE.GridHelper(LOT_SIZE, LOT_SIZE / 5, 0x5b6773, 0x5b6773)
  coarseGrid.position.y = 0.02
  scene.add(coarseGrid)

  // ── 카메라 ────────────────────────────────────────────
  const carRoot = new THREE.Group()
  scene.add(carRoot)

  const driverCamera = new THREE.PerspectiveCamera(72, aspect(), 0.05, 400)
  driverCamera.position.set(driverSeat.x, driverSeat.y, driverSeat.z)
  // 차체 전방은 로컬 +Z 인데 Three.js 카메라는 기본적으로 -Z 를 본다.
  //
  // NOTE: rotateY(π) 를 쓰면 안 된다. 그 결과 오일러 각이 (0, π, 0) 이 아니라
  //       (π, 0, π) 로 저장된다 (같은 회전의 다른 XYZ 분해). 이후에 다른 곳에서
  //       rotation.y 에 값을 대입하면 (π, y, π) 가 되어 카메라가 엉뚱한 방향을
  //       본다 — 실제로 운전석이 뒤를 보게 됐고, 실내가 통째로 안 보였다.
  //       고개 돌리기가 rotation.y 를 쓰므로 여기서도 오일러로 명시한다.
  driverCamera.rotation.set(0, Math.PI, 0)
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
      const offset = new THREE.Vector3(0, 3.2, -8.5).applyQuaternion(carRoot.quaternion)
      chaseCamera.position.copy(carRoot.position).add(offset)
      chaseCamera.lookAt(carRoot.position.x, carRoot.position.y + 0.6, carRoot.position.z)
    },
    updateShadowFocus() {
      // 그림자 카메라가 200m 공터 전체를 덮으면 해상도가 무의미해진다.
      // 차량 주변만 따라다니게 한다.
      sun.target.position.copy(carRoot.position)
      sun.position.copy(carRoot.position).add(sunOffset)
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
