/** 눌린 키 집합과, 이번 프레임에 새로 눌린 키를 추적한다. */
export class Keyboard {
  private readonly held = new Set<string>()
  private readonly pressedThisFrame = new Set<string>()

  constructor(target: Window = window) {
    target.addEventListener('keydown', (event) => {
      if (event.repeat) return
      const code = event.code
      this.held.add(code)
      this.pressedThisFrame.add(code)
    })
    target.addEventListener('keyup', (event) => {
      this.held.delete(event.code)
    })
    // 포커스를 잃으면 키가 눌린 채로 남는다
    target.addEventListener('blur', () => {
      this.held.clear()
    })
  }

  isHeld(...codes: string[]): boolean {
    return codes.some((code) => this.held.has(code))
  }

  /** 이번 프레임에 새로 눌렸는가 (누르고 있는 동안 한 번만 true) */
  wasPressed(...codes: string[]): boolean {
    return codes.some((code) => this.pressedThisFrame.has(code))
  }

  /**
   * wasPressed 와 같지만 한 번 읽으면 소비된다.
   *
   * 물리는 한 프레임에 여러 스텝이 돌 수 있어서, 스텝 안에서 wasPressed 를
   * 쓰면 토글이 두 번 뒤집힌다. 스텝 안에서 쓰는 단발 입력은 이걸 쓴다.
   */
  consumePress(...codes: string[]): boolean {
    for (const code of codes) {
      if (this.pressedThisFrame.delete(code)) return true
    }
    return false
  }

  /** 매 렌더 프레임 끝에서 호출한다 */
  endFrame(): void {
    this.pressedThisFrame.clear()
  }
}
