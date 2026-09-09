import GUI from 'lil-gui'
import { vehicleParams } from '../config/vehicle-params.ts'

/**
 * 런타임 튜닝 패널.
 *
 * 기능처럼 보이지 않지만 1단계의 핵심 산출물이다. 조작 수치는 30개 남짓이고
 * 서로 얽혀 있어 한 번에 맞출 수 없다. 수치를 바꿀 때마다 코드를 고치고
 * 리로드하면 여기서 프로젝트가 멈춘다.
 *
 * 튜닝은 하루에 끝나지 않으므로 프리셋 저장/불러오기가 실질적으로 필요하다.
 * "어제 그 느낌"으로 되돌아갈 수 없으면 과감하게 실험하지 못한다.
 *
 * docs/stage-1-open-lot.md 의 "가장 먼저 만들 것: 튜닝 인프라"
 */

const STORAGE_KEY = 'drive-sim.tuning.v1'
const DEG = Math.PI / 180

/** 초기화용 기본값 — 모듈 로드 시점에 한 번만 복제한다 */
const defaults = structuredClone(vehicleParams)

export interface TuningPanel {
  gui: GUI
  /** 저장된 프리셋이 있으면 불러온다 */
  loadSaved(): boolean
}

export function createTuningPanel(onChange: () => void): TuningPanel {
  const gui = new GUI({ title: '튜닝', width: 320 })
  gui.close()

  const p = vehicleParams

  // ── 핸들 ────────────────────────────────────────────
  // 이 프로젝트의 중심 모델이므로 맨 위에 둔다
  const steering = gui.addFolder('핸들')
  addDegrees(steering, p.steeringWheel, 'maxAngle', '락투락 한쪽 (°)', 180, 720, 10)
  addDegrees(steering, p.steeringWheel, 'maxRoadWheelAngle', '앞바퀴 최대 (°)', 20, 45, 1)
  addDegrees(steering, p.steeringWheel, 'handSpeedNormal', '손 속도 주행 (°/s)', 60, 720, 10)
  addDegrees(steering, p.steeringWheel, 'handSpeedParking', '손 속도 주차 (°/s)', 60, 1080, 10)
  addDegrees(steering, p.steeringWheel, 'returnRate', '복원 속도 (°/s)', 0, 720, 10)
  steering.add(p.steeringWheel, 'ratioLow', 8, 24, 0.5).name('조향비 저속')
  steering.add(p.steeringWheel, 'ratioHigh', 12, 60, 0.5).name('조향비 고속')

  // ── 서스펜션 ────────────────────────────────────────
  const suspension = gui.addFolder('서스펜션')
  suspension.add(p.suspension, 'stiffness', 5, 80, 1).name('강성').onChange(onChange)
  suspension.add(p.suspension, 'compression', 0.1, 3, 0.01).name('압축 감쇠').onChange(onChange)
  suspension.add(p.suspension, 'relaxation', 0.1, 3, 0.01).name('이완 감쇠').onChange(onChange)
  suspension.add(p.suspension, 'maxTravel', 0.05, 0.6, 0.01).name('최대 스트로크 (m)').onChange(onChange)
  suspension.add(p.suspension, 'maxForce', 2000, 30000, 500).name('최대 힘 (N)').onChange(onChange)

  // ── 타이어 ──────────────────────────────────────────
  const tire = gui.addFolder('타이어')
  tire.add(p.tire, 'frictionSlip', 1, 30, 0.5).name('전방 마찰').onChange(onChange)
  tire.add(p.tire, 'sideFrictionStiffness', 0.1, 3, 0.05).name('횡방향 강성').onChange(onChange)

  // ── 구동 ────────────────────────────────────────────
  const drive = gui.addFolder('구동')
  drive.add(p.drive, 'maxEngineForce', 500, 6000, 50).name('최대 엔진력 (N)')
  drive.add(p.drive, 'maxSpeed', 10, 80, 1).name('최고 속도 (m/s)')
  drive.add(p.drive, 'maxReverseSpeed', 2, 20, 0.5).name('후진 최고 (m/s)')
  drive.add(p.drive, 'creepForce', 0, 2000, 10).name('크립 힘 (N)')
  drive.add(p.drive, 'creepSpeed', 0, 5, 0.1).name('크립 속도 (m/s)')

  // ── 제동 ────────────────────────────────────────────
  const brake = gui.addFolder('제동')
  brake.add(p.brake, 'maxForce', 5, 200, 1).name('제동력 (단위 아님)')
  brake.add(p.brake, 'frontBias', 0.3, 0.9, 0.01).name('앞 배분')
  brake.add(p.brake, 'engineBrake', 0, 20, 0.5).name('엔진 브레이크')

  // ── 페달 · 기어 ─────────────────────────────────────
  const pedal = gui.addFolder('페달 · 기어')
  pedal.add(p.pedal, 'pressRate', 0.5, 20, 0.5).name('밟는 속도 (1/s)')
  pedal.add(p.pedal, 'releaseRate', 0.5, 20, 0.5).name('떼는 속도 (1/s)')
  pedal.add(p.gearbox, 'changeDelay', 0, 1.5, 0.05).name('기어 전환 대기 (s)')

  // ── 입력 ────────────────────────────────────────────
  const input = gui.addFolder('입력')
  input.add(p.mouse, 'pixelsPerTurn', 100, 2000, 10).name('마우스 1바퀴 (px)')

  // ── 프리셋 ──────────────────────────────────────────
  const presets = gui.addFolder('프리셋')
  presets.open()
  presets.add(
    {
      저장: () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicleParams))
        flash(gui, '저장했습니다')
      },
    },
    '저장',
  )
  presets.add(
    {
      불러오기: () => {
        if (loadSaved()) {
          gui.controllersRecursive().forEach((c) => c.updateDisplay())
          onChange()
          flash(gui, '불러왔습니다')
        } else {
          flash(gui, '저장된 값이 없습니다')
        }
      },
    },
    '불러오기',
  )
  presets.add(
    {
      초기화: () => {
        deepAssign(vehicleParams, defaults)
        gui.controllersRecursive().forEach((c) => c.updateDisplay())
        onChange()
        flash(gui, '초기값으로 되돌렸습니다')
      },
    },
    '초기화',
  )
  presets.add(
    {
      'JSON 복사': () => {
        void navigator.clipboard
          .writeText(JSON.stringify(vehicleParams, null, 2))
          .then(() => flash(gui, '클립보드에 복사했습니다'))
          .catch(() => flash(gui, '복사 실패 — 콘솔을 확인하세요'))
        console.log(JSON.stringify(vehicleParams, null, 2))
      },
    },
    'JSON 복사',
  )

  return { gui, loadSaved }
}

function loadSaved(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  try {
    deepAssign(vehicleParams, JSON.parse(raw))
    return true
  } catch {
    console.warn('저장된 튜닝 값을 읽지 못했습니다')
    return false
  }
}

/**
 * 각도 파라미터는 내부적으로 라디안이지만 튜닝은 도(°)로 해야 감이 온다.
 * lil-gui 에 도 단위 프록시를 붙인다.
 */
function addDegrees(
  folder: GUI,
  target: Record<string, number>,
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
): void {
  const proxy = { value: target[key] / DEG }
  folder
    .add(proxy, 'value', min, max, step)
    .name(label)
    .onChange((v: number) => {
      target[key] = v * DEG
    })
}

/** 중첩 객체를 키 단위로 덮어쓴다 (참조를 바꾸지 않는다) */
function deepAssign(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const child = target[key]
      if (child !== null && typeof child === 'object') {
        deepAssign(child as Record<string, unknown>, value as Record<string, unknown>)
      }
    } else if (key in target) {
      target[key] = value
    }
  }
}

function flash(gui: GUI, message: string): void {
  gui.title(`튜닝 — ${message}`)
  setTimeout(() => gui.title('튜닝'), 1600)
}
