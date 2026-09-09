/**
 * 차량 튜닝 수치 — 이 프로젝트의 모든 조작 관련 상수는 여기 모인다.
 *
 * 튜닝 패널(lil-gui)이 이 객체를 **직접 수정**한다. 따라서 값은 반드시
 * 이 객체를 통해서만 읽어야 하고, 다른 모듈이 값을 복사해 두면 안 된다.
 * (슬라이더를 움직여도 반영되지 않는다)
 *
 * ── 좌표 규칙 (차체 로컬) ────────────────────────────────
 *   +Z = 전방   (Rapier 차량 컨트롤러의 기본 forward axis)
 *   +Y = 위
 *   +X = 왼쪽,  -X = 오른쪽
 *
 *   오른쪽이 -X 인 것이 헷갈리지만 이게 맞다. 오른손 좌표계에서
 *   right = forward × up 이고, forward=+Z / up=+Y 이면 right=-X 가 된다.
 *   (검증: node tools/verify-physics.ts 의 "조향 방향" 항목)
 *
 *   한국은 좌핸들이므로 운전석은 +X 쪽이다.
 * ──────────────────────────────────────────────────────
 */

const DEG = Math.PI / 180
const KMH = 1 / 3.6

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

  /** 구동 */
  drive: {
    /** N — 구동륜 1개당. 1200kg / 0→100km/h 약 10초 기준 */
    maxEngineForce: 2000,
    /**
     * 전진 최고 속도 (m/s).
     * 엔진력을 속도에 따라 줄이는 데 쓴다. 이게 없으면 최고 속도가
     * 무한히 올라간다. 정교한 토크 커브·변속기는 이 게임에 필요 없다.
     */
    maxSpeed: 45,
    /** 후진 최고 속도 (m/s) — 실차도 후진은 훨씬 느리다 */
    maxReverseSpeed: 8,
    /**
     * 크립 — 오토 차량이 브레이크만 떼도 스르륵 굴러가는 힘.
     *
     * 지금은 사소해 보이지만 4단계 주차에서는 조작의 절반이 크립이다.
     * 좁은 주차장에서는 액셀을 거의 안 밟고 크립과 브레이크로만 움직인다.
     */
    creepForce: 600,
    /** 크립만으로 도달하는 속도 (m/s). 실차는 7~10km/h 에서 안정 */
    creepSpeed: 8 * KMH,
  },

  /** 제동 */
  brake: {
    /**
     * 바퀴 1개당 제동력.
     *
     * NOTE: 엔진력과 달리 이 값의 단위는 뉴턴이 아니다. 2400 을 주면
     *       감속도가 42 m/s² (실차의 5배) 가 나온다. 아래 값은 실측으로
     *       보정한 것으로, 약 8 m/s² — 실차 급제동 수준이다.
     *       검증: node tools/verify-physics.ts
     */
    maxForce: 40,
    /**
     * 앞바퀴 제동 배분 (0~1). 실차와 같이 앞이 강하다.
     * 급제동 시 앞으로 쏠리는 노즈다이브가 살아난다.
     */
    frontBias: 0.65,
    /**
     * 엔진 브레이크 — 액셀을 뗐을 때 상시 걸리는 제동력.
     * 없으면 차가 안 서고 계속 미끄러지는 느낌이 난다.
     */
    engineBrake: 2.0,
  },

  /**
   * 핸들 — 이 프로젝트의 중심 모델.
   *
   * 핸들 각도와 앞바퀴 각도를 분리하고 조향비로 연결한다.
   * 이게 있어야 "한 바퀴 반 감았다"를 가르치고 채점할 수 있다.
   * 자세한 근거: docs/steering-model.md
   */
  steeringWheel: {
    /** 한쪽 끝까지 (rad). 락투락 2.5바퀴 */
    maxAngle: 450 * DEG,
    /** 앞바퀴 물리적 최대 조향각 */
    maxRoadWheelAngle: 33 * DEG,

    /** 일반 주행 시 손으로 핸들을 돌리는 속도 (rad/s) */
    handSpeedNormal: 240 * DEG,
    /** 저속·정차 시 (실제로 주차할 땐 훨씬 빠르게 감는다) */
    handSpeedParking: 480 * DEG,
    /** 이 속도 이상이면 handSpeedNormal 을 쓴다 (m/s) */
    handSpeedBlendSpeed: 20 * KMH,

    /**
     * 조향비 — 속도가 오르면 커진다.
     *
     * 일반 게임처럼 고속에서 최대 조향각 자체를 좁히면 "핸들을 끝까지
     * 감았는데 안 꺾인다"는 거짓 감각을 학습시키게 된다. 대신 실제
     * 가변 조향비(VGR) 차량처럼 조향비를 키운다.
     */
    ratioLow: 14,
    ratioHigh: 40,
    /** ratioLow 가 유지되는 상한 속도 (m/s) */
    ratioLowSpeed: 20 * KMH,
    /** ratioHigh 에 도달하는 속도 (m/s) */
    ratioHighSpeed: 100 * KMH,

    /**
     * 자동 복원 — 실제 차는 캐스터각 때문에 속도가 붙으면 저절로 돌아온다.
     * 정차 중에는 복원하지 않는다. 주차 시 핸들을 감아둔 채 유지해야 한다.
     */
    returnRate: 300 * DEG,
    /** 복원이 최대가 되는 속도 (m/s) */
    returnFullSpeed: 40 * KMH,
  },

  /** 액셀·브레이크 페달 응답 — 실제 페달도 즉시 100% 가 되지 않는다 */
  pedal: {
    /** 밟는 속도 (1/s). 3.0 이면 약 0.33초에 최대 */
    pressRate: 3.0,
    /** 떼는 속도 (1/s) */
    releaseRate: 6.0,
  },

  /** 기어 */
  gearbox: {
    /** 전환에 필요한 정지 상태 유지 시간 (초) */
    changeDelay: 0.3,
    /** 정지로 간주하는 속도 (m/s) */
    standstillSpeed: 0.3,
  },

  /** 마우스 조향 (Pointer Lock) */
  mouse: {
    /** 핸들 한 바퀴(360°)를 돌리는 데 필요한 마우스 이동량 (px) */
    pixelsPerTurn: 700,
  },

  /** 운전석 시점 카메라 위치 (차체 로컬, m). 좌핸들이므로 +X(왼쪽) */
  driverSeat: {
    x: 0.38,
    y: 0.42,
    z: 0.15,
  },
}

/**
 * 파라미터에서 유도되는 기하 값.
 *
 * 상수로 캐시하지 않고 매번 계산한다 — 튜닝 패널이 원본 값을
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

export type VehicleParams = typeof vehicleParams
