import { laneAt, ROAD } from '../level/road.ts'
import { signedGap, type Traffic } from '../traffic/traffic.ts'

/**
 * 차선 변경 판정.
 *
 * 이 레슨에서 채점하는 것은 "차선을 바꿨는가"가 아니라
 * **"올바른 절차로 바꿨는가"** 다.
 *
 *   ① 방향지시등을 미리 켰는가
 *   ② 사각지대(어깨 너머)를 확인했는가
 *   ③ 뒤차가 감속하지 않아도 되는 간격에서 들어갔는가
 *
 * 단순히 "실패"라고 하면 배우는 게 없다. 무엇이 부족했는지 돌려준다.
 *
 * docs/stage-2-lane-change.md
 */

export type Side = 'left' | 'right'
export type Verdict = 'safe' | 'risky' | 'dangerous' | 'collision'

/** 변경 전 지시등을 켜고 있어야 하는 최소 시간 (초) */
const SIGNAL_LEAD_REQUIRED = 2.0
/** 사각지대 확인이 유효한 시간 (초) */
const BLIND_SPOT_VALID_FOR = 6.0

/** 안전 판정 기준 */
const SAFE_TTC = 3.0
const RISKY_TTC = 1.5
const SAFE_GAP = 20
const RISKY_GAP = 10

export interface LaneChangeResult {
  from: number
  to: number
  side: Side
  verdict: Verdict
  /** 목표 차선 뒤차와의 간격 (m). 뒤차가 없으면 null */
  gap: number | null
  /** 뒤차가 따라잡는 데 걸리는 시간 (초). 접근 중이 아니면 null */
  ttc: number | null
  signalOk: boolean
  signalLead: number
  blindSpotOk: boolean
  reason: string
}

export interface DrivingInputs {
  signal: Side | null
  /** 이번 프레임에 어깨 너머를 보고 있는 방향 */
  looking: Side | null
}

export class LaneChangeMonitor {
  private currentLane: number | null = null
  /** 현재 지시등을 켜고 있는 시간 (초) */
  private signalHeld = 0
  private signalSide: Side | null = null
  /** 마지막으로 좌/우 어깨 너머를 본 뒤 경과 시간 */
  private sinceLookLeft = Infinity
  private sinceLookRight = Infinity

  /** 직전 판정 결과 — UI 가 읽는다 */
  lastResult: LaneChangeResult | null = null
  /** 충돌 중인가 */
  colliding = false

  update(
    dt: number,
    playerX: number,
    playerZ: number,
    playerSpeed: number,
    inputs: DrivingInputs,
    traffic: Traffic,
  ): LaneChangeResult | null {
    // ── 입력 이력 ─────────────────────────────────────
    if (inputs.signal !== this.signalSide) {
      this.signalSide = inputs.signal
      this.signalHeld = 0
    } else if (inputs.signal) {
      this.signalHeld += dt
    }

    this.sinceLookLeft = inputs.looking === 'left' ? 0 : this.sinceLookLeft + dt
    this.sinceLookRight = inputs.looking === 'right' ? 0 : this.sinceLookRight + dt

    // ── 차선 추적 ─────────────────────────────────────
    const lane = laneAt(playerX)
    if (lane === null) {
      this.currentLane = null
      return null
    }

    const previous = this.currentLane
    this.currentLane = lane
    if (previous === null || previous === lane) return null

    // 차선이 바뀌었다 — 판정한다.
    // 차선 번호는 1차선이 가장 왼쪽이므로, 번호가 줄면 왼쪽으로 간 것이다.
    const side: Side = lane < previous ? 'left' : 'right'
    const result = this.judge(side, previous, lane, playerZ, playerSpeed, traffic)
    this.lastResult = result
    return result
  }

  private judge(
    side: Side,
    from: number,
    to: number,
    playerZ: number,
    playerSpeed: number,
    traffic: Traffic,
  ): LaneChangeResult {
    const behind = traffic.nearestBehind(to, playerZ)

    let gap: number | null = null
    let ttc: number | null = null
    let verdict: Verdict = 'safe'

    if (behind) {
      gap = behind.gap
      const closingSpeed = behind.car.speed - playerSpeed
      // 뒤차가 더 빠를 때만 따라잡는다
      if (closingSpeed > 0.1) ttc = gap / closingSpeed

      if (gap < RISKY_GAP || (ttc !== null && ttc < RISKY_TTC)) {
        verdict = 'dangerous'
      } else if (gap < SAFE_GAP || (ttc !== null && ttc < SAFE_TTC)) {
        verdict = 'risky'
      }
    }

    if (this.colliding) verdict = 'collision'

    const signalOk = this.signalSide === side && this.signalHeld >= SIGNAL_LEAD_REQUIRED
    const sinceLook = side === 'left' ? this.sinceLookLeft : this.sinceLookRight
    const blindSpotOk = sinceLook <= BLIND_SPOT_VALID_FOR

    return {
      from,
      to,
      side,
      verdict,
      gap,
      ttc,
      signalOk,
      signalLead: this.signalSide === side ? this.signalHeld : 0,
      blindSpotOk,
      reason: explain(verdict, gap, ttc, signalOk, blindSpotOk, side),
    }
  }

  /** 앞차와의 거리 등 상시 표시용 정보 */
  situation(playerX: number, playerZ: number, playerSpeed: number, traffic: Traffic) {
    const lane = laneAt(playerX)
    if (lane === null) return null

    const behind = traffic.nearestBehind(lane, playerZ)
    const ahead = traffic.nearestAhead(lane, playerZ)
    const headway = ahead && playerSpeed > 0.5 ? ahead.gap / playerSpeed : null

    return { lane, behindGap: behind?.gap ?? null, aheadGap: ahead?.gap ?? null, headway }
  }

  reset(): void {
    this.currentLane = null
    this.signalHeld = 0
    this.signalSide = null
    this.sinceLookLeft = Infinity
    this.sinceLookRight = Infinity
    this.lastResult = null
  }
}

function explain(
  verdict: Verdict,
  gap: number | null,
  ttc: number | null,
  signalOk: boolean,
  blindSpotOk: boolean,
  side: Side,
): string {
  const sideText = side === 'left' ? '왼쪽' : '오른쪽'

  if (verdict === 'collision') return '부딪혔습니다.'

  if (verdict === 'dangerous') {
    if (ttc !== null && ttc < RISKY_TTC) {
      return `뒤차가 ${ttc.toFixed(1)}초 만에 따라잡습니다. 급제동을 시켰습니다.`
    }
    return `뒤차와 ${gap?.toFixed(0)}m 밖에 안 됐습니다. 너무 가까웠습니다.`
  }

  if (verdict === 'risky') {
    if (ttc !== null) return `뒤차가 접근 중이었습니다 (${ttc.toFixed(1)}초 여유).`
    return `뒤차와 ${gap?.toFixed(0)}m — 조금 더 여유를 두는 편이 좋습니다.`
  }

  // 간격은 안전했다. 절차를 본다.
  if (!signalOk && !blindSpotOk) {
    return `간격은 안전했지만 지시등과 ${sideText} 어깨 너머 확인이 모두 없었습니다.`
  }
  if (!signalOk) return '간격은 안전했지만 지시등을 미리 켜지 않았습니다.'
  if (!blindSpotOk) return `간격은 안전했지만 ${sideText} 사각지대를 확인하지 않았습니다.`
  return '지시등, 사각지대 확인, 간격 모두 좋았습니다.'
}

/** 도로 위 위치를 문자열로 (디버그·표시용) */
export function describePosition(x: number, z: number): string {
  const lane = laneAt(x)
  const wrapped = ((z + ROAD.length / 2) % ROAD.length) - ROAD.length / 2
  return lane === null ? '도로 밖' : `${lane + 1}차선  ${wrapped.toFixed(0)}m`
}

export { signedGap }
