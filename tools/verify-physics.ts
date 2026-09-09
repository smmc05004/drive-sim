/**
 * 물리·조작 모델 검증 — 브라우저 없이 실행한다.
 *
 *   npm run verify:physics
 *
 * 파라미터를 만진 뒤에는 이걸 먼저 돌린다. 튜닝 패널로 감각을 잡기 전에
 * "수치가 실차 범위 안에 있는가"를 기계적으로 걸러내는 것이 목적이다.
 */
import { vehicleParams } from '../src/config/vehicle-params.ts'
import type { ControlState, Gear } from '../src/input/controls.ts'
import { applyControls, createVehicle, forwardSpeed } from '../src/physics/vehicle.ts'
import { createWorld, FIXED_DT } from '../src/physics/world.ts'
import { SteeringWheel } from '../src/vehicle/steering-wheel.ts'

const DEG = Math.PI / 180
const KMH = 3.6

interface Scenario {
  throttle?: number
  brake?: number
  gear?: Gear
  /** 핸들 목표 각도 (rad). 실제 손 속도로 서서히 접근한다 */
  wheelTarget?: number
}

async function createRig() {
  const world = await createWorld()
  const vehicle = createVehicle(world)
  const wheel = new SteeringWheel()

  function step(scenario: Scenario) {
    const speed = forwardSpeed(vehicle)

    // 핸들을 목표 각도로 손 속도만큼만 돌린다 (순간이동 금지)
    const target = scenario.wheelTarget ?? 0
    const maxStep = wheel.handSpeed(speed) * FIXED_DT
    const delta = clamp(target - wheel.angle, -maxStep, maxStep)
    const steering = { delta, active: true }

    wheel.update(FIXED_DT, steering, speed)

    const controls: ControlState = {
      steering,
      throttle: scenario.throttle ?? 0,
      brake: scenario.brake ?? 0,
      gear: scenario.gear ?? 'D',
    }
    applyControls(vehicle, controls, wheel)
    vehicle.controller.updateVehicle(FIXED_DT)
    world.step()
  }

  function run(scenario: Scenario, steps: number) {
    for (let i = 0; i < steps; i++) step(scenario)
  }

  /**
   * 속도와 자세는 유지한 채 위치만 원점으로 되돌린다.
   * 장거리 주행 테스트가 지면(200m) 밖으로 나가 낙하하는 것을 막는다.
   */
  function recenter() {
    const t = vehicle.body.translation()
    vehicle.body.setTranslation({ x: 0, y: t.y, z: 0 }, true)
  }

  return { world, vehicle, wheel, step, run, recenter, measure: () => measure(vehicle) }
}

interface Sample {
  x: number
  y: number
  z: number
  speed: number
  yawRate: number
  /** 차체 위 방향의 Y 성분. 1이면 똑바로, 0이면 옆으로 누움 */
  uprightness: number
  wheelsOnGround: number
}

function measure(vehicle: ReturnType<typeof createVehicle>): Sample {
  const t = vehicle.body.translation()
  const r = vehicle.body.rotation()
  const w = vehicle.body.angvel()

  let wheelsOnGround = 0
  for (let i = 0; i < 4; i++) {
    if (vehicle.controller.wheelIsInContact(i)) wheelsOnGround++
  }

  return {
    x: t.x,
    y: t.y,
    z: t.z,
    speed: forwardSpeed(vehicle),
    yawRate: w.y,
    uprightness: 1 - 2 * (r.x * r.x + r.z * r.z),
    wheelsOnGround,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const results: { name: string; ok: boolean; detail: string }[] = []
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail })
}

console.log('\n운전 감각 검증\n')

// ── 1. 정적 자세 ────────────────────────────────────────
{
  const rig = await createRig()
  rig.run({ brake: 1 }, 120)
  const s = rig.measure()
  console.log(
    `1. 정적 자세          y=${s.y.toFixed(3)}m  접지 ${s.wheelsOnGround}/4  ` +
      `이동 ${Math.hypot(s.x, s.z).toFixed(3)}m`,
  )
  check('지면을 뚫지 않는다', s.y > 0.2, `y=${s.y.toFixed(3)}`)
  check('네 바퀴가 모두 접지한다', s.wheelsOnGround === 4, `${s.wheelsOnGround}/4`)
  check('똑바로 서 있다', s.uprightness > 0.99, `수직도=${s.uprightness.toFixed(4)}`)
  check('브레이크를 밟으면 제자리에 있다', Math.hypot(s.x, s.z) < 0.05, `${Math.hypot(s.x, s.z).toFixed(3)}m`)
  rig.world.free()
}

// ── 2. 전방 축 ──────────────────────────────────────────
{
  const rig = await createRig()
  rig.run({ throttle: 1 }, 180)
  const f = rig.measure()
  console.log(`2. 전방 축            z=${f.z.toFixed(2)}m  ${(f.speed * KMH).toFixed(0)} km/h`)
  check('전진하면 +Z 로 간다', f.z > 1, `z=${f.z.toFixed(2)}m`)
  check('전진 중 직진을 유지한다', Math.abs(f.x) < 0.5, `x 편차=${f.x.toFixed(3)}m`)
  rig.world.free()

  const back = await createRig()
  back.run({ throttle: 1, gear: 'R' }, 180)
  const b = back.measure()
  console.log(`   후진               z=${b.z.toFixed(2)}m  ${(-b.speed * KMH).toFixed(0)} km/h`)
  check('후진하면 -Z 로 간다', b.z < -1, `z=${b.z.toFixed(2)}m`)
  check('후진이 전진보다 느리다', Math.abs(b.speed) < f.speed, `${(-b.speed * KMH).toFixed(0)} km/h`)
  back.world.free()
}

// ── 3. 조향 방향 ────────────────────────────────────────
{
  const right = await createRig()
  right.run({ throttle: 1, wheelTarget: 450 * DEG }, 180)
  const r = right.measure()
  const left = await createRig()
  left.run({ throttle: 1, wheelTarget: -450 * DEG }, 180)
  const l = left.measure()
  // 전방이 +Z 이면 오른쪽은 -X 다 (right = forward × up)
  console.log(`3. 조향 방향          우 x=${r.x.toFixed(2)}m   좌 x=${l.x.toFixed(2)}m`)
  check('핸들 +450° 면 오른쪽(-X)으로 돈다', r.x < -1, `x=${r.x.toFixed(2)}m`)
  check('핸들 -450° 면 왼쪽(+X)으로 돈다', l.x > 1, `x=${l.x.toFixed(2)}m`)
  check('운전석이 왼쪽(+X)에 있다', vehicleParams.driverSeat.x > 0, `x=${vehicleParams.driverSeat.x}`)
  check('선회 중 전복하지 않는다', r.uprightness > 0.9 && l.uprightness > 0.9,
    `수직도=${Math.min(r.uprightness, l.uprightness).toFixed(3)}`)
  right.world.free()
  left.world.free()
}

// ── 4. 조향비 모델 (물리 없이) ──────────────────────────
{
  const wheel = new SteeringWheel()
  wheel.angle = vehicleParams.steeringWheel.maxAngle
  const lowRatio = wheel.ratio(0)
  const highRatio = wheel.ratio(100 / KMH)
  const lowAngle = wheel.roadWheelAngle(0) / DEG
  const highAngle = wheel.roadWheelAngle(100 / KMH) / DEG
  console.log(
    `4. 조향비             저속 ${lowRatio.toFixed(0)}:1 → 앞바퀴 ${lowAngle.toFixed(0)}°   ` +
      `100km/h ${highRatio.toFixed(0)}:1 → ${highAngle.toFixed(0)}°`,
  )
  check('핸들 회전수가 락투락 2.5바퀴다', Math.abs(wheel.turns - 1.25) < 0.01, `${wheel.turns.toFixed(2)}바퀴`)
  check('저속 풀락에서 앞바퀴가 30° 이상 꺾인다', lowAngle > 30, `${lowAngle.toFixed(1)}°`)
  check('고속에서는 같은 핸들 각도가 덜 꺾인다', highAngle < lowAngle / 2, `${highAngle.toFixed(1)}°`)
  check('핸들은 락을 넘지 않는다', wheel.angle <= vehicleParams.steeringWheel.maxAngle + 1e-9, 'clamp 동작')
}

// ── 5. 최소 회전 반경 ───────────────────────────────────
// 저속 풀락으로 선회시키고 R = v / ω 로 구한다.
{
  const rig = await createRig()
  const scenario = { throttle: 0.25, wheelTarget: 450 * DEG }
  rig.run(scenario, 300)
  rig.recenter()

  let radiusSum = 0
  let samples = 0
  for (let i = 0; i < 120; i++) {
    rig.step(scenario)
    const s = rig.measure()
    if (Math.abs(s.yawRate) > 1e-3) {
      radiusSum += Math.abs(s.speed / s.yawRate)
      samples++
    }
  }
  const radius = radiusSum / Math.max(samples, 1)
  const speed = rig.measure().speed * KMH
  console.log(`5. 최소 회전 반경     ${radius.toFixed(2)}m  (${speed.toFixed(0)} km/h 선회 중)`)
  // 실제 승용차의 최소 회전 반경은 5~6m (바깥 앞바퀴 기준).
  // 여기서는 무게중심 기준이라 조금 작게 나오는 것이 정상이다.
  check('회전 반경이 실차 범위다 (4~7m)', radius > 4 && radius < 7, `${radius.toFixed(2)}m`)
  rig.world.free()
}

// ── 6. 저속 풀조향 떨림 ─────────────────────────────────
// 3~4단계(좁은 램프·주차)의 전제 조건. 여기서 떨리면 그 단계로 갈 수 없다.
{
  const rig = await createRig()
  const scenario = { throttle: 0.15, wheelTarget: 450 * DEG }
  rig.run(scenario, 300)

  const yawRates: number[] = []
  for (let i = 0; i < 180; i++) {
    rig.step(scenario)
    yawRates.push(rig.measure().yawRate)
  }
  const mean = yawRates.reduce((a, b) => a + b, 0) / yawRates.length
  const variance = yawRates.reduce((a, b) => a + (b - mean) ** 2, 0) / yawRates.length
  const jitter = Math.sqrt(variance) / Math.max(Math.abs(mean), 1e-6)
  console.log(
    `6. 저속 떨림          요레이트 ${mean.toFixed(3)} rad/s, 흔들림 ${(jitter * 100).toFixed(1)}%`,
  )
  check('저속 풀조향이 안정적이다 (흔들림 10% 미만)', jitter < 0.1, `${(jitter * 100).toFixed(1)}%`)
  rig.world.free()
}

// ── 7. 크립 ─────────────────────────────────────────────
// 4단계 주차에서는 액셀을 거의 밟지 않고 크립으로만 움직인다.
{
  const rig = await createRig()
  rig.run({}, 600)
  const s = rig.measure()
  const creepKmh = s.speed * KMH
  console.log(`7. 크립               ${creepKmh.toFixed(1)} km/h 로 안정`)
  check('크립으로 스스로 굴러간다', creepKmh > 3, `${creepKmh.toFixed(1)} km/h`)
  check('크립 속도가 실차 범위다 (5~11 km/h)', creepKmh > 5 && creepKmh < 11, `${creepKmh.toFixed(1)} km/h`)
  rig.world.free()
}

// ── 8. 제동 ─────────────────────────────────────────────
{
  const rig = await createRig()
  while (rig.measure().speed < 16.7) rig.step({ throttle: 1 }) // 60km/h 까지
  rig.recenter()
  const v0 = rig.measure().speed

  let steps = 0
  while (rig.measure().speed > 0.1 && steps < 3000) {
    rig.step({ brake: 1 })
    steps++
  }
  const stopTime = steps * FIXED_DT
  const deceleration = v0 / stopTime
  console.log(
    `8. 제동               ${(v0 * KMH).toFixed(0)} km/h → 정지 ${stopTime.toFixed(2)}초 ` +
      `(감속 ${deceleration.toFixed(1)} m/s²)`,
  )
  check('브레이크로 정지한다', rig.measure().speed <= 0.1, `${steps} 스텝`)
  // 실차 급제동은 8~9 m/s² 수준
  check('감속도가 실차 범위다 (6~11 m/s²)', deceleration > 6 && deceleration < 11,
    `${deceleration.toFixed(1)} m/s²`)
  rig.world.free()
}

// ── 9. 엔진 브레이크 ────────────────────────────────────
{
  const rig = await createRig()
  while (rig.measure().speed < 16.7) rig.step({ throttle: 1 })
  rig.recenter()
  const v0 = rig.measure().speed
  rig.run({}, 180) // 3초 타행
  const v1 = rig.measure().speed
  const decel = (v0 - v1) / 3
  console.log(`9. 엔진 브레이크      3초 타행에 ${(v0 * KMH).toFixed(0)} → ${(v1 * KMH).toFixed(0)} km/h`)
  check('액셀을 떼면 감속한다', v1 < v0, `${decel.toFixed(2)} m/s²`)
  check('타행 감속이 과하지 않다 (2 m/s² 미만)', decel < 2, `${decel.toFixed(2)} m/s²`)
  rig.world.free()
}

// ── 10. 결정론 ──────────────────────────────────────────
{
  const a = await createRig()
  a.run({ throttle: 1, wheelTarget: 200 * DEG }, 240)
  const sa = a.measure()
  const b = await createRig()
  b.run({ throttle: 1, wheelTarget: 200 * DEG }, 240)
  const sb = b.measure()
  const drift = Math.hypot(sa.x - sb.x, sa.y - sb.y, sa.z - sb.z)
  console.log(`10. 고정 스텝 결정론  차이 ${drift.toExponential(1)}m`)
  check('같은 입력이면 같은 결과다', drift < 1e-9, `차이=${drift.toExponential(2)}m`)
  a.world.free()
  b.world.free()
}

// ── 결과 ────────────────────────────────────────────────
console.log('\n결과')
let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(38)} ${r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} 통과\n`)
process.exit(failed > 0 ? 1 : 0)
