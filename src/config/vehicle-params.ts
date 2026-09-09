/**
 * 차량 튜닝 수치 — 이 프로젝트의 모든 조작 관련 상수는 여기 모인다.
 *
 * 1단계에서 이 객체가 런타임 튜닝 패널(lil-gui)에 그대로 연결된다.
 * 따라서 값은 반드시 이 객체를 통해서만 읽어야 하고, 다른 모듈이
 * 값을 복사해 두면 안 된다. (슬라이더를 움직여도 반영되지 않는다)
 *
 * ── 좌표 규칙 (차체 로컬) ────────────────────────────────
 *   +Z = 전방   (Rapier 차량 컨트롤러의 기본 forward axis)
 *   +Y = 위
 *   +X = 오른쪽,  -X = 왼쪽  (한국은 좌핸들이므로 운전석은 -X)
 * ──────────────────────────────────────────────────────
 */

const DEG = Math.PI / 180

export const vehicleParams = {
  /**
   * 차체
   *
   * 치수는 지면을 기준으로 정의한다. 실차와 같은 방식이고,
   * 지상고를 빠뜨려 차체가 지면에 끌리는 실수를 막는다.
   */
  chassis: {
    /** m — 폭(X) × 높이(Y) × 길이(Z) */
    width: 1.8,
    height: 1.25,
    length: 4.4,
    /** 차체 밑면과 지면 사이 거리 (m). 전고 = groundClearance + height = 1.40m */
    groundClearance: 0.15,
    /** kg */
    mass: 1200,
    /**
     * 무게중심을 차체 박스 중심보다 이만큼 아래로 내린다 (m).
     * 내리지 않으면 조금만 꺾어도 전복한다.
     * 너무 내리면 롤이 사라져 부자연스러워진다.
     * (지면 기준 0.525m — 실제 승용차와 비슷한 값)
     */
    centerOfMassY: -0.25,
  },

  /** 바퀴 배치 — 인덱스 0=앞좌, 1=앞우, 2=뒤좌, 3=뒤우 */
  wheel: {
    radius: 0.33,
    /** 차체 중심에서 좌우 바퀴 중심까지 (m) */
    halfTrack: 0.8,
    /** 앞/뒤 차축의 Z 위치 (m). 축거 3.0m */
    frontZ: 1.5,
    rearZ: -1.5,
    /** 서스펜션 무부하 길이 (m) */
    suspensionRestLength: 0.3,
  },

  /** 서스펜션 — 전부 튜닝 대상 (Bullet btRaycastVehicle 계열 값 기준) */
  suspension: {
    /** 낮으면 물렁하게 출렁이고, 높으면 딱딱하고 튄다 */
    stiffness: 24,
    compression: 0.82,
    /** 낮으면 요철 통과 후 계속 출렁인다 */
    relaxation: 0.88,
    /** 최대 스트로크 (m) */
    maxTravel: 0.3,
    /** N */
    maxForce: 12000,
  },

  /** 타이어 */
  tire: {
    /** 낮추면 잘 미끄러진다 */
    frictionSlip: 10.5,
    /** 저속 떨림의 주범. 3단계에서 재조정 대상 */
    sideFrictionStiffness: 1.0,
  },

  /**
   * 구동 · 제동
   *
   * 0단계는 단순 상수. 1단계에서 속도별 엔진력 커브, 앞뒤 브레이크 배분,
   * 엔진 브레이크, 크립이 추가된다.
   */
  drive: {
    /** N — 구동륜 1개당. 1200kg / 0→100km/h 약 10초 기준 */
    maxEngineForce: 2000,
    /**
     * 바퀴 1개당 제동력.
     *
     * NOTE: 엔진력과 달리 이 값의 단위는 뉴턴이 아니다. 2400 을 주면
     *       감속도가 42 m/s² (실차의 5배) 가 나온다. 아래 값은 실측으로
     *       보정한 것으로, 약 8 m/s² — 실차 급제동 수준이다.
     *       검증: node tools/verify-physics.ts
     */
    maxBrakeForce: 40,
    /** 전진 최고 속도 (m/s). 엔진력 감쇠에 사용 */
    maxSpeed: 45,
  },

  /**
   * 조향 — 0단계 임시 구현.
   *
   * 1단계에서 핸들 각도(±450°) + 조향비 모델로 교체된다.
   * docs/steering-model.md 참조.
   */
  steering: {
    /** 앞바퀴 최대 조향각 */
    maxRoadWheelAngle: 33 * DEG,
    /** 조향 속도 (rad/s) — 핸들이 순간이동하지 않도록 */
    rate: 60 * DEG,
    /** 입력이 없을 때 중립으로 복귀하는 속도 (rad/s) */
    returnRate: 90 * DEG,
  },

  /** 운전석 시점 카메라 위치 (차체 로컬, m). 좌핸들 기준 */
  driverSeat: {
    x: -0.38,
    y: 0.42,
    z: 0.15,
  },
}

// as const 를 쓰지 않는다 — 1단계 튜닝 패널이 이 값들을 직접 수정한다.
export type VehicleParams = typeof vehicleParams

/**
 * 파라미터에서 유도되는 기하 값.
 *
 * 상수로 캐시하지 않고 매번 계산한다 — 1단계 튜닝 패널이 원본 값을
 * 실시간으로 바꾸기 때문이다.
 */
export function derivedGeometry() {
  const { chassis, wheel } = vehicleParams

  /** 무부하 상태에서 차체 박스 중심이 놓이는 지면 위 높이 (m) */
  const restingHeight = chassis.groundClearance + chassis.height / 2

  /**
   * 서스펜션이 차체에 붙는 지점의 로컬 Y (m).
   *
   * 무부하 상태에서 바퀴 중심이 지면 위 radius 만큼 오도록 역산한다.
   * 이 값을 직접 상수로 두면 지상고나 바퀴 반지름을 바꿨을 때
   * 차체가 지면에 끌리거나 공중에 뜬다.
   */
  const wheelConnectionY = wheel.radius + wheel.suspensionRestLength - restingHeight

  return { restingHeight, wheelConnectionY }
}
