import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { ROAD_X } from '../physics/world.ts'

/**
 * 2단계 직선 도로.
 *
 * 곡선도 교차로도 없다. 이 레슨에서 익히는 것은 조향 정밀도가 아니라
 * **판단과 타이밍**이기 때문이다 — 사이드미러에 뒤차가 어느 크기·위치로
 * 보일 때 들어가도 되는가.
 *
 * docs/stage-2-lane-change.md
 */

/** 실제 치수 — 임의로 바꾸면 여기서 익힌 감각이 실차에서 안 맞는다 */
export const ROAD = {
  /** 차선 폭 (m) — 국내 고속도로 기준 */
  laneWidth: 3.5,
  laneCount: 3,
  /** 순환 구간 길이 (m). 끝에 닿으면 반대편으로 되돌린다 */
  length: 600,
  /** 갓길 폭 (m) */
  shoulderWidth: 2.5,
}

const COLORS = {
  asphalt: 0x2a2e33,
  shoulder: 0x33383e,
  paint: 0xd6dce2,
  guardrail: 0x6a737c,
  post: 0x4b5259,
}

/**
 * 차선 번호는 국내 표기를 따른다 — **1차선이 가장 왼쪽(추월 차선)**.
 * 좌표 규칙상 왼쪽이 +X 이므로 1차선의 X 가 가장 크다.
 */
export function laneCenterX(lane: number): number {
  const offset = ((ROAD.laneCount - 1) / 2 - lane) * ROAD.laneWidth
  return ROAD_X + offset
}

/** 주어진 X 좌표가 몇 차선인가 (0-based). 도로 밖이면 null */
export function laneAt(x: number): number | null {
  const halfRoad = (ROAD.laneCount * ROAD.laneWidth) / 2
  const fromLeftEdge = ROAD_X + halfRoad - x
  if (fromLeftEdge < 0 || fromLeftEdge > ROAD.laneCount * ROAD.laneWidth) return null
  return Math.min(ROAD.laneCount - 1, Math.floor(fromLeftEdge / ROAD.laneWidth))
}

/** 순환 — 구간 끝에 닿으면 반대편으로 되돌린다 */
export function wrapZ(z: number): number {
  const half = ROAD.length / 2
  if (z > half) return z - ROAD.length
  if (z < -half) return z + ROAD.length
  return z
}

export function createRoad(world: RAPIER.World, scene: THREE.Scene): void {
  const roadWidth = ROAD.laneCount * ROAD.laneWidth
  const half = ROAD.length / 2

  // ── 노면 ──────────────────────────────────────────────
  addSurface(scene, ROAD_X, roadWidth, COLORS.asphalt, 0.04)
  for (const side of [1, -1]) {
    addSurface(
      scene,
      ROAD_X + side * (roadWidth / 2 + ROAD.shoulderWidth / 2),
      ROAD.shoulderWidth,
      COLORS.shoulder,
      0.035,
    )
  }

  // ── 차선 도색 ─────────────────────────────────────────
  // 규칙적인 패턴이 속도·거리 판단의 핵심 단서다. 점선 간격을 실제와
  // 맞추면 "점선 몇 개 = 몇 미터" 로 차간거리를 셀 수 있다.
  const paint = new THREE.MeshBasicMaterial({ color: COLORS.paint })

  // 바깥 실선
  for (const side of [1, -1]) {
    addStripe(scene, paint, ROAD_X + side * (roadWidth / 2), -half, ROAD.length, 0.15)
  }
  // 차선 구분 점선 — 국내 규격: 선 3m, 간격 5m
  for (let lane = 1; lane < ROAD.laneCount; lane++) {
    const x = ROAD_X + roadWidth / 2 - lane * ROAD.laneWidth
    for (let z = -half; z < half; z += 8) {
      addStripe(scene, paint, x, z, 3, 0.15)
    }
  }

  // ── 가드레일 ──────────────────────────────────────────
  // 도로 밖으로 나가지 못하게 물리적으로도 막는다
  const railHeight = 0.75
  const railMaterial = new THREE.MeshLambertMaterial({ color: COLORS.guardrail })
  const postMaterial = new THREE.MeshLambertMaterial({ color: COLORS.post })

  for (const side of [1, -1]) {
    const x = ROAD_X + side * (roadWidth / 2 + ROAD.shoulderWidth)

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, railHeight / 2, 0),
    )
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, railHeight / 2, ROAD.length / 2), body)

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.35, ROAD.length),
      railMaterial,
    )
    rail.position.set(x, railHeight - 0.175, 0)
    rail.receiveShadow = true
    scene.add(rail)

    // 지주 — 규칙적인 간격이 속도감을 만든다
    const postGeometry = new THREE.BoxGeometry(0.12, railHeight, 0.12)
    for (let z = -half; z < half; z += 4) {
      const post = new THREE.Mesh(postGeometry, postMaterial)
      post.position.set(x, railHeight / 2, z)
      scene.add(post)
    }
  }
}

function addSurface(
  scene: THREE.Scene,
  x: number,
  width: number,
  color: number,
  y: number,
): void {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, ROAD.length),
    new THREE.MeshLambertMaterial({ color }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, y, 0)
  mesh.receiveShadow = true
  scene.add(mesh)
}

/** z 에서 시작해 length 만큼 뻗는 도색 */
function addStripe(
  scene: THREE.Scene,
  material: THREE.Material,
  x: number,
  z: number,
  length: number,
  width: number,
): void {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, 0.05, z + length / 2)
  scene.add(mesh)
}
