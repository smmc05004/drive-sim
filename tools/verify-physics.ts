/**
 * 0단계 물리 검증 — 브라우저 없이 실행한다.
 *
 *   node tools/verify-physics.ts
 *
 * 렌더링을 붙이기 전에 확인해야 하는 것들:
 *   - 좌표 규칙이 실제 Rapier 동작과 일치하는가 (전방 +Z, 우측 +X)
 *   - 차가 지면에 안정적으로 서는가 (뚫거나 뜨거나 떨지 않는가)
 *   - 고정 스텝이 결정론적인가
 */
import { createWorld, FIXED_DT } from '../src/physics/world.ts'
import { applyControls, createVehicle } from '../src/physics/vehicle.ts'
import type { ControlState } from '../src/input/controls.ts'

const NEUTRAL: ControlState = { steer: 0, throttle: 0, brake: 0, gear: 'D' }

interface Sample {
  x: number
  y: number
  z: number
  speed: number
  /** 차체 위 방향의 Y 성분. 1이면 똑바로, 0이면 옆으로 누움 */
  uprightness: number
  wheelsOnGround: number
}

async function run(label: string, controls: ControlState, steps: number): Promise<Sample> {
  const world = await createWorld()
  const vehicle = createVehicle(world)

  for (let i = 0; i < steps; i++) {
    applyControls(vehicle, controls)
    vehicle.controller.updateVehicle(FIXED_DT)
    world.step()
  }

  const sample = measure(vehicle)
  console.log(
    `  ${label.padEnd(22)} ` +
      `pos(${fmt(sample.x)}, ${fmt(sample.y)}, ${fmt(sample.z)})  ` +
      `속도 ${fmt(sample.speed)} m/s  ` +
      `수직도 ${fmt(sample.uprightness)}  ` +
      `접지 ${sample.wheelsOnGround}/4`,
  )
  world.free()
  return sample
}

function measure(vehicle: ReturnType<typeof createVehicle>): Sample {
  const t = vehicle.body.translation()
  const r = vehicle.body.rotation()

  // 로컬 +Y 를 월드로 회전시킨 벡터의 Y 성분
  const uprightness = 1 - 2 * (r.x * r.x + r.z * r.z)

  let wheelsOnGround = 0
  for (let i = 0; i < 4; i++) {
    if (vehicle.controller.wheelIsInContact(i)) wheelsOnGround++
  }

  return {
    x: t.x,
    y: t.y,
    z: t.z,
    speed: vehicle.controller.currentVehicleSpeed(),
    uprightness,
    wheelsOnGround,
  }
}

const fmt = (n: number) => n.toFixed(3).padStart(7)

const results: { name: string; ok: boolean; detail: string }[] = []
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail })
}

console.log('\n0단계 물리 검증\n')

// ── 1. 정적 자세 ────────────────────────────────────────
console.log('1. 정적 자세 (무입력 2초)')
const rest = await run('정지', NEUTRAL, 120)
check('지면을 뚫지 않는다', rest.y > 0.2, `y=${rest.y.toFixed(3)}`)
check('네 바퀴가 모두 접지한다', rest.wheelsOnGround === 4, `${rest.wheelsOnGround}/4`)
check('똑바로 서 있다', rest.uprightness > 0.99, `수직도=${rest.uprightness.toFixed(4)}`)
check('제자리에 머문다', Math.hypot(rest.x, rest.z) < 0.1, `이동=${Math.hypot(rest.x, rest.z).toFixed(3)}m`)

// ── 2. 전방 축 ──────────────────────────────────────────
console.log('\n2. 전방 축 (액셀 3초)')
const forward = await run('전진 D', { ...NEUTRAL, throttle: 1 }, 180)
check('전진하면 +Z 로 간다', forward.z > 1, `z=${forward.z.toFixed(2)}m`)
check('전진 속도가 양수다', forward.speed > 1, `${forward.speed.toFixed(2)} m/s`)
check('전진 중 직진을 유지한다', Math.abs(forward.x) < 0.5, `x 편차=${forward.x.toFixed(3)}m`)

console.log('\n   후진 (기어 R, 액셀 3초)')
const backward = await run('후진 R', { ...NEUTRAL, throttle: 1, gear: 'R' }, 180)
check('후진하면 -Z 로 간다', backward.z < -1, `z=${backward.z.toFixed(2)}m`)

// ── 3. 조향 방향 ────────────────────────────────────────
console.log('\n3. 조향 방향 (액셀 + 조향 3초)')
const right = await run('우조향 steer=+1', { ...NEUTRAL, throttle: 1, steer: 1 }, 180)
const left = await run('좌조향 steer=-1', { ...NEUTRAL, throttle: 1, steer: -1 }, 180)
check('steer=+1 이면 오른쪽(+X)으로 돈다', right.x > 1, `x=${right.x.toFixed(2)}m`)
check('steer=-1 이면 왼쪽(-X)으로 돈다', left.x < -1, `x=${left.x.toFixed(2)}m`)
check('선회 중 전복하지 않는다', right.uprightness > 0.9 && left.uprightness > 0.9,
  `수직도=${Math.min(right.uprightness, left.uprightness).toFixed(3)}`)

// ── 4. 제동 ─────────────────────────────────────────────
console.log('\n4. 제동')
const world = await createWorld()
const vehicle = createVehicle(world)
for (let i = 0; i < 180; i++) {
  applyControls(vehicle, { ...NEUTRAL, throttle: 1 })
  vehicle.controller.updateVehicle(FIXED_DT)
  world.step()
}
const beforeBrake = vehicle.controller.currentVehicleSpeed()
let brakeSteps = 0
while (vehicle.controller.currentVehicleSpeed() > 0.1 && brakeSteps < 600) {
  applyControls(vehicle, { ...NEUTRAL, brake: 1 })
  vehicle.controller.updateVehicle(FIXED_DT)
  world.step()
  brakeSteps++
}
const stopTime = brakeSteps * FIXED_DT
const deceleration = beforeBrake / stopTime
console.log(
  `   ${beforeBrake.toFixed(2)} m/s 에서 정지까지 ${stopTime.toFixed(2)}초 ` +
    `(감속 ${deceleration.toFixed(1)} m/s²)`,
)
check('브레이크로 정지한다', vehicle.controller.currentVehicleSpeed() <= 0.1, `${brakeSteps} 스텝`)
// 실차 급제동은 8~9 m/s² 수준. 이 범위를 벗어나면 제동 감각이 학습에 쓸 수 없다.
check(
  '감속도가 실차 범위다 (6~11 m/s²)',
  deceleration > 6 && deceleration < 11,
  `${deceleration.toFixed(1)} m/s²`,
)
world.free()

// ── 5. 결정론 ───────────────────────────────────────────
console.log('\n5. 고정 스텝 결정론')
const a = await run('1회차', { ...NEUTRAL, throttle: 1, steer: 0.5 }, 240)
const b = await run('2회차', { ...NEUTRAL, throttle: 1, steer: 0.5 }, 240)
const drift = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
check('같은 입력이면 같은 결과다', drift < 1e-9, `차이=${drift.toExponential(2)}m`)

// ── 결과 ────────────────────────────────────────────────
console.log('\n결과')
let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(32)} ${r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} 통과\n`)
process.exit(failed > 0 ? 1 : 0)
