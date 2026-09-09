import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { LOT_SIZE } from '../physics/world.ts'

/**
 * 1단계 공터.
 *
 * 시나리오도 목표도 없다. 대신 **거리와 크기를 읽을 수 있어야 한다.**
 * 평평하고 텍스처 없는 면은 깊이감을 죽이므로, 아래 요소들이 전부
 * 깊이 단서로서 존재한다. 예쁘게 만드는 것이 목적이 아니다.
 *
 * 깊이 단서 우선순위: 바닥 격자 > 그림자 > 원거리 페이드 > 참조물 > 모서리 강조
 * (docs/stage-1-open-lot.md)
 */

/** 실제 치수 — 임의로 바꾸면 차폭 감각 학습이 무의미해진다 */
const REAL = {
  /** 라바콘 높이 (m) */
  coneHeight: 0.7,
  coneRadius: 0.2,
  /** 일반 주차 구획 (m) */
  bayWidth: 2.5,
  bayLength: 5.0,
  /** 차선 도색 폭 (m) */
  paintWidth: 0.15,
}

const COLORS = {
  wall: 0x3a4149,
  wallStripe: 0xd8dee4,
  pillar: 0x4a525b,
  coneBody: 0xe8622a,
  coneBand: 0xf2f4f6,
  paint: 0xc8cfd6,
}

export function createOpenLot(world: RAPIER.World, scene: THREE.Scene): void {
  buildBoundaryWalls(world, scene)
  buildPillars(world, scene)
  buildCones(world, scene)
  buildParkingBays(scene)
  buildDistanceMarkers(scene)
}

/**
 * 경계벽 — 공터의 끝을 명확히 하고, 차가 지면 밖으로 나가지 않게 한다.
 * 물리적으로도 막는다.
 */
function buildBoundaryWalls(world: RAPIER.World, scene: THREE.Scene): void {
  const half = LOT_SIZE / 2
  const height = 2.5
  const thickness = 0.5

  const wallMaterial = new THREE.MeshLambertMaterial({ color: COLORS.wall })

  const sides = [
    { x: 0, z: half, w: LOT_SIZE, d: thickness },
    { x: 0, z: -half, w: LOT_SIZE, d: thickness },
    { x: half, z: 0, w: thickness, d: LOT_SIZE },
    { x: -half, z: 0, w: thickness, d: LOT_SIZE },
  ]

  for (const side of sides) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(side.x, height / 2, side.z),
    )
    world.createCollider(RAPIER.ColliderDesc.cuboid(side.w / 2, height / 2, side.d / 2), body)

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(side.w, height, side.d), wallMaterial)
    mesh.position.set(side.x, height / 2, side.z)
    mesh.receiveShadow = true
    scene.add(mesh)
  }
}

/**
 * 기둥 — 모서리에 밝은 줄무늬를 넣는다.
 * 좁은 곳에서 여유 폭을 가늠하는 3단계의 예행 연습이다.
 */
function buildPillars(world: RAPIER.World, scene: THREE.Scene): void {
  const size = 0.5
  const height = 3.5
  const positions = [
    { x: 12, z: 20 },
    { x: -12, z: 20 },
    { x: 18, z: 34 },
    { x: -18, z: 34 },
    { x: 0, z: 48 },
  ]

  const bodyMaterial = new THREE.MeshLambertMaterial({ color: COLORS.pillar })
  const stripeMaterial = new THREE.MeshLambertMaterial({ color: COLORS.wallStripe })
  const geometry = new THREE.BoxGeometry(size, height, size)
  const stripeGeometry = new THREE.BoxGeometry(size + 0.02, 0.2, size + 0.02)

  for (const p of positions) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, height / 2, p.z),
    )
    world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, height / 2, size / 2), body)

    const mesh = new THREE.Mesh(geometry, bodyMaterial)
    mesh.position.set(p.x, height / 2, p.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    // 눈높이 부근에 줄무늬 — 거리 판단의 기준선
    for (const y of [0.6, 1.2, 1.8]) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial)
      stripe.position.set(p.x, y, p.z)
      scene.add(stripe)
    }
  }
}

/**
 * 라바콘 — 크기를 아는 물체가 있어야 거리 추정이 된다.
 *
 * 동적 강체로 둔다. 치면 넘어지는 것이 곧 "긁혔다"는 피드백이고,
 * 차폭 감각을 확인하는 가장 직접적인 방법이다.
 */
function buildCones(world: RAPIER.World, scene: THREE.Scene): void {
  const { coneHeight, coneRadius } = REAL

  const bodyGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 12)
  const bandGeometry = new THREE.CylinderGeometry(coneRadius * 0.62, coneRadius * 0.72, 0.1, 12)
  const baseGeometry = new THREE.BoxGeometry(coneRadius * 2.2, 0.04, coneRadius * 2.2)
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: COLORS.coneBody })
  const bandMaterial = new THREE.MeshLambertMaterial({ color: COLORS.coneBand })

  const positions: { x: number; z: number }[] = []

  // 5m 간격 직선 — 속도·거리 감각의 기준자
  for (let i = 1; i <= 10; i++) positions.push({ x: 8, z: i * 5 })

  // 슬라럼 — 차폭과 회전 반경을 확인하는 구간
  for (let i = 0; i < 6; i++) positions.push({ x: -8 + (i % 2 === 0 ? -1.6 : 1.6), z: 10 + i * 8 })

  for (const p of positions) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, coneHeight / 2, p.z),
    )
    world.createCollider(
      RAPIER.ColliderDesc.cone(coneHeight / 2, coneRadius).setMass(3).setFriction(0.8),
      body,
    )

    const group = new THREE.Group()
    const cone = new THREE.Mesh(bodyGeometry, bodyMaterial)
    cone.castShadow = true
    group.add(cone)

    const band = new THREE.Mesh(bandGeometry, bandMaterial)
    band.position.y = coneHeight * 0.12
    group.add(band)

    const base = new THREE.Mesh(baseGeometry, bodyMaterial)
    base.position.y = -coneHeight / 2 + 0.02
    base.castShadow = true
    group.add(base)

    group.position.set(p.x, coneHeight / 2, p.z)
    scene.add(group)

    coneViews.push({ body, group })
  }
}

/** 넘어진 라바콘을 따라가기 위한 목록 */
const coneViews: { body: RAPIER.RigidBody; group: THREE.Group }[] = []

/** 라바콘 위치를 물리에서 시각으로 반영한다. 매 프레임 호출. */
export function syncLotObjects(): void {
  for (const { body, group } of coneViews) {
    const t = body.translation()
    const r = body.rotation()
    group.position.set(t.x, t.y, t.z)
    group.quaternion.set(r.x, r.y, r.z, r.w)
  }
}

/**
 * 주차 구획 도색 — 실제 치수(2.5 × 5.0m).
 *
 * 차를 세워보면 좌우 여유가 35cm 씩밖에 없다는 것이 눈으로 확인된다.
 * 4단계에서 왜 어려운지가 여기서 미리 드러난다.
 */
function buildParkingBays(scene: THREE.Scene): void {
  const { bayWidth, bayLength, paintWidth } = REAL
  const material = new THREE.MeshBasicMaterial({ color: COLORS.paint })

  const origin = { x: -24, z: 12 }

  for (let i = 0; i <= 6; i++) {
    // 구획을 나누는 세로선
    addPaint(
      scene,
      material,
      origin.x + i * bayWidth,
      origin.z + bayLength / 2,
      paintWidth,
      bayLength,
    )
  }
  // 안쪽 가로선
  addPaint(
    scene,
    material,
    origin.x + (6 * bayWidth) / 2,
    origin.z + bayLength,
    6 * bayWidth,
    paintWidth,
  )
}

/** 10m 간격 거리 표시 — 정지 거리 감각을 익히는 기준 */
function buildDistanceMarkers(scene: THREE.Scene): void {
  const material = new THREE.MeshBasicMaterial({ color: COLORS.paint })
  for (let d = 10; d <= 80; d += 10) {
    addPaint(scene, material, 0, d, 0.6, 0.2)
  }
}

function addPaint(
  scene: THREE.Scene,
  material: THREE.Material,
  x: number,
  z: number,
  width: number,
  length: number,
): void {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, 0.03, z)
  scene.add(mesh)
}
