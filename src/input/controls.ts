import { vehicleParams } from '../config/vehicle-params.ts'
import { approach, type SteeringInput, type SteeringWheel } from '../vehicle/steering-wheel.ts'
import type { Keyboard } from './keyboard.ts'
import type { Mouse } from './mouse.ts'

export type Gear = 'D' | 'R'
export type InputDevice = 'keyboard' | 'mouse'

/**
 * 장치에 독립적인 조작 상태.
 *
 * 키보드 · 마우스 · 폰 자이로 · 게임패드 어느 것으로 조작하든 이 형태로
 * 정규화한 뒤 차량에 전달한다. 이 분리 덕분에 입력 장치를 바꿔도
 * 조작감 튜닝 결과가 유지된다. docs/OVERVIEW.md 참조.
 */
export interface ControlState {
  steering: SteeringInput
  /** 0 ~ 1 */
  throttle: number
  /** 0 ~ 1 */
  brake: number
  gear: Gear
}

export class DrivingControls {
  readonly state: ControlState = {
    steering: { delta: 0, active: false },
    throttle: 0,
    brake: 0,
    gear: 'D',
  }

  /** 마지막으로 조향에 쓰인 장치 (표시용) */
  device: InputDevice = 'keyboard'

  private gearChangeTimer = 0

  /**
   * @param dt 고정 물리 스텝 (초)
   * @param speed 현재 전진 속도 (m/s, 부호 있음)
   */
  update(
    dt: number,
    keyboard: Keyboard,
    mouse: Mouse,
    wheel: SteeringWheel,
    speed: number,
  ): ControlState {
    const { pedal } = vehicleParams
    const state = this.state

    this.updateSteering(dt, keyboard, mouse, wheel, speed)

    // ── 기어 ────────────────────────────────────────────
    const forwardKey = keyboard.isHeld('KeyW', 'ArrowUp')
    const backwardKey = keyboard.isHeld('KeyS', 'ArrowDown')
    this.updateGear(dt, forwardKey, backwardKey, speed)

    // 기어에 따라 두 키의 역할이 바뀐다. 실제 차와 같이
    // "진행 방향으로 가속 / 반대 방향 키는 제동" 이 된다.
    const accelKey = state.gear === 'D' ? forwardKey : backwardKey
    const brakeKey = state.gear === 'D' ? backwardKey : forwardKey

    // 페달 램프 — 실제 페달도 즉시 100% 가 되지 않는다
    state.throttle = rampTo(state.throttle, accelKey ? 1 : 0, dt, pedal)
    state.brake = rampTo(state.brake, brakeKey ? 1 : 0, dt, pedal)

    return state
  }

  private updateSteering(
    dt: number,
    keyboard: Keyboard,
    mouse: Mouse,
    wheel: SteeringWheel,
    speed: number,
  ): void {
    const { mouse: mouseParams } = vehicleParams

    // Space = 핸들에서 손을 뗀다. 자동 복원이 걸린다.
    const handsOff = keyboard.isHeld('Space')

    let delta = 0
    let touched = false

    // 마우스가 잠겨 있으면 이동량을 그대로 핸들 각도로 누적한다.
    // 커브를 적용하지 않는다 — 각도 자체가 정보이므로 왜곡하면
    // 감각 학습이 무의미해진다.
    if (mouse.locked) {
      const dx = mouse.consumeDeltaX()
      if (dx !== 0) {
        delta += (dx / mouseParams.pixelsPerTurn) * (2 * Math.PI)
        this.device = 'mouse'
        touched = true
      }
    }

    // 키보드는 누르고 있는 동안 각도가 누적된다.
    // 구조적으로 실제 핸들을 돌리는 것과 같다 (위치 지정이 아니라 회전 누적).
    const direction =
      (keyboard.isHeld('KeyD', 'ArrowRight') ? 1 : 0) -
      (keyboard.isHeld('KeyA', 'ArrowLeft') ? 1 : 0)

    if (direction !== 0) {
      delta += direction * wheel.handSpeed(speed) * dt
      this.device = 'keyboard'
      touched = true
    }

    // 마우스가 잠긴 동안은 손을 올려둔 것으로 본다 — 각도가 유지된다.
    const active = !handsOff && (touched || mouse.locked)

    this.state.steering.delta = handsOff ? 0 : delta
    this.state.steering.active = active
  }

  private updateGear(dt: number, forwardKey: boolean, backwardKey: boolean, speed: number): void {
    const { gearbox } = vehicleParams
    const state = this.state
    const stopped = Math.abs(speed) < gearbox.standstillSpeed

    // 정지 상태에서 반대 방향 키를 일정 시간 유지하면 기어가 바뀐다
    const wantsSwitch = stopped && (state.gear === 'D' ? backwardKey : forwardKey)

    if (!wantsSwitch) {
      this.gearChangeTimer = 0
      return
    }

    this.gearChangeTimer += dt
    if (this.gearChangeTimer >= gearbox.changeDelay) {
      state.gear = state.gear === 'D' ? 'R' : 'D'
      this.gearChangeTimer = 0
    }
  }

  reset(): void {
    this.state.throttle = 0
    this.state.brake = 0
    this.state.gear = 'D'
    this.gearChangeTimer = 0
  }
}

function rampTo(
  current: number,
  target: number,
  dt: number,
  pedal: { pressRate: number; releaseRate: number },
): number {
  const rate = target > current ? pedal.pressRate : pedal.releaseRate
  return approach(current, target, rate * dt)
}
