import RAPIER from '@dimforge/rapier3d-compat'

/**
 * 물리 고정 스텝.
 *
 * 렌더 프레임과 분리해서 이 간격으로만 물리를 전진시킨다.
 * 프레임 기준으로 돌리면 120Hz 모니터에서 조향이 두 배 빨라지는 등
 * 조작감이 주사율에 종속된다. 나중에 고치기 어려운 종류의 버그다.
 */
export const FIXED_DT = 1 / 60

/** 공터 한 변의 길이 (m) */
export const GROUND_SIZE = 200

let initialized = false

export async function createWorld(): Promise<RAPIER.World> {
  if (!initialized) {
    await RAPIER.init()
    initialized = true
  }

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = FIXED_DT

  // 지면 — 윗면이 y=0 에 오도록 아래로 내린 두꺼운 박스
  const half = GROUND_SIZE / 2
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half, 0.5, half).setTranslation(0, -0.5, 0),
    groundBody,
  )

  return world
}
