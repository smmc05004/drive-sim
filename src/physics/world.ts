import RAPIER from '@dimforge/rapier3d-compat'

/**
 * 물리 고정 스텝.
 *
 * 렌더 프레임과 분리해서 이 간격으로만 물리를 전진시킨다.
 * 프레임 기준으로 돌리면 120Hz 모니터에서 조향이 두 배 빨라지는 등
 * 조작감이 주사율에 종속된다. 나중에 고치기 어려운 종류의 버그다.
 */
export const FIXED_DT = 1 / 60

/**
 * 지면 한 변의 길이 (m).
 *
 * 1단계 공터와 2단계 도로를 같은 월드 안에 멀리 떨어뜨려 둔다.
 * 레벨을 바꿀 때 월드를 다시 만들지 않고 차를 순간이동시키면 되므로
 * 두 레벨을 즉시 오가며 비교할 수 있다. 안개가 서로를 가려준다.
 */
export const GROUND_SIZE = 800

/** 1단계 공터 한 변의 길이 (m) */
export const LOT_SIZE = 200

/** 2단계 도로의 중심 X 좌표 — 공터에서 충분히 떨어뜨린다 */
export const ROAD_X = 300

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
