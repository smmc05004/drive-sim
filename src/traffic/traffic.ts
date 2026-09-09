import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { laneCenterX, ROAD } from '../level/road.ts'

/**
 * 주변 차량.
 *
 * **AI를 만들지 않는다.** 지정된 차선에서 지정된 속도로 직진만 한다.
 * 충돌 회피 로직도 없다 — 사용자가 잘못 끼어들면 실제로 부딪힌다.
 * 그래야 학습이 된다.
 *
 * docs/stage-2-lane-change.md
 */

const CAR = {
  width: 1.8,
  height: 1.45,
  length: 4.4,
}

const BODY_COLORS = [0x8a9299, 0x6b7f96, 0x9a8f84, 0x7d8a7f, 0x94868f, 0x7a8894]

export interface NpcCar {
  body: RAPIER.RigidBody
  group: THREE.Group
  lane: number
  /** m/s */
  speed: number
  z: number
}

/**
 * 순환 도로 위에서 두 지점 사이의 부호 있는 거리.
 * + 면 to 가 from 보다 앞(진행 방향)에 있다.
 */
export function signedGap(from: number, to: number): number {
  let d = to - from
  const half = ROAD.length / 2
  while (d > half) d -= ROAD.length
  while (d < -half) d += ROAD.length
  return d
}

export class Traffic {
  readonly cars: NpcCar[] = []

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    // 차선별로 속도를 다르게 둔다. 그래야 "나보다 빠른 차",
    // "나보다 느린 차" 상황이 저절로 만들어진다.
    const plan: { lane: number; speedKmh: number; z: number }[] = [
      { lane: 0, speedKmh: 100, z: -120 },
      { lane: 0, speedKmh: 95, z: 40 },
      { lane: 0, speedKmh: 105, z: 190 },
      { lane: 1, speedKmh: 80, z: -240 },
      { lane: 1, speedKmh: 85, z: -60 },
      { lane: 1, speedKmh: 78, z: 90 },
      { lane: 1, speedKmh: 88, z: 230 },
      { lane: 2, speedKmh: 62, z: -180 },
      { lane: 2, speedKmh: 58, z: -20 },
      { lane: 2, speedKmh: 65, z: 130 },
      { lane: 2, speedKmh: 60, z: 270 },
    ]

    plan.forEach((entry, index) => {
      this.cars.push(spawn(world, scene, entry, index))
    })
  }

  /**
   * @param dt 고정 물리 스텝
   * @param playerZ 플레이어의 z — 주변에 차가 유지되도록 순환시킨다
   */
  update(dt: number, playerZ: number): void {
    for (const car of this.cars) {
      car.z += car.speed * dt

      // 플레이어 기준 ±(길이/2) 안에 머물게 한다.
      // 도로 자체가 600m 주기로 정확히 반복되므로 순간이동이 보이지 않는다.
      const gap = signedGap(playerZ, car.z)
      car.z = playerZ + gap

      car.body.setNextKinematicTranslation({
        x: laneCenterX(car.lane),
        y: CAR.height / 2,
        z: car.z,
      })
    }
  }

  /** 물리 위치를 시각에 반영한다 */
  sync(): void {
    for (const car of this.cars) {
      const t = car.body.translation()
      car.group.position.set(t.x, t.y, t.z)
    }
  }

  /**
   * 특정 차선에서 주어진 지점 **뒤**에 있는 가장 가까운 차.
   * 차선 변경 판정의 핵심 입력이다.
   */
  nearestBehind(lane: number, z: number): { car: NpcCar; gap: number } | null {
    let best: { car: NpcCar; gap: number } | null = null
    for (const car of this.cars) {
      if (car.lane !== lane) continue
      const gap = -signedGap(z, car.z) // + 면 뒤에 있다
      if (gap <= 0) continue
      if (!best || gap < best.gap) best = { car, gap }
    }
    return best
  }

  /** 특정 차선에서 주어진 지점 **앞**에 있는 가장 가까운 차 */
  nearestAhead(lane: number, z: number): { car: NpcCar; gap: number } | null {
    let best: { car: NpcCar; gap: number } | null = null
    for (const car of this.cars) {
      if (car.lane !== lane) continue
      const gap = signedGap(z, car.z)
      if (gap <= 0) continue
      if (!best || gap < best.gap) best = { car, gap }
    }
    return best
  }

  /** 플레이어 차체와 겹치는 차가 있는가 (충돌 판정) */
  overlaps(x: number, z: number, halfWidth: number, halfLength: number): boolean {
    for (const car of this.cars) {
      const dx = Math.abs(x - laneCenterX(car.lane))
      const dz = Math.abs(signedGap(z, car.z))
      if (dx < halfWidth + CAR.width / 2 && dz < halfLength + CAR.length / 2) return true
    }
    return false
  }
}

function spawn(
  world: RAPIER.World,
  scene: THREE.Scene,
  entry: { lane: number; speedKmh: number; z: number },
  index: number,
): NpcCar {
  const x = laneCenterX(entry.lane)

  // 위치 기반 키네마틱 — 우리가 위치를 직접 정하고, 플레이어와는 충돌한다.
  // 등속 직진만 하므로 물리 시뮬레이션이 필요 없다.
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, CAR.height / 2, entry.z),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(CAR.width / 2, CAR.height / 2, CAR.length / 2),
    body,
  )

  const group = new THREE.Group()

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(CAR.width, CAR.height, CAR.length),
    new THREE.MeshLambertMaterial({ color: BODY_COLORS[index % BODY_COLORS.length] }),
  )
  shell.castShadow = true
  group.add(shell)

  // 후미등 — 미러 속에서 차를 식별하고 거리를 가늠하는 1차 단서다.
  // 어두운 배경에서 형태보다 먼저 눈에 들어온다.
  const lightGeometry = new THREE.BoxGeometry(0.32, 0.12, 0.06)
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  for (const side of [1, -1]) {
    const light = new THREE.Mesh(lightGeometry, lightMaterial)
    light.position.set(side * (CAR.width / 2 - 0.28), 0.1, -CAR.length / 2 - 0.02)
    group.add(light)
  }

  scene.add(group)

  return { body, group, lane: entry.lane, speed: entry.speedKmh / 3.6, z: entry.z }
}
