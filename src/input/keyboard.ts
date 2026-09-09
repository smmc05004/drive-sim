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

  /** 매 렌더 프레임 끝에서 호출한다 */
  endFrame(): void {
    this.pressedThisFrame.clear()
  }
}
