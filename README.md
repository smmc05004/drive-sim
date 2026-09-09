# drive-sim

경쟁이 없는 웹 기반 **운전 연습** 시뮬레이터. 실제 운전에 필요한 감각과 절차를 익히는 것이 목적이다.

> 레이싱 게임이 아니다. 1등이 목표가 아니라, 차선 변경 타이밍과 주차 절차를 몸에 익히는 것이 목표다.

## 문서

**먼저 읽을 것**

- [프로젝트 개요](./docs/OVERVIEW.md) — 목적, 설계 원칙, 기술 스택, 단계 로드맵, 한계
- [핸들 조향 모델](./docs/steering-model.md) — 모든 단계에 걸친 핵심 구조

**단계별 설계**

| 단계 | 문서 | 검증 질문 |
|---|---|---|
| 0 | [셋업과 조작 루프](./docs/stage-0-setup.md) | 조작 루프가 도는가 |
| 1 | [공터 자유 주행](./docs/stage-1-open-lot.md) | **"운전하는 느낌"이 나는가** ← PoC 목표 |
| 2 | [차선 변경과 미러](./docs/stage-2-lane-change.md) | 미러 보고 타이밍을 잡을 수 있는가 |
| 3 | [좁은 램프와 정밀 조작](./docs/stage-3-narrow-ramp.md) | 긁지 않고 통과하는가 |
| 4 | [주차장에서 차 빼기](./docs/stage-4-parking.md) | 목표 달성 |

## 현재 상태

**설계 문서 작성 완료. 구현 미착수.**

의존성만 설치되어 있다 (three, @dimforge/rapier3d-compat, vite, typescript).

다음 작업: 0단계 셋업.

## 기술 스택

Three.js (바닐라) + Rapier 3D (WASM) + Vite + TypeScript

선택 이유는 [개요 문서](./docs/OVERVIEW.md#기술-스택) 참조.
