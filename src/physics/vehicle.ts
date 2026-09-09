import RAPIER from '@dimforge/rapier3d-compat'
import { derivedGeometry, vehicleParams } from '../config/vehicle-params.ts'
import type { ControlState } from '../input/controls.ts'

/** 바퀴 인덱스 — 프로젝트 전체에서 이 순서를 지킨다 */
export const WHEEL = {
  FRONT_LEFT: 0,
  FRONT_RIGHT: 1,
  REAR_LEFT: 2,
  REAR_RIGHT: 3,
} as const

export const STEERED_WHEELS = [WHEEL.FRONT_LEFT, WHEEL.FRONT_RIGHT]
export const DRIVEN_WHEELS = [WHEEL.REAR_LEFT, WHEEL.REAR_RIGHT] // 후륜구동
export const ALL_WHEELS = [0, 1, 2, 3]

/** 차체 로컬 축 (docs 및 vehicle-params.ts 의 좌표 규칙과 일치) */
const AXIS_UP = 1 // Y
const AXIS_FORWARD = 2 // Z

/** 서스펜션이 지면을 향하는 방향 */
const SUSPENSION_DIR = { x: 0, y: -1, z: 0 }
/** 바퀴 회전축(차축) 방향 */
const AXLE_DIR = { x: -1, y: 0, z: 0 }

export interface Vehicle {
  controller: RAPIER.DynamicRayCastVehicleController
  body: RAPIER.RigidBody
  /** 스폰 지점으로 되돌린다 */
  respawn(): void
}

export function createVehicle(world: RAPIER.World): Vehicle {
  const { chassis, wheel, suspension, tire } = vehicleParams

  const { restingHeight, wheelConnectionY } = derivedGeometry()

  // ── 차체 강체 ─────────────────────────────────────────
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, restingHeight, 0)
      // 레이캐스트 차량은 서스펜션이 자세를 잡으므로 감쇠를 조금 준다
      .setLinearDamping(0.05)
      .setAngularDamping(0.5),
  )

  const halfExtents = [chassis.width / 2, chassis.height / 2, chassis.length / 2] as const

  // 형상 담당 콜라이더 — 충돌 판정용. 질량에는 기여하지 않는다.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(...halfExtents).setDensity(0).setFriction(0.6),
    body,
  )

  // 질량 담당 콜라이더 — 무게중심을 기하 중심보다 아래로 내리기 위한 것.
  // 내리지 않으면 조금만 꺾어도 전복하고, 너무 내리면 롤이 사라져 부자연스럽다.
  //
  // NOTE: 원래는 RigidBodyDesc.setAdditionalMassProperties() 로 질량·무게중심·
  //       관성을 직접 지정하는 것이 정석이다. 그러나 rapier3d-compat 0.20.0 에서는
  //       이 API가 동작하지 않는다 (body.mass() 가 0 을 반환하고 차가 움직이지 않는다).
  //       확인 방법: node tools/verify-physics.ts
  //
  //       대신 질량만 담당하는 콜라이더를 무게중심 위치에 겹쳐 둔다. 형상은 차체와
  //       동일하게 해야 관성 모멘트도 실제 차체 기준으로 계산된다. 충돌·쿼리에는
  //       전혀 참여하지 않도록 센서로 두고 그룹을 0 으로 막는다.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(...halfExtents)
      .setMass(chassis.mass)
      .setTranslation(0, chassis.centerOfMassY, 0)
      .setSensor(true)
      .setCollisionGroups(0)
      .setSolverGroups(0),
    body,
  )

  // ── 레이캐스트 차량 ───────────────────────────────────
  const controller = world.createVehicleController(body)
  controller.indexUpAxis = AXIS_UP
  // NOTE: rapier3d-compat 의 setter 이름이 `setIndexForwardAxis` 로 선언되어 있다.
  //       getter 는 `indexForwardAxis` 다. 바인딩 쪽 명명 실수로 보이며,
  //       업그레이드 시 이 줄이 깨질 수 있다.
  controller.setIndexForwardAxis = AXIS_FORWARD

  const connections = [
    { x: -wheel.halfTrack, y: wheelConnectionY, z: wheel.frontZ }, // 0 앞좌
    { x: +wheel.halfTrack, y: wheelConnectionY, z: wheel.frontZ }, // 1 앞우
    { x: -wheel.halfTrack, y: wheelConnectionY, z: wheel.rearZ }, //  2 뒤좌
    { x: +wheel.halfTrack, y: wheelConnectionY, z: wheel.rearZ }, //  3 뒤우
  ]

  for (const connection of connections) {
    controller.addWheel(
      connection,
      SUSPENSION_DIR,
      AXLE_DIR,
      wheel.suspensionRestLength,
      wheel.radius,
    )
  }

  for (const i of ALL_WHEELS) {
    controller.setWheelSuspensionStiffness(i, suspension.stiffness)
    controller.setWheelSuspensionCompression(i, suspension.compression)
    controller.setWheelSuspensionRelaxation(i, suspension.relaxation)
    controller.setWheelMaxSuspensionTravel(i, suspension.maxTravel)
    controller.setWheelMaxSuspensionForce(i, suspension.maxForce)
    controller.setWheelFrictionSlip(i, tire.frictionSlip)
    controller.setWheelSideFrictionStiffness(i, tire.sideFrictionStiffness)
  }

  return {
    controller,
    body,
    respawn() {
      body.setTranslation({ x: 0, y: derivedGeometry().restingHeight, z: 0 }, true)
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    },
  }
}

/**
 * 조작 상태를 차량에 반영한다. 물리 스텝 직전에 호출한다.
 *
 * 0단계는 단순 매핑이다. 1단계에서 엔진력 커브 · 앞뒤 브레이크 배분 ·
 * 엔진 브레이크 · 크립이 여기에 추가된다.
 */
export function applyControls(vehicle: Vehicle, controls: ControlState): void {
  const { drive, steering } = vehicleParams
  const { controller } = vehicle

  const roadWheelAngle = controls.steer * steering.maxRoadWheelAngle
  for (const i of STEERED_WHEELS) {
    controller.setWheelSteering(i, roadWheelAngle)
  }

  // 속도가 오를수록 엔진력을 줄여 최고 속도가 자연스럽게 생기게 한다.
  // 이게 없으면 최고 속도가 무한히 올라간다.
  const speed = Math.abs(controller.currentVehicleSpeed())
  const falloff = Math.max(0, 1 - speed / drive.maxSpeed)
  const direction = controls.gear === 'R' ? -1 : 1
  const engineForce = direction * controls.throttle * drive.maxEngineForce * falloff

  for (const i of DRIVEN_WHEELS) {
    controller.setWheelEngineForce(i, engineForce)
  }
  for (const i of ALL_WHEELS) {
    controller.setWheelBrake(i, controls.brake * drive.maxBrakeForce)
  }
}
