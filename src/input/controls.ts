import { vehicleParams } from '../config/vehicle-params.ts'
import type { Keyboard } from './keyboard.ts'

export type Gear = 'D' | 'R'

/**
 * 장치에 독립적인 조작 상태.
 *
 * 키보드 · 마우스 · 폰 자이로 · 게임패드 어느 것으로 조작하든
 * 이 형태로 정규화한 뒤 차량에 전달한다. 이 분리 덕분에 입력 장치를
 * 바꿔도 조작감 튜닝 결과가 유지된다. docs/OVERVIEW.md 참조.
 */
export interface ControlState {
  /** -1(좌) ~ +1(우) */
  steer: number
  /** 0 ~ 1 */
  throttle: number
  /** 0 ~ 1 */
  brake: number
  gear: Gear
}

/** 기어 전환에 필요한 정지 상태 유지 시간 (초) */
const GEAR_CHANGE_DELAY = 0.3
/** 정지로 간주하는 속도 (m/s) */
const STANDSTILL_SPEED = 0.3

/**
 * 0단계 키보드 조작.
 *
 * 조향만 속도 기반으로 보간한다 — 즉시 최대각으로 꺾이면 차가 뒤집히고
 * 감각 학습도 되지 않기 때문이다. 액셀·브레이크 램프와 핸들 각도 모델은
 * 1단계에서 추가된다. docs/steering-model.md 참조.
 */
export class KeyboardControls {
  readonly state: ControlState = { steer: 0, throttle: 0, brake: 0, gear: 'D' }

  private gearChangeTimer = 0

  /**
   * @param dt 고정 물리 스텝 (초)
   * @param speed 현재 전진 속도 (m/s, 부호 있음)
   */
  update(dt: number, keyboard: Keyboard, speed: number): ControlState {
    const { steering } = vehicleParams
    const state = this.state

    // ── 조향 ────────────────────────────────────────────
    const steerInput =
      (keyboard.isHeld('KeyD', 'ArrowRight') ? 1 : 0) -
      (keyboard.isHeld('KeyA', 'ArrowLeft') ? 1 : 0)

    // 파라미터는 rad/s 이므로 정규화 단위(-1~1)로 환산한다
    const rate = (steerInput !== 0 ? steering.rate : steering.returnRate) / steering.maxRoadWheelAngle
    state.steer = approach(state.steer, steerInput, rate * dt)

    // ── 기어 ────────────────────────────────────────────
    const forwardKey = keyboard.isHeld('KeyW', 'ArrowUp')
    const backwardKey = keyboard.isHeld('KeyS', 'ArrowDown')
    this.updateGear(dt, forwardKey, backwardKey, speed)

    // ── 액셀 · 브레이크 ─────────────────────────────────
    // 기어에 따라 두 키의 역할이 바뀐다. 실제 차와 같이
    // "진행 방향으로 가속 / 반대 방향 키는 제동" 이 된다.
    const accelKey = state.gear === 'D' ? forwardKey : backwardKey
    const brakeKey = state.gear === 'D' ? backwardKey : forwardKey

    state.throttle = accelKey ? 1 : 0
    state.brake = brakeKey ? 1 : 0

    return state
  }

  private updateGear(dt: number, forwardKey: boolean, backwardKey: boolean, speed: number): void {
    const state = this.state
    const stopped = Math.abs(speed) < STANDSTILL_SPEED

    // 정지 상태에서 반대 방향 키를 일정 시간 유지하면 기어가 바뀐다
    const wantsSwitch = stopped && (state.gear === 'D' ? backwardKey : forwardKey)

    if (!wantsSwitch) {
      this.gearChangeTimer = 0
      return
    }

    this.gearChangeTimer += dt
    if (this.gearChangeTimer >= GEAR_CHANGE_DELAY) {
      state.gear = state.gear === 'D' ? 'R' : 'D'
      this.gearChangeTimer = 0
    }
  }
}

/** current 를 target 쪽으로 최대 maxDelta 만큼 이동 */
function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current
  if (Math.abs(diff) <= maxDelta) return target
  return current + Math.sign(diff) * maxDelta
}
