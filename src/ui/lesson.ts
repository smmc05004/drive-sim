import type { LaneChangeResult, Verdict } from '../driving/lane-change.ts'
import type { Side } from '../driving/lane-change.ts'

/**
 * 레슨 결과 표시.
 *
 * 단순히 "실패"라고 하면 배우는 게 없다. **무엇이 부족했는지** 보여준다.
 * 절차 체크리스트와 실제 간격·시간을 함께 내보내는 이유다.
 */

const VERDICT_TEXT: Record<Verdict, string> = {
  safe: '안전',
  risky: '위험',
  dangerous: '매우 위험',
  collision: '충돌',
}

/** 결과를 띄워두는 시간 (ms) */
const SHOW_DURATION = 6500

export class LessonView {
  private hideTimer: number | undefined

  constructor(
    private readonly panel: HTMLElement,
    private readonly signalLeft: HTMLElement,
    private readonly signalRight: HTMLElement,
  ) {}

  show(result: LaneChangeResult): void {
    const sideText = result.side === 'left' ? '왼쪽' : '오른쪽'
    const gapText =
      result.gap === null ? '뒤차 없음' : `뒤차 ${result.gap.toFixed(0)}m`
    const ttcText = result.ttc === null ? '' : ` · 여유 ${result.ttc.toFixed(1)}초`

    this.panel.className = `show ${result.verdict}`
    this.panel.innerHTML =
      `<span class="verdict">${VERDICT_TEXT[result.verdict]}</span>` +
      `  ${result.from + 1}차선 → ${result.to + 1}차선 (${sideText})\n` +
      `${result.reason}\n` +
      `<span class="check">` +
      `${mark(result.signalOk)} 지시등` +
      `${result.signalLead > 0 ? ` (${result.signalLead.toFixed(1)}초 전)` : ''}` +
      `   ${mark(result.blindSpotOk)} 사각지대 확인` +
      `   ${gapText}${ttcText}</span>`
    this.panel.style.whiteSpace = 'pre-line'

    clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => {
      this.panel.className = ''
    }, SHOW_DURATION) as unknown as number
  }

  /** 방향지시등 표시 — 실제처럼 깜빡인다 */
  updateSignals(signal: Side | null, timeSeconds: number): void {
    const blink = Math.floor(timeSeconds * 1.5) % 2 === 0
    this.signalLeft.className = signal === 'left' && blink ? 'on' : ''
    this.signalRight.className = signal === 'right' && blink ? 'on' : ''
  }

  clear(): void {
    clearTimeout(this.hideTimer)
    this.panel.className = ''
  }
}

const mark = (ok: boolean) => (ok ? '<span class="ok">✓</span>' : '<span class="no">✗</span>')
