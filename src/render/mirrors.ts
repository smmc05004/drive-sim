import * as THREE from 'three'
import { vehicleParams } from '../config/vehicle-params.ts'

/**
 * 룸미러 + 좌우 사이드미러.
 *
 * 이 단계의 기술적 핵심이자, 가장 틀리기 쉬운 부분이다.
 *
 * ── 왜 그냥 뒤를 비추면 안 되는가 ──────────────────────
 * 뒤를 보는 카메라를 그대로 화면에 그리면 "뒤로 돌아앉은 사람의 시야"가
 * 된다. 실제 거울은 그것의 **좌우 반전**이다. 반전하지 않으면 오른쪽 뒤에
 * 있는 차가 미러 왼쪽에 보이고, 여기서 익힌 감각이 실차에서 정반대가 된다.
 * 이 게임의 존재 이유가 무너지는 종류의 오류라 반드시 뒤집는다.
 *
 * 카메라에 음수 스케일을 주면 뒤집히긴 하지만 면의 앞뒤(winding)가 뒤집혀
 * 모델이 안팎으로 뒤집혀 보인다. 그래서 렌더 타깃에 그린 뒤 화면에 합성할
 * 때 UV 를 뒤집는다.
 *
 * ── 시야각은 실제 거울 크기에서 계산한다 ────────────────
 * 평면 거울이 보여주는 각도 범위는 "눈에서 본 거울의 각크기"와 같다.
 * 임의로 넓히면 사각지대가 사라져 레슨 자체가 성립하지 않는다.
 *
 * ── 알려진 한계 ────────────────────────────────────────
 * 실제 조수석 사이드미러는 볼록거울이라 상이 작고 멀어 보인다
 * ("사물이 거울에 보이는 것보다 가까이 있음"). 여기서는 평면으로 두고
 * 시야각만 넓게 잡았다. 거리 판단 정확도가 부족하면 왜곡을 넣어야 한다.
 *
 * docs/stage-2-lane-change.md
 */

const DEG = Math.PI / 180

interface MirrorSpec {
  name: string
  /** 거울 위치 (차체 로컬, m) */
  position: { x: number; y: number; z: number }
  /** 정후방에서 바깥쪽으로 튼 각도 (도). + 가 바깥 */
  outwardDeg: number
  /** 수평 시야각 (도) — 실제 거울 크기에서 계산한 값 */
  fovDeg: number
  /** 화면상 위치·크기 (0~1 정규화, 좌하단 기준) */
  viewport: { x: number; y: number; w: number; h: number }
  /** 렌더 타깃 해상도 */
  resolution: { w: number; h: number }
}

/**
 * 실측 기반 사양.
 *
 * 룸미러  가로 26cm, 눈에서 65cm  → 2·atan(0.13/0.65) ≈ 22°
 * 좌 사이드 가로 16cm, 눈에서 90cm → ≈ 20° (법규상 10m 뒤 2.5m 폭 이상)
 * 우 사이드 볼록이라 더 넓다      → ≈ 28°
 */
const SPECS: MirrorSpec[] = [
  {
    name: 'room',
    position: { x: 0.05, y: 0.62, z: 0.72 },
    outwardDeg: 0,
    fovDeg: 22,
    viewport: { x: 0.5, y: 0.855, w: 0.17, h: 0.1 },
    resolution: { w: 640, h: 368 },
  },
  {
    // 운전석 쪽 (좌핸들이므로 +X)
    name: 'left',
    position: { x: 0.98, y: 0.2, z: 1.05 },
    outwardDeg: 11,
    fovDeg: 20,
    viewport: { x: 0.045, y: 0.30, w: 0.125, h: 0.09 },
    resolution: { w: 480, h: 320 },
  },
  {
    name: 'right',
    position: { x: -0.98, y: 0.2, z: 1.05 },
    outwardDeg: 11,
    fovDeg: 28,
    viewport: { x: 0.83, y: 0.30, w: 0.125, h: 0.09 },
    resolution: { w: 480, h: 320 },
  },
]

interface Mirror {
  spec: MirrorSpec
  camera: THREE.PerspectiveCamera
  target: THREE.WebGLRenderTarget
  quad: THREE.Mesh
  frame: THREE.Mesh
}

export class Mirrors {
  private readonly mirrors: Mirror[] = []
  /** 미러 화면을 합성하는 별도 씬 (직교 투영) */
  private readonly hudScene = new THREE.Scene()
  private readonly hudCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10)

  visible = true

  constructor(carRoot: THREE.Group) {
    for (const spec of SPECS) {
      const camera = new THREE.PerspectiveCamera(1, 1, 0.1, 250)
      camera.position.set(spec.position.x, spec.position.y, spec.position.z)

      // 기본 카메라는 -Z 를 본다. 차체 로컬 -Z 가 곧 후방이므로
      // 회전 없이 이미 뒤를 보고 있다. 여기서 바깥쪽으로만 튼다.
      // 왼쪽 거울은 +X 쪽(왼쪽)으로, 오른쪽 거울은 -X 쪽으로 틀어야 한다.
      const outwardSign = spec.position.x >= 0 ? -1 : 1
      camera.rotateY(outwardSign * spec.outwardDeg * DEG)
      carRoot.add(camera)

      const target = new THREE.WebGLRenderTarget(spec.resolution.w, spec.resolution.h)
      target.texture.colorSpace = THREE.SRGBColorSpace

      // 좌우 반전 — scale.x 를 음수로 두면 UV 가 뒤집힌다.
      // 단순한 사각형이고 재질이 basic 이라 winding 문제가 없다.
      const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: target.texture, side: THREE.DoubleSide }),
      )
      quad.scale.x = -1

      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0x0d1014 }),
      )
      frame.position.z = -0.1

      this.hudScene.add(frame)
      this.hudScene.add(quad)
      this.mirrors.push({ spec, camera, target, quad, frame })
    }

    this.layout()
    window.addEventListener('resize', () => this.layout())
  }

  /** 화면 비율이 바뀌면 미러 카메라의 종횡비와 배치를 다시 잡는다 */
  private layout(): void {
    for (const m of this.mirrors) {
      const { viewport, resolution, fovDeg } = m.spec
      const aspect = resolution.w / resolution.h
      m.camera.aspect = aspect
      // fovDeg 는 수평 시야각이다. Three 의 fov 는 수직이므로 환산한다.
      const halfH = Math.atan(Math.tan((fovDeg / 2) * DEG) / aspect)
      m.camera.fov = (2 * halfH) / DEG
      m.camera.updateProjectionMatrix()

      const w = viewport.w
      // 화면 비율이 달라져도 미러가 찌그러지지 않게 높이를 보정한다
      const h = (w * (resolution.h / resolution.w) * window.innerWidth) / window.innerHeight
      const cx = viewport.x + w / 2
      const cy = viewport.y + h / 2

      m.quad.position.set(cx, cy, 0)
      m.quad.scale.set(-w, h, 1)
      m.frame.position.set(cx, cy, -0.1)
      m.frame.scale.set(w + 0.008, h + 0.012, 1)
    }
  }

  /**
   * 미러 내용을 렌더 타깃에 그린다. 메인 렌더 **전에** 호출한다.
   * 씬을 3번 더 그리는 셈이라, 미러 해상도와 렌더 거리를 줄여 비용을 낮춘다.
   */
  renderTargets(renderer: THREE.WebGLRenderer, scene: THREE.Scene, hidden?: THREE.Object3D): void {
    if (!this.visible) return

    // 사이드미러 카메라는 도어 패널 바로 옆에 있어서, 실내를 그대로 두면
    // 미러가 자기 차 실내에 가려 아무것도 안 보인다.
    const wasVisible = hidden?.visible
    if (hidden) hidden.visible = false

    for (const m of this.mirrors) {
      renderer.setRenderTarget(m.target)
      renderer.render(scene, m.camera)
    }
    renderer.setRenderTarget(null)

    if (hidden && wasVisible !== undefined) hidden.visible = wasVisible
  }

  /** 미러를 화면에 합성한다. 메인 렌더 **후에** 호출한다. */
  composite(renderer: THREE.WebGLRenderer): void {
    if (!this.visible) return
    const previousAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.render(this.hudScene, this.hudCamera)
    renderer.autoClear = previousAutoClear
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    for (const m of this.mirrors) {
      m.quad.visible = visible
      m.frame.visible = visible
    }
  }
}

/** 운전석 눈 위치에서 각 미러까지의 거리 — 문서화·검증용 */
export function mirrorDistances(): { name: string; distance: number }[] {
  const eye = vehicleParams.driverSeat
  return SPECS.map((spec) => ({
    name: spec.name,
    distance: Math.hypot(spec.position.x - eye.x, spec.position.y - eye.y, spec.position.z - eye.z),
  }))
}
