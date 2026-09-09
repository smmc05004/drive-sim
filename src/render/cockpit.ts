import * as THREE from 'three'
import { vehicleParams } from '../config/vehicle-params.ts'

/**
 * 운전석 내부 — 대시보드, 보닛, 그리고 3D 핸들.
 *
 * 핸들이 여기 있는 이유는 장식이 아니다. 브라우저에서는 포스 피드백을
 * 쓸 수 없어 "지금 핸들이 얼마나 꺾여 있는가"를 손으로 느낄 수 없다.
 * 그 촉각을 대체하는 **유일한 수단**이 이 화면의 핸들이다.
 * 실제 운전 교육에서도 초보는 처음엔 핸들을 보면서 배운다.
 *
 * docs/steering-model.md 의 "촉각의 시각적 대체" 참조.
 */

const RIM_RADIUS = 0.185
const RIM_THICKNESS = 0.018

const COLORS = {
  interior: 0x272c33,
  hood: 0x35577d,
  rim: 0x14171a,
  spoke: 0x1e2329,
  marker: 0xffd166,
  markerAtLock: 0xff5c5c,
}

export class CockpitView {
  readonly root = new THREE.Group()

  private readonly wheelSpin = new THREE.Group()
  private readonly markerMaterial: THREE.MeshBasicMaterial

  constructor(carRoot: THREE.Group) {
    const { driverSeat, chassis } = vehicleParams
    const interior = new THREE.MeshLambertMaterial({ color: COLORS.interior })

    // 보닛 — 차 앞쪽 끝이 어디인지 알려준다.
    // 실차에서도 초보가 차 길이를 가늠하는 기준이다.
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(chassis.width - 0.1, 0.75, 0.9),
      new THREE.MeshLambertMaterial({ color: COLORS.hood }),
    )
    // 앞유리 아래에서 시작해 차 앞쪽 끝까지. 눈높이보다 0.2m 아래에 둔다.
    // 윗면은 눈높이보다 0.18m 아래, 아랫면은 지상고까지.
    // 얇은 판으로 두면 그 아래로 자기 차 앞바퀴가 훤히 보인다.
    hood.position.set(0, -0.135, 1.75)
    this.root.add(hood)

    // 대시보드 — 시야 하단을 막아 실내에 앉아 있는 느낌을 준다
    const dashboard = new THREE.Mesh(new THREE.BoxGeometry(chassis.width - 0.1, 0.34, 0.45), interior)
    // 보닛보다 낮게 둔다. 높으면 보닛을 가려 차 앞끝을 가늠할 수 없다.
    dashboard.position.set(0, 0.0, 1.18)
    this.root.add(dashboard)

    // 좌우 도어 패널 — 차폭 감각의 기준
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 2.0), interior)
      // 창턱 높이 — 눈높이보다 확실히 아래여야 시야를 막지 않는다
      door.position.set(side * (chassis.width / 2 - 0.06), -0.12, 0.2)
      this.root.add(door)
    }

    // ── 핸들 ──────────────────────────────────────────
    const column = new THREE.Group()
    // 눈에서 핸들까지 약 0.62m, 눈높이보다 0.32m 아래.
    // 가까우면 화면을 다 가리고, 멀면 각도가 안 읽힌다.
    column.position.set(driverSeat.x, driverSeat.y - 0.32, driverSeat.z + 0.62)
    // 스티어링 컬럼 경사 — 실차처럼 뒤로 눕는다
    column.rotation.x = -22 * (Math.PI / 180)
    column.add(this.wheelSpin)
    this.root.add(column)

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(RIM_RADIUS, RIM_THICKNESS, 10, 36),
      new THREE.MeshLambertMaterial({ color: COLORS.rim }),
    )
    this.wheelSpin.add(rim)

    // 스포크 3개 — 회전량을 읽는 보조 단서
    const spokeMaterial = new THREE.MeshLambertMaterial({ color: COLORS.spoke })
    for (const deg of [-90, 30, 150]) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(RIM_RADIUS, 0.022, 0.014),
        spokeMaterial,
      )
      const rad = deg * (Math.PI / 180)
      spoke.position.set(Math.cos(rad) * RIM_RADIUS * 0.5, Math.sin(rad) * RIM_RADIUS * 0.5, 0)
      spoke.rotation.z = rad
      this.wheelSpin.add(spoke)
    }

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), spokeMaterial)
    hub.rotation.x = Math.PI / 2
    this.wheelSpin.add(hub)

    // 12시 마커 — 이것 하나로 회전량이 직관적으로 읽힌다.
    // 락에 닿으면 색이 바뀌어 "더 이상 안 감긴다"를 알린다.
    this.markerMaterial = new THREE.MeshBasicMaterial({ color: COLORS.marker })
    // 림 앞면(운전자 쪽)에 붙인다. 림 한가운데 두면 림이 마커를 가로질러
    // 두 조각으로 보인다.
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.012), this.markerMaterial)
    marker.position.set(0, RIM_RADIUS, -RIM_THICKNESS - 0.005)
    this.wheelSpin.add(marker)

    carRoot.add(this.root)
  }

  /**
   * @param angle 핸들 각도 (rad). + 가 우회전
   * @param atLock 락에 닿았는가
   */
  update(angle: number, atLock: boolean): void {
    // 운전자는 -Z 쪽에서 XY 평면을 보므로, +Z 축 회전이 시계 방향으로 보인다.
    // 즉 우회전(+)이 그대로 시계 방향이 된다.
    this.wheelSpin.rotation.z = angle
    this.markerMaterial.color.setHex(atLock ? COLORS.markerAtLock : COLORS.marker)
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible
  }
}
