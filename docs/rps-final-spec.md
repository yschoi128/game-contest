# 결승 2인 가위바위보 결판 규칙 — 구현 명세

작성일: 2026-06-09
상태: **설계만 완료, 구현 대기 (내일 진행)**

---

## 1. 배경 / 문제

라이브 테스트(봇 20명) 중 **생존자 2명이 남으면 게임이 끝나지 않는 무한 루프**가 발생.

### 원인 (코드 기준)

결승 판정 함수 `server/game.ts`의 `resolveFinalRound()`는
**"선택지 중 정확히 1명만 고른 선택지가 있을 때, 그 1명이 우승"** 하는 규칙이다.

```ts
// 현재 로직 요약
const uniqueIndices = choiceCounts.filter(count => count === 1);
if (uniqueIndices.length === 1) {
  // 그 유니크 선택자 우승 → END
} else {
  // 전원 생존, 다음 결승 라운드 (FINAL_RESULT)
}
```

생존자가 **2명**이면 어떤 경우에도 우승자가 안 나온다:

| 두 명의 선택 | 유니크 선택지 수 | 결과 |
|--------------|------------------|------|
| 같은 선택 (예: 둘 다 0번) | 0개 | 무승부 → 다음 라운드 |
| 다른 선택 (예: 0번/1번) | **2개** (둘 다 count===1) | `length===1` 불만족 → 다음 라운드 |

즉 2명은 같아도 달라도 결판이 안 남 → 결승만 무한 반복.

### 기존 안전장치가 못 막는 이유

`MAX_FINAL_ROUNDS(5)` 초과 시 `isSuddenDeath=true`로 서든데스 전환되지만,
서든데스도 동일한 "유니크 1명" 규칙이라 2명 교착을 해소하지 못한다.

---

## 2. 해결 방침 (운영자 결정)

> **생존자가 2명이면 가위바위보 단판으로 승부를 낸다.**

- 2명에게 **가위 / 바위 / 보** 3지선다를 제시.
- 두 명이 **다른 손**을 내면 가위바위보 규칙으로 **승자 1명 → 우승(END)**.
- 두 명이 **같은 손**을 내면 **무승부 → 가위바위보 재대결** (다시 rps 라운드).
- 미투표자 처리: 한 명만 투표하면 투표한 사람이 자동 승리. 둘 다 미투표면 기존 "전원 미투표 무효" 가드대로 재대결.

가위바위보 승패: 가위(0) > 보(2), 바위(1) > 가위(0), 보(2) > 바위(1).

---

## 3. 구현 상세 (파일별 변경점)

### 3-1. `src/shared/constants.ts`
- `TIME_LIMITS`, `CHOICE_COUNTS`에 `rps` 항목 추가:
  ```ts
  TIME_LIMITS  = { ..., rps: 10 }
  CHOICE_COUNTS = { ..., rps: 3 }
  ```
- (선택) `RPS_SURVIVOR_COUNT = 2` 상수 추가.

### 3-2. `src/shared/types.ts`
- `Phase` 타입에 `'rps'` 추가:
  ```ts
  export type Phase = 'early' | 'late' | 'final' | 'sudden_death' | 'rps';
  ```
- `GameState`에는 별도 상태 추가 불필요 — `FINAL_ACTIVE` / `FINAL_RESULT` 재사용 권장.
  (rps도 결승의 일종으로 취급하면 상태 기계 변경 최소화)

### 3-3. `server/rounds.ts`
- `getNextRound()`에서 **생존자 2명이면 phase를 `'rps'`로 강제**하고
  고정 선택지를 반환:
  ```ts
  if (survivorCount === 2) {
    return {
      roundNum,
      prompt: '⚔️ 최종 결투! 가위바위보!',
      choices: ['가위', '바위', '보'],
      timeLimit: TIME_LIMITS.rps,
      phase: 'rps',
    };
  }
  ```
  ※ 이 분기는 `isSuddenDeath`보다 **먼저** 평가되어야 함 (2명이면 무조건 rps).
- `getPhase()`는 그대로 두되, rps는 `getNextRound` 안에서 직접 처리.

### 3-4. `server/game.ts`
1. **state 결정** (`startNextRound`): rps도 활성 상태는 `FINAL_ACTIVE` 사용
   ```ts
   state = (phase === 'final' || phase === 'sudden_death' || phase === 'rps')
     ? 'FINAL_ACTIVE' : 'ROUND_ACTIVE';
   ```
2. **resolveRound 분기**: phase가 `'rps'`면 `resolveRpsRound()` 호출.
3. **`resolveRpsRound(voters, ...)` 신규 구현**:
   - 살아있는 2명의 선택을 읽는다.
   - 한 명만 투표 → 투표자 승리(END).
   - 둘 다 투표:
     - 같은 손 → 무승부 → `state='FINAL_RESULT'`, `round_invalid`("비겼습니다! 재대결") 브로드캐스트.
     - 다른 손 → 가위바위보 승패 판정 → 패자 `eliminatePlayer`, 승자 우승 → `state='END'`, `game_end` 브로드캐스트.
   - 둘 다 미투표 → 기존 `resolveRound` 진입부의 "전원 미투표 무효" 가드가 이미 처리(재대결).
   - 승패 함수:
     ```ts
     // a가 b를 이기면 true. 0=가위,1=바위,2=보
     function rpsBeats(a: number, b: number): boolean {
       return (a === 0 && b === 2) || (a === 1 && b === 0) || (a === 2 && b === 1);
     }
     ```
4. **타이머**: rps는 `FINAL_ACTIVE` 경로라 단일 timeLimit 타이머를 그대로 사용(open/blind 단계 없음). 추가 변경 불필요.

### 3-5. 프론트 (`src/host/main.ts`, `src/player/main.ts`)
- phase 라벨 분기에 rps 추가:
  - host `renderRound`의 `phaseLabel`: `data.phase === 'rps' ? '⚔️ 가위바위보 결투'` 추가.
- 무승부(재대결) 시 `round_invalid` 메시지가 이미 host에 표시됨("비겼습니다! 재대결").
  운영자는 기존 **"▶ 다음 라운드"** 버튼으로 재대결 진행 (자동 아님).
  - (선택) 무승부 시 자동으로 다음 rps 라운드를 시작하도록 서버에서 처리할 수도 있으나,
    운영자 컨트롤 유지를 위해 **수동 진행 권장**.
- 플레이어 화면은 기존 choices 렌더링 그대로(가위/바위/보 버튼) 동작 → 추가 변경 거의 없음.

---

## 4. 엣지 케이스 체크리스트

- [ ] 2명 → rps에서 다른 손: 승자 1명 우승, 패자 탈락, rankings 정확한지
- [ ] 2명 → rps에서 같은 손: 무승부 → 재대결 라운드 생성되는지
- [ ] 2명 → 한 명만 투표: 투표자 자동 승리
- [ ] 2명 → 둘 다 미투표: 기존 무효 가드로 재대결 (생존 2명 유지)
- [ ] rps 라운드도 `advanceToNextRound`로 재대결 진행 가능한지 (state가 FINAL_RESULT여야 함)
- [ ] 3명 이상은 기존 final 규칙 그대로 (rps 분기 안 탐)
- [ ] 커스텀 선택지(`createCustomRound`)와 충돌 없는지 — 운영자가 2명에서 즉석 선택지를 쓰면? (정책 결정 필요: 2명이면 rps 강제 vs 즉석 우선)

> ⚠️ **결정 필요 사항**: 생존자 2명일 때 운영자가 "즉석 선택지"를 넣으면 rps와 충돌.
> 기본은 "2명이면 무조건 rps 강제"를 권장하나, 운영자 의견 확인 필요.

---

## 5. 테스트 (`tests/game.test.ts`, `tests/rounds.test.ts`)

추가할 케이스:
- `rounds`: 생존자 2명이면 phase='rps', choices=['가위','바위','보'] 반환.
- `game`: 2명 rps에서
  - p0=가위(0), p1=보(2) → p0 승리, state END, p0 alive.
  - p0=바위(1), p1=바위(1) → 무승부, state FINAL_RESULT, 둘 다 alive.
  - p0만 투표 → p0 승리.
- `rpsBeats` 단위 테스트 (9개 조합 또는 대표 케이스).

검증 명령:
```
npm run typecheck
npm test
npm run build
```

---

## 6. 배포

- 서버 로직 변경이므로 **재배포 필요** (Railway, `git push origin main` → 자동 빌드).
- ⚠️ 배포 시 인메모리 게임 상태 초기화됨 → **행사 중 푸시 금지**.
- 배포 후 라이브에서 2인 rps 시나리오 한 번 검증.

---

## 7. 참고: 현재까지 배포된 관련 수정

- `fd89703` 전원 미투표 시 라운드 무효 (0명 데드락 방지)
- `80d015d` package-lock 동기화 (Railway npm ci 빌드 수정)
- `f515850` 질문 제목(prompt) 추가 + 마크애니 사내 질문

이 rps 작업은 위 위에 이어서 새 커밋으로 진행.
