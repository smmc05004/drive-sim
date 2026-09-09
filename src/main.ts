import { vehicleParams } from './config/vehicle-params.ts'
import { LaneChangeMonitor } from './driving/lane-change.ts'
import { DrivingControls } from './input/controls.ts'
import { Keyboard } from './input/keyboard.ts'
import { Mouse } from './input/mouse.ts'
import { createOpenLot, syncLotObjects } from './level/open-lot.ts'
import { createRoad, laneCenterX, ROAD } from './level/road.ts'
import {
  applyControls,
  createVehicle,
  forwardSpeed,
  syncTuningToWheels,
} from './physics/vehicle.ts'
import { createWorld, FIXED_DT } from './physics/world.ts'
import { ChassisView } from './render/chassis.ts'
import { CockpitView } from './render/cockpit.ts'
import { Mirrors } from './render/mirrors.ts'
import { createScene, type CameraMode } from './render/scene.ts'
import { Traffic } from './traffic/traffic.ts'
import { LessonView } from './ui/lesson.ts'
import { createTuningPanel } from './ui/tuning-panel.ts'
import { Telemetry } from './ui/telemetry.ts'
import { approach, SteeringWheel } from './vehicle/steering-wheel.ts'

/** 한 프레임에 몰아서 처리할 물리 스텝 수의 상한 (탭 전환 후 폭주 방지) */
const MAX_STEPS_PER_FRAME = 5

/** 어깨 너머로 볼 때 고개를 돌리는 각도 (rad) — 뒤쪽 대각선 */
const LOOK_ANGLE = 110 * (Math.PI / 180)
/** 고개를 돌리는 속도 (rad/s) */
const LOOK_RATE = 7

type LevelName = 'lot' | 'road'

const SPAWN = {
  lot: { x: 0, z: 0, speedKmh: 0 },
  // 도로는 2차선(가운데)에서 주행 속도로 시작한다.
  // 정지 상태로 놓으면 회피하지 않는 뒤차에 곧바로 추돌당한다.
  road: { x: laneCenterX(1), z: 0, speedKmh: 80 },
}

async function main() {
  const world = await createWorld()
  const vehicle = createVehicle(world)
  const steeringWheel = new SteeringWheel()

  const view = createScene(vehicleParams.driverSeat)
  createOpenLot(world, view.scene)
  createRoad(world, view.scene)
  const traffic = new Traffic(world, view.scene)

  const chassisView = new ChassisView(view.carRoot, vehicle)
  const cockpit = new CockpitView(view.carRoot)
  const mirrors = new Mirrors(view.carRoot)

  const keyboard = new Keyboard()
  const mouse = new Mouse(view.renderer.domElement)
  const controls = new DrivingControls()
  const monitor = new LaneChangeMonitor()

  const panel = createTuningPanel(() => syncTuningToWheels(vehicle))
  if (panel.loadSaved()) syncTuningToWheels(vehicle)

  const telemetry = new Telemetry(document.querySelector<HTMLElement>('#hud')!)
  const lesson = new LessonView(
    document.querySelector<HTMLElement>('#lesson')!,
    document.querySelector<HTMLElement>('#sig-left')!,
    document.querySelector<HTMLElement>('#sig-right')!,
  )
  document.querySelector<HTMLElement>('#boot')!.classList.add('hidden')

  let cameraMode: CameraMode = 'driver'
  // ?level=road 로 바로 도로에서 시작할 수 있다 (테스트·디버깅용)
  let level: LevelName =
    new URLSearchParams(location.search).get('level') === 'road' ? 'road' : 'lot'
  /** 현재 고개를 돌린 각도 (rad). + 가 왼쪽 */
  let lookYaw = 0

  applyCameraMode()
  goToLevel(level)

  let accumulator = 0
  let lastTime = performance.now()
  let elapsed = 0
  let fps = 60

  function applyCameraMode() {
    const inDriverSeat = cameraMode === 'driver'
    chassisView.setCameraMode(inDriverSeat)
    cockpit.setVisible(inDriverSeat)
    // 미러는 운전석에서만 의미가 있다. 씬을 3번 더 그리므로 그 외에는 끈다.
    mirrors.setVisible(inDriverSeat)
  }

  function goToLevel(next: LevelName) {
    level = next
    const spawn = SPAWN[next]
    vehicle.respawn(spawn.x, spawn.z, spawn.speedKmh / 3.6)
    steeringWheel.reset()
    controls.reset()
    monitor.reset()
    lesson.clear()
  }

  /**
   * 도로는 600m 주기로 정확히 반복되므로, 구간 끝에 닿으면 반대편으로
   * 옮겨도 눈에 보이지 않는다. 이걸 하지 않으면 차가 도로를 벗어나
   * 지면 밖으로 떨어진다.
   */
  function wrapPlayer() {
    const p = vehicle.body.translation()
    const half = ROAD.length / 2
    if (p.z <= half && p.z >= -half) return
    const shift = p.z > half ? -ROAD.length : ROAD.length
    // 속도와 자세는 유지된다
    vehicle.body.setTranslation({ x: p.x, y: p.y, z: p.z + shift }, true)
  }

  function frame(now: number) {
    requestAnimationFrame(frame)

    const frameDelta = Math.min((now - lastTime) / 1000, 0.25)
    lastTime = now
    elapsed += frameDelta
    fps += (1 / Math.max(frameDelta, 1e-6) - fps) * 0.1

    if (keyboard.wasPressed('KeyC')) {
      cameraMode = cameraMode === 'driver' ? 'chase' : 'driver'
      applyCameraMode()
    }
    if (keyboard.wasPressed('KeyR')) goToLevel(level)
    if (keyboard.wasPressed('Digit1')) goToLevel('lot')
    if (keyboard.wasPressed('Digit2')) goToLevel('road')

    // ── 고정 스텝 물리 ────────────────────────────────
    accumulator += frameDelta
    let steps = 0
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      const speed = forwardSpeed(vehicle)
      const state = controls.update(FIXED_DT, keyboard, mouse, steeringWheel, speed)
      steeringWheel.update(FIXED_DT, state.steering, speed)
      applyControls(vehicle, state, steeringWheel)
      vehicle.controller.updateVehicle(FIXED_DT)
      world.step()

      if (level === 'road') wrapPlayer()
      const position = vehicle.body.translation()

      if (level === 'road') {
        traffic.update(FIXED_DT, position.z)
        monitor.colliding = traffic.overlaps(
          position.x,
          position.z,
          vehicleParams.chassis.width / 2,
          vehicleParams.chassis.length / 2,
        )
        const result = monitor.update(
          FIXED_DT,
          position.x,
          position.z,
          speed,
          { signal: state.signal, looking: state.looking },
          traffic,
        )
        if (result) lesson.show(result)
      }

      accumulator -= FIXED_DT
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0

    // ── 고개 돌리기 ───────────────────────────────────
    // 실제로도 어깨 너머를 보는 동안에는 전방이 보이지 않는다.
    // 그 대가까지 재현되어야 사각지대 확인이 "공짜 동작"이 되지 않는다.
    const targetYaw =
      controls.state.looking === 'left'
        ? LOOK_ANGLE
        : controls.state.looking === 'right'
          ? -LOOK_ANGLE
          : 0
    lookYaw = approach(lookYaw, targetYaw, LOOK_RATE * frameDelta)
    view.driverCamera.rotation.set(0, Math.PI + lookYaw, 0)

    // ── 렌더 ──────────────────────────────────────────
    chassisView.sync()
    syncLotObjects()
    traffic.sync()
    cockpit.update(steeringWheel.angle, steeringWheel.atLock)
    view.updateShadowFocus()
    if (cameraMode === 'chase') view.updateChaseCamera()

    mirrors.renderTargets(view.renderer, view.scene, cockpit.root)
    view.renderer.render(view.scene, view.activeCamera(cameraMode))
    mirrors.composite(view.renderer)

    telemetry.update(
      vehicle,
      controls,
      steeringWheel,
      cameraMode,
      fps,
      level === 'road' ? { monitor, traffic } : undefined,
    )
    lesson.updateSignals(controls.state.signal, elapsed)
    keyboard.endFrame()
  }

  requestAnimationFrame(frame)
}

main().catch((error) => {
  console.error(error)
  const boot = document.querySelector<HTMLElement>('#boot')
  if (boot) boot.textContent = `초기화 실패: ${error}`
})
