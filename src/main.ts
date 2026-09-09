import { vehicleParams } from './config/vehicle-params.ts'
import { Keyboard } from './input/keyboard.ts'
import { KeyboardControls } from './input/controls.ts'
import { applyControls, createVehicle } from './physics/vehicle.ts'
import { createWorld, FIXED_DT } from './physics/world.ts'
import { ChassisView } from './render/chassis.ts'
import { createScene, type CameraMode } from './render/scene.ts'

/** 한 프레임에 몰아서 처리할 물리 스텝 수의 상한 (탭 전환 후 폭주 방지) */
const MAX_STEPS_PER_FRAME = 5

async function main() {
  const world = await createWorld()
  const vehicle = createVehicle(world)

  const view = createScene(vehicleParams.driverSeat)
  const chassisView = new ChassisView(view.carRoot, vehicle)

  const keyboard = new Keyboard()
  const controls = new KeyboardControls()

  let cameraMode: CameraMode = 'driver'

  const hud = document.querySelector<HTMLElement>('#hud')!
  document.querySelector<HTMLElement>('#boot')!.classList.add('hidden')

  let accumulator = 0
  let lastTime = performance.now()
  let fps = 0

  function frame(now: number) {
    requestAnimationFrame(frame)

    const frameDelta = Math.min((now - lastTime) / 1000, 0.25)
    lastTime = now
    fps += (1 / Math.max(frameDelta, 1e-6) - fps) * 0.1

    if (keyboard.wasPressed('KeyC')) {
      cameraMode = cameraMode === 'driver' ? 'chase' : 'driver'
    }
    if (keyboard.wasPressed('KeyR')) {
      vehicle.respawn()
    }

    // ── 고정 스텝 물리 ────────────────────────────────
    // 렌더 프레임과 분리한다. 프레임 기준으로 돌리면 조작감이
    // 모니터 주사율에 종속된다. (docs/stage-0-setup.md 참조)
    accumulator += frameDelta
    let steps = 0
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      const speed = vehicle.controller.currentVehicleSpeed()
      applyControls(vehicle, controls.update(FIXED_DT, keyboard, speed))
      vehicle.controller.updateVehicle(FIXED_DT)
      world.step()
      accumulator -= FIXED_DT
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0

    // ── 렌더 ──────────────────────────────────────────
    chassisView.sync()
    if (cameraMode === 'chase') view.updateChaseCamera()
    view.renderer.render(view.scene, view.activeCamera(cameraMode))

    updateHud(hud, vehicle, controls, cameraMode, fps)
    keyboard.endFrame()
  }

  requestAnimationFrame(frame)
}

/**
 * 0단계 최소 표시.
 *
 * 바퀴별 접지·슬립 등 본격적인 텔레메트리는 1단계에서 추가한다.
 * 튜닝은 "왜 이상한지"를 눈으로 봐야 가능하다. (docs/stage-1-open-lot.md)
 */
function updateHud(
  hud: HTMLElement,
  vehicle: ReturnType<typeof createVehicle>,
  controls: KeyboardControls,
  cameraMode: CameraMode,
  fps: number,
) {
  const speedKmh = Math.abs(vehicle.controller.currentVehicleSpeed()) * 3.6
  const steerDeg = controls.state.steer * vehicleParams.steering.maxRoadWheelAngle * (180 / Math.PI)

  let onGround = 0
  for (let i = 0; i < 4; i++) {
    if (vehicle.controller.wheelIsInContact(i)) onGround++
  }

  hud.innerHTML =
    `속도    <b>${speedKmh.toFixed(0).padStart(3)}</b> km/h\n` +
    `기어    <b>${controls.state.gear}</b>\n` +
    `앞바퀴  <b>${steerDeg.toFixed(0).padStart(3)}</b>°\n` +
    `접지    <b>${onGround}</b>/4\n` +
    `시점    <b>${cameraMode === 'driver' ? '운전석' : '3인칭'}</b>\n` +
    `fps     <b>${fps.toFixed(0)}</b>`
}

main().catch((error) => {
  console.error(error)
  const boot = document.querySelector<HTMLElement>('#boot')
  if (boot) boot.textContent = `초기화 실패: ${error}`
})
