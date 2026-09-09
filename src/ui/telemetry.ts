import { vehicleParams } from '../config/vehicle-params.ts'
import type { DrivingControls } from '../input/controls.ts'
import { ALL_WHEELS, forwardSpeed, type Vehicle } from '../physics/vehicle.ts'
import type { CameraMode } from '../render/scene.ts'
import type { LaneChangeMonitor } from '../driving/lane-change.ts'
import type { Traffic } from '../traffic/traffic.ts'
import type { SteeringWheel } from '../vehicle/steering-wheel.ts'

/**
 * 텔레메트리.
 *
 * "왜 이상한지"를 눈으로 봐야 고칠 수 있다. 차가 떨리거나 뒤집힐 때
 * 원인은 대개 특정 바퀴의 접지·서스펜션·횡슬립에 있는데, 숫자가 없으면
 * 슬라이더를 아무렇게나 만지는 수밖에 없다.
 *
 * docs/stage-1-open-lot.md 의 텔레메트리 표 참조.
 */

const DEG = 180 / Math.PI
const WHEEL_LABELS = ['앞좌', '앞우', '뒤좌', '뒤우']

export class Telemetry {
  constructor(private readonly element: HTMLElement) {}

  update(
    vehicle: Vehicle,
    controls: DrivingControls,
    steeringWheel: SteeringWheel,
    cameraMode: CameraMode,
    fps: number,
    road?: { monitor: LaneChangeMonitor; traffic: Traffic },
  ): void {
    const speed = forwardSpeed(vehicle)
    const speedKmh = speed * 3.6
    const state = controls.state

    const wheelAngle = steeringWheel.angle * DEG
    const turns = steeringWheel.turns
    const ratio = steeringWheel.ratio(speed)
    const roadWheel = steeringWheel.roadWheelAngle(speed) * DEG

    const rows = ALL_WHEELS.map((i) => {
      const contact = vehicle.controller.wheelIsInContact(i)
      const suspension = vehicle.controller.wheelSuspensionLength(i) ?? 0
      const compression = vehicleParams.wheel.suspensionRestLength - suspension
      const side = vehicle.controller.wheelSideImpulse(i) ?? 0
      return (
        `${WHEEL_LABELS[i]}  ${contact ? '●' : '○'}  ` +
        `${(compression * 100).toFixed(0).padStart(4)}cm  ` +
        `${side.toFixed(0).padStart(6)}`
      )
    }).join('\n')

    // 도로에서는 차선과 차간거리를 함께 본다.
    // 차간거리를 "몇 초"로 읽는 습관이 안전거리 판단의 핵심이다.
    let roadLine = ''
    if (road) {
      const t = vehicle.body.translation()
      const situation = road.monitor.situation(t.x, t.z, speed, road.traffic)
      if (situation) {
        const ahead =
          situation.aheadGap === null
            ? '  --'
            : `${situation.aheadGap.toFixed(0).padStart(4)}m` +
              (situation.headway === null ? '' : ` (${situation.headway.toFixed(1)}초)`)
        const behind =
          situation.behindGap === null ? '  --' : `${situation.behindGap.toFixed(0).padStart(4)}m`
        roadLine =
          `\n차선    <b>${situation.lane + 1}</b>차선\n` +
          `앞차    <b>${ahead}</b>\n` +
          `뒤차    <b>${behind}</b>\n`
      }
    }

    this.element.innerHTML =
      `속도    <b>${speedKmh.toFixed(0).padStart(4)}</b> km/h    기어 <b>${state.gear}</b>\n` +
      roadLine +
      `\n` +
      `핸들    <b>${wheelAngle.toFixed(0).padStart(4)}</b>°   ` +
      `<b>${turns.toFixed(2).padStart(5)}</b>바퀴${steeringWheel.atLock ? '  <b>락</b>' : ''}\n` +
      `조향비  <b>${ratio.toFixed(0).padStart(4)}</b>:1   앞바퀴 <b>${roadWheel.toFixed(0).padStart(3)}</b>°\n` +
      `\n` +
      `액셀    ${bar(state.throttle)} ${state.throttle.toFixed(2)}\n` +
      `브레이크 ${bar(state.brake)} ${state.brake.toFixed(2)}\n` +
      `\n` +
      `바퀴 접지 압축   횡슬립\n` +
      `${rows}\n` +
      `\n` +
      `조향 <b>${controls.device === 'mouse' ? '마우스' : '키보드'}</b>   ` +
      `시점 <b>${cameraMode === 'driver' ? '운전석' : '3인칭'}</b>   ` +
      `<b>${fps.toFixed(0)}</b>fps`
  }
}

function bar(value: number): string {
  const filled = Math.round(value * 8)
  return '▉'.repeat(filled) + '·'.repeat(8 - filled)
}
