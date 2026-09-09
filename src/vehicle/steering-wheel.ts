import { vehicleParams } from '../config/vehicle-params.ts'

/**
 * 장치에 독립적인 조향 입력.
 *
 * 실제 핸들은 순간이동하지 않으므로, 입력은 "어느 각도로 가라"가 아니라
 * "이번 스텝에 이만큼 돌렸다"로 표현한다. 모든 장치가 이 형태로 환산된다.
 *
 *   키보드     — 누른 방향 × 손 속도 × dt
 *   마우스     — 이동량 × 감도
 *   폰 자이로  — 화면을 누른 동안의 기울기 변화량 (그립/릴리즈)
 *   실제 휠    — 목표 각도 - 현재 각도 (절대 장치)
 */
export interface SteeringInput {
  /** 이번 스텝에 핸들을 돌린 양 (rad). +는 우회전 */
  delta: number
  /**
   * 사용자가 핸들을 잡고 있는가.
   * false 면 자동 복원이 걸린다. 손을 놓은 상태를 표현한다.
   */
  active: boolean
}

/**
 * 핸들 모델 — 이 프로젝트의 중심 구조.
 *
 * 핸들 각도(±450°)를 1급 상태값으로 들고, 조향비로 앞바퀴 각도(±33°)를 만든다.
 * 일반적인 게임처럼 입력을 앞바퀴 각도에 바로 연결하면 "핸들을 한 바퀴 반
 * 감았다"는 개념 자체가 존재하지 않게 되고, 3~4단계에서 가르치려는 것을
 * 표현할 수 없다.
 *
 * 근거와 전체 설계: docs/steering-model.md
 */
export class SteeringWheel {
  /** 핸들 각도 (rad). + 가 우회전 */
  angle = 0

  /** 이번 스텝에 락(끝까지 감김)에 닿았는가 — 소리·시각 피드백용 */
  atLock = false

  update(dt: number, input: SteeringInput, speed: number): void {
    const p = vehicleParams.steeringWheel

    let next = this.angle + input.delta

    // 자동 복원 — 실제 차의 캐스터 복원감.
    // 정차 중에는 복원하지 않는다. 주차할 때 핸들을 감아둔 채
    // 유지할 수 있어야 하기 때문이다.
    if (!input.active) {
      const speedFactor = clamp01(Math.abs(speed) / p.returnFullSpeed)
      next = approach(next, 0, p.returnRate * speedFactor * dt)
    }

    const clamped = clamp(next, -p.maxAngle, p.maxAngle)
    this.atLock = clamped !== next && Math.abs(input.delta) > 0
    this.angle = clamped
  }

  /**
   * 현재 속도에서의 조향비.
   *
   * 고속에서 최대 조향각을 좁히는 대신 조향비를 키운다. 핸들은 언제나
   * 450°까지 돌아가되, 고속에서는 같은 핸들 각도가 더 작은 앞바퀴 각도가
   * 된다. 실제 가변 조향비(VGR) 차량과 같은 방식이다.
   */
  ratio(speed: number): number {
    const p = vehicleParams.steeringWheel
    const t = clamp01(
      (Math.abs(speed) - p.ratioLowSpeed) / Math.max(p.ratioHighSpeed - p.ratioLowSpeed, 1e-6),
    )
    return p.ratioLow + (p.ratioHigh - p.ratioLow) * t
  }

  /** 앞바퀴 조향각 (rad) */
  roadWheelAngle(speed: number): number {
    const p = vehicleParams.steeringWheel
    const angle = this.angle / this.ratio(speed)
    return clamp(angle, -p.maxRoadWheelAngle, p.maxRoadWheelAngle)
  }

  /** 핸들 회전 수 (표시용). 1.5 면 한 바퀴 반 */
  get turns(): number {
    return this.angle / (2 * Math.PI)
  }

  reset(): void {
    this.angle = 0
    this.atLock = false
  }

  /**
   * 현재 속도에 맞는 손 회전 속도 (rad/s).
   * 주차할 때는 실제로 훨씬 빠르게 감는다.
   */
  handSpeed(speed: number): number {
    const p = vehicleParams.steeringWheel
    const t = clamp01(Math.abs(speed) / p.handSpeedBlendSpeed)
    return p.handSpeedParking + (p.handSpeedNormal - p.handSpeedParking) * t
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const clamp01 = (v: number) => clamp(v, 0, 1)

/** current 를 target 쪽으로 최대 maxDelta 만큼 이동 */
export function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current
  if (Math.abs(diff) <= maxDelta) return target
  return current + Math.sign(diff) * maxDelta
}
