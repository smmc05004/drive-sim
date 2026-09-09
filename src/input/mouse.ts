/**
 * 마우스 조향 (Pointer Lock).
 *
 * 상대 이동량이 무한히 누적되므로 실제 핸들처럼 몇 바퀴든 돌릴 수 있고,
 * 해상도가 높아(1000+ dpi) 미세 조향이 된다. 자기 복원이 없다는 점도
 * 실제 핸들과 같다. 특별한 장치 없이 얻을 수 있는 가장 정밀한 조향 입력이다.
 *
 * docs/steering-model.md 의 장치별 입력 매핑 참조.
 */
export class Mouse {
  locked = false

  private accumulatedX = 0

  constructor(private readonly canvas: HTMLElement) {
    canvas.addEventListener('click', () => {
      if (!this.locked) void canvas.requestPointerLock()
    })

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas
      if (!this.locked) this.accumulatedX = 0
    })

    document.addEventListener('mousemove', (event) => {
      if (this.locked) this.accumulatedX += event.movementX
    })
  }

  /** 지난 호출 이후 누적된 좌우 이동량 (px). 읽으면 초기화된다. */
  consumeDeltaX(): number {
    const delta = this.accumulatedX
    this.accumulatedX = 0
    return delta
  }
}
