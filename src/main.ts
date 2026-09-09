import { vehicleParams } from './config/vehicle-params.ts'
import { DrivingControls } from './input/controls.ts'
import { Keyboard } from './input/keyboard.ts'
import { Mouse } from './input/mouse.ts'
import { createOpenLot, syncLotObjects } from './level/open-lot.ts'
import {
  applyControls,
  createVehicle,
  forwardSpeed,
  syncTuningToWheels,
} from './physics/vehicle.ts'
import { createWorld, FIXED_DT } from './physics/world.ts'
import { ChassisView } from './render/chassis.ts'
import { CockpitView } from './render/cockpit.ts'
import { createScene, type CameraMode } from './render/scene.ts'
import { createTuningPanel } from './ui/tuning-panel.ts'
import { Telemetry } from './ui/telemetry.ts'
import { SteeringWheel } from './vehicle/steering-wheel.ts'

/** 한 프레임에 몰아서 처리할 물리 스텝 수의 상한 (탭 전환 후 폭주 방지) */
const MAX_STEPS_PER_FRAME = 5

async function main() {
  const world = await createWorld()
  const vehicle = createVehicle(world)
  const steeringWheel = new SteeringWheel()

  const view = createScene(vehicleParams.driverSeat)
  createOpenLot(world, view.scene)
  const chassisView = new ChassisView(view.carRoot, vehicle)
  const cockpit = new CockpitView(view.carRoot)

  const keyboard = new Keyboard()
  const mouse = new Mouse(view.renderer.domElement)
  const controls = new DrivingControls()

  const panel = createTuningPanel(() => syncTuningToWheels(vehicle))
  if (panel.loadSaved()) syncTuningToWheels(vehicle)

  const telemetry = new Telemetry(document.querySelector<HTMLElement>('#hud')!)
  document.querySelector<HTMLElement>('#boot')!.classList.add('hidden')

  let cameraMode: CameraMode = 'driver'
  applyCameraMode()

  let accumulator = 0
  let lastTime = performance.now()
  let fps = 60

  function applyCameraMode() {
    const inDriverSeat = cameraMode === 'driver'
    chassisView.setCameraMode(inDriverSeat)
    cockpit.setVisible(inDriverSeat)
  }

  function frame(now: number) {
    requestAnimationFrame(frame)

    const frameDelta = Math.min((now - lastTime) / 1000, 0.25)
    lastTime = now
    fps += (1 / Math.max(frameDelta, 1e-6) - fps) * 0.1

    if (keyboard.wasPressed('KeyC')) {
      cameraMode = cameraMode === 'driver' ? 'chase' : 'driver'
      applyCameraMode()
    }
    if (keyboard.wasPressed('KeyR')) {
      vehicle.respawn()
      steeringWheel.reset()
      controls.reset()
    }

    // ── 고정 스텝 물리 ────────────────────────────────
    // 렌더 프레임과 분리한다. 프레임 기준으로 돌리면 조작감이
    // 모니터 주사율에 종속된다. (docs/stage-0-setup.md)
    accumulator += frameDelta
    let steps = 0
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      const speed = forwardSpeed(vehicle)
      const state = controls.update(FIXED_DT, keyboard, mouse, steeringWheel, speed)
      steeringWheel.update(FIXED_DT, state.steering, speed)
      applyControls(vehicle, state, steeringWheel)
      vehicle.controller.updateVehicle(FIXED_DT)
      world.step()
      accumulator -= FIXED_DT
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0

    // ── 렌더 ──────────────────────────────────────────
    chassisView.sync()
    syncLotObjects()
    cockpit.update(steeringWheel.angle, steeringWheel.atLock)
    view.updateShadowFocus()
    if (cameraMode === 'chase') view.updateChaseCamera()
    view.renderer.render(view.scene, view.activeCamera(cameraMode))

    telemetry.update(vehicle, controls, steeringWheel, cameraMode, fps)
    keyboard.endFrame()
  }

  requestAnimationFrame(frame)
}

main().catch((error) => {
  console.error(error)
  const boot = document.querySelector<HTMLElement>('#boot')
  if (boot) boot.textContent = `초기화 실패: ${error}`
})
