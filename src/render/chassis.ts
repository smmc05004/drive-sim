import * as THREE from 'three'
import { vehicleParams } from '../config/vehicle-params.ts'
import { ALL_WHEELS, type Vehicle } from '../physics/vehicle.ts'

/**
 * 차체와 바퀴의 시각 표현.
 *
 * 0단계는 박스와 원통이다. 형태 식별만 되면 충분하고, 그래픽은
 * 이 프로젝트의 우선순위가 아니다. (docs/OVERVIEW.md 참조)
 */
export class ChassisView {
  private readonly wheelPivots: THREE.Group[] = []
  private readonly wheelSpins: THREE.Group[] = []

  constructor(
    private readonly carRoot: THREE.Group,
    private readonly vehicle: Vehicle,
  ) {
    const { chassis, wheel } = vehicleParams

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(chassis.width, chassis.height, chassis.length),
      new THREE.MeshLambertMaterial({ color: 0x4a7fb5 }),
    )
    carRoot.add(body)

    // 전방(+Z) 표시 — 0단계에서 축 방향을 눈으로 확인하기 위한 것
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    )
    nose.position.set(0, chassis.height / 2 + 0.06, chassis.length / 2 - 0.3)
    carRoot.add(nose)

    const wheelGeometry = new THREE.CylinderGeometry(wheel.radius, wheel.radius, 0.25, 20)
    // 원통의 기본 축은 Y 다. 차축인 X 축에 맞춰 눕힌다.
    wheelGeometry.rotateZ(Math.PI / 2)

    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x22262b })

    for (const _ of ALL_WHEELS) {
      // pivot: 위치 + 조향(Y축) / spin: 바퀴 회전(X축)
      const pivot = new THREE.Group()
      const spin = new THREE.Group()
      spin.add(new THREE.Mesh(wheelGeometry, wheelMaterial))
      pivot.add(spin)
      carRoot.add(pivot)
      this.wheelPivots.push(pivot)
      this.wheelSpins.push(spin)
    }
  }

  /** 물리 상태를 시각 표현에 반영한다. 렌더 직전에 호출한다. */
  sync(): void {
    const { body, controller } = this.vehicle

    const t = body.translation()
    const r = body.rotation()
    this.carRoot.position.set(t.x, t.y, t.z)
    this.carRoot.quaternion.set(r.x, r.y, r.z, r.w)

    for (const i of ALL_WHEELS) {
      const connection = controller.wheelChassisConnectionPointCs(i)
      const suspensionLength = controller.wheelSuspensionLength(i)
      if (!connection || suspensionLength === null) continue

      // 서스펜션은 아래(-Y)로 뻗는다
      this.wheelPivots[i].position.set(
        connection.x,
        connection.y - suspensionLength,
        connection.z,
      )
      this.wheelPivots[i].rotation.y = controller.wheelSteering(i) ?? 0
      this.wheelSpins[i].rotation.x = controller.wheelRotation(i) ?? 0
    }
  }
}
