import RAPIER from '@dimforge/rapier3d-compat'
import { derivedGeometry, vehicleParams } from '../config/vehicle-params.ts'
import type { ControlState } from '../input/controls.ts'
import type { SteeringWheel } from '../vehicle/steering-wheel.ts'

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

  // 왼쪽이 +X 다 (좌표 규칙은 config/vehicle-params.ts 참조)
  const connections = [
    { x: +wheel.halfTrack, y: wheelConnectionY, z: wheel.frontZ }, // 0 앞좌
    { x: -wheel.halfTrack, y: wheelConnectionY, z: wheel.frontZ }, // 1 앞우
    { x: +wheel.halfTrack, y: wheelConnectionY, z: wheel.rearZ }, //  2 뒤좌
    { x: -wheel.halfTrack, y: wheelConnectionY, z: wheel.rearZ }, //  3 뒤우
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
 * 차체 전방(+Z) 방향의 속도 (m/s). 전진이 +.
 *
 * NOTE: Rapier 의 `currentVehicleSpeed()` 를 쓰면 안 된다. 그것은 속도
 *       **벡터의 크기**여서 낙하·경사 성분까지 포함한다. 평지에서는
 *       차이가 없지만, 3단계 램프에서는 실제보다 빠르게 읽혀 크립·기어
 *       판정이 틀어진다. (확인: 지면 밖으로 떨어지는 차가 20km/h 로 읽혔다)
 */
export function forwardSpeed(vehicle: Vehicle): number {
  const v = vehicle.body.linvel()
  const q = vehicle.body.rotation()

  // 로컬 +Z 를 쿼터니언으로 회전시킨 월드 전방 벡터
  const fx = 2 * (q.x * q.z + q.w * q.y)
  const fy = 2 * (q.y * q.z - q.w * q.x)
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y)

  return v.x * fx + v.y * fy + v.z * fz
}

/**
 * 조작 상태와 핸들 각도를 차량에 반영한다. 물리 스텝 직전에 호출한다.
 *
 * 조향은 핸들 각도에서 조향비를 거쳐 앞바퀴 각도로 변환된다.
 * 입력을 앞바퀴 각도에 직접 연결하지 않는 이유: docs/steering-model.md
 */
export function applyControls(
  vehicle: Vehicle,
  controls: ControlState,
  steeringWheel: SteeringWheel,
): void {
  const { drive, brake } = vehicleParams
  const { controller } = vehicle
  const speed = forwardSpeed(vehicle)

  // ── 조향 ────────────────────────────────────────────────
  // 부호를 뒤집는다. Rapier 에 양수 조향각을 주면 +X 쪽으로 도는데,
  // 전방이 +Z 인 이 좌표계에서 +X 는 운전자의 왼쪽이다. 우리 모델은
  // 핸들 각도 + 를 우회전으로 정의하므로 여기서 맞춰준다.
  //
  // 축 방향(axleCs)을 뒤집는 방법도 있지만, 그러면 전후진까지 반대가 된다.
  // (확인: axleCs.x=+1 로 두면 전진 명령에 차가 뒤로 간다)
  const roadWheelAngle = steeringWheel.roadWheelAngle(speed)
  for (const i of STEERED_WHEELS) {
    controller.setWheelSteering(i, -roadWheelAngle)
  }

  // ── 구동 ────────────────────────────────────────────────
  const forward = controls.gear === 'R' ? -1 : 1
  const maxSpeed = controls.gear === 'R' ? drive.maxReverseSpeed : drive.maxSpeed

  // 속도가 오를수록 엔진력을 줄여 최고 속도가 자연스럽게 생기게 한다.
  const falloff = Math.max(0, 1 - Math.abs(speed) / maxSpeed)
  let engineForce = forward * controls.throttle * drive.maxEngineForce * falloff

  // 크립 — 오토 차량은 브레이크만 떼도 스르륵 굴러간다.
  // 4단계 주차에서는 이게 조작의 절반이다.
  const speedInGearDirection = speed * forward
  if (controls.brake === 0 && speedInGearDirection < drive.creepSpeed) {
    // 목표 속도에 가까울수록 약해지는 비례 제어. 일정한 힘으로 밀면
    // 주행 저항과 균형을 이루는 지점에서 멈춰 목표 속도에 못 미친다.
    const deficit = 1 - speedInGearDirection / drive.creepSpeed
    engineForce += forward * drive.creepForce * deficit
  }

  for (const i of DRIVEN_WHEELS) {
    controller.setWheelEngineForce(i, engineForce)
  }

  // ── 제동 ────────────────────────────────────────────────
  // 엔진 브레이크 — 액셀을 뗐을 때 상시. 없으면 차가 안 서고
  // 계속 미끄러지는 느낌이 난다. 크립 영역에서는 걸지 않는다.
  const coasting = controls.throttle === 0 && Math.abs(speed) > drive.creepSpeed
  const engineBrake = coasting ? brake.engineBrake : 0

  // 앞뒤 배분 — 실차와 같이 앞이 강하다. 급제동 시 노즈다이브가 살아난다.
  const total = controls.brake * brake.maxForce * 4
  const frontPerWheel = (total * brake.frontBias) / 2 + engineBrake
  const rearPerWheel = (total * (1 - brake.frontBias)) / 2 + engineBrake

  controller.setWheelBrake(WHEEL.FRONT_LEFT, frontPerWheel)
  controller.setWheelBrake(WHEEL.FRONT_RIGHT, frontPerWheel)
  controller.setWheelBrake(WHEEL.REAR_LEFT, rearPerWheel)
  controller.setWheelBrake(WHEEL.REAR_RIGHT, rearPerWheel)
}

/**
 * 튜닝 패널에서 서스펜션·타이어 값을 바꿨을 때 물리에 다시 밀어 넣는다.
 * 이 값들은 생성 시점에만 반영되므로 매번 갱신해야 슬라이더가 동작한다.
 */
export function syncTuningToWheels(vehicle: Vehicle): void {
  const { suspension, tire } = vehicleParams
  const { controller } = vehicle

  for (const i of ALL_WHEELS) {
    controller.setWheelSuspensionStiffness(i, suspension.stiffness)
    controller.setWheelSuspensionCompression(i, suspension.compression)
    controller.setWheelSuspensionRelaxation(i, suspension.relaxation)
    controller.setWheelMaxSuspensionTravel(i, suspension.maxTravel)
    controller.setWheelMaxSuspensionForce(i, suspension.maxForce)
    controller.setWheelFrictionSlip(i, tire.frictionSlip)
    controller.setWheelSideFrictionStiffness(i, tire.sideFrictionStiffness)
  }
}
