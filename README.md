# Lunar Aegis: Bio-Tether Intercept

달 표면에 고정된 생체 병기 운용자가 Helmet HUD를 통해 지구 방어선으로 접근하는 위협을 요격하는 브라우저 기반 1인칭 시뮬레이션 프로토타입입니다.

일반적인 걷는 FPS가 아니라, 외부 에너지 공급 케이블인 **Bio-Tether**에 연결된 상태에서 제한된 시야 안의 장거리 표적을 탐지하고 에너지와 무기 열을 관리하며 격추하는 감각에 집중합니다.

**Play:** [GitHub Pages에서 실행](https://potato-farm-k.github.io/living-aegis-prototype-02-lunar-aegis-biotether/)

## 현재 구현

- Canvas 기반 1인칭 Helmet HUD
- 중앙 조준선, 타게팅 링, 표적 박스, 거리 및 접근 상태 표시
- Bio Status, Tether Status, Weapon System, Mission/Wave 패널
- 마우스 기반 고정형 조준과 `1x / 4x / 12x` 줌
- 먼 거리에서 방어선으로 접근하는 적 투사체
- 기본 정밀 사격과 고출력 범위 펄스
- 명중 섬광, 빔, 폭발, 화면 흔들림 효과
- Bio-Tether 에너지 소비 및 자동 회복
- 사격 열 누적, 과열 경고, 자동 Thermal Lock 및 냉각
- Wave, Score, Missed, Defense Line Compromised 상태
- Scan 효과와 표적 속도 정보 표시
- 다층 달 지형, 크레이터, 암석, 방어 거점 실루엣
- 대기광, 대륙, 구름, 야간 도시광이 포함된 지구
- 데스크톱 및 작은 화면용 반응형 HUD

## 조작법

| 입력 | 동작 |
| --- | --- |
| Mouse Move | 제한된 시야 안에서 조준 |
| Left Click | 기본 Biotic Lance 발사 |
| Space | 고출력 범위 Pulse 발사 |
| Mouse Wheel / Right Click | `1x / 4x / 12x` 줌 변경 |
| T | Scan 실행 |
| R | 시뮬레이션 리셋 및 재보정 |

## 플레이 규칙

- 기본 사격은 조준점 근처의 표적 하나를 요격합니다.
- 고출력 Pulse는 조준점 주변의 여러 표적을 동시에 요격할 수 있지만 에너지와 열 소비가 큽니다.
- Bio-Tether가 에너지를 지속적으로 회복하며, 에너지가 부족하면 발사할 수 없습니다.
- 사격할 때마다 Heat가 상승하고 시간이 지나면 냉각됩니다.
- Heat가 `80` 이상이면 과부하 경고가 표시됩니다.
- Heat가 `100`에 도달하면 Thermal Lock이 걸리며, 충분히 냉각될 때까지 발사할 수 없습니다.
- 일정 수의 표적을 요격하면 다음 Wave로 진행합니다.
- Wave가 높아질수록 적 투사체가 더 빠르게, 더 자주 생성됩니다.
- 투사체가 방어선에 도달하면 Missed가 증가하며, 누적될 경우 `DEFENSE LINE COMPROMISED` 경고가 표시됩니다.

## 실행 방법

외부 라이브러리와 빌드 과정이 없는 정적 웹 프로젝트입니다.

`index.html`을 직접 열거나 로컬 정적 서버를 실행합니다.

```bash
python3 -m http.server 4173
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:4173
```

## GitHub Pages 배포

프로젝트 루트의 파일을 GitHub 저장소 `main` 브랜치에 올린 뒤 다음과 같이 설정합니다.

1. GitHub 저장소의 **Settings → Pages**로 이동합니다.
2. Source를 **Deploy from a branch**로 선택합니다.
3. Branch를 **main**, 폴더를 **/ (root)**로 설정합니다.

CSS와 JavaScript는 상대 경로로 연결되어 있어 GitHub Pages 프로젝트 하위 경로에서도 동작합니다. `.nojekyll` 파일도 포함되어 있습니다.

## 파일 구조

```text
/
├── index.html              # Canvas와 시작 UI
├── style.css               # 전체 화면 레이아웃과 시작 화면 스타일
├── script.js               # 게임 상태, 플레이 루프, Canvas 그래픽
├── .nojekyll               # GitHub Pages용 Jekyll 변환 비활성화
└── assets/
    └── concept-hud.png     # 분위기와 구도 참고용 컨셉 이미지
```

`concept-hud.png`는 실행 중 직접 사용하지 않습니다. 실제 배경과 HUD는 모두 Canvas API로 그립니다.

## 주요 튜닝 값

게임 밸런스는 [`script.js`](./script.js) 상단의 `CONFIG` 객체에서 조정할 수 있습니다.

| 상수 | 설명 | 현재 값 |
| --- | --- | ---: |
| `enemySpawnRate` | Wave 1 적 생성 간격(초) | `1.65` |
| `enemySpeed` | 적 기본 접근 속도 | `0.045` |
| `energyMax` | 최대 에너지 | `100` |
| `energyRegen` | 초당 에너지 회복량 | `9.5` |
| `shotEnergyCost` | 기본 사격 에너지 비용 | `10` |
| `pulseEnergyCost` | Pulse 에너지 비용 | `32` |
| `heatPerShot` | 기본 사격 열 증가량 | `15` |
| `pulseHeat` | Pulse 열 증가량 | `36` |
| `heatDecay` | 초당 열 감소량 | `12` |
| `hitRadius` | 기본 사격 명중 반경 | `48` |
| `pulseRadius` | Pulse 범위 | `150` |
| `waveTarget` | 다음 Wave에 필요한 요격 수 | `7` |
| `waveSpeedScaling` | Wave별 적 속도 증가율 | `0.12` |
| `waveSpawnScaling` | Wave별 생성 빈도 증가율 | `0.09` |
| `maxMissedBeforeCompromised` | 방어선 위험 경고 기준 | `6` |
| `overheatRecoveryPoint` | Thermal Lock 해제 온도 | `55` |

## 기술 구성

- HTML
- CSS
- Vanilla JavaScript
- Canvas 2D API
- 외부 라이브러리 없음
- 서버 API 없음
- 빌드 과정 없음

## 다음 개선 후보

- 적 투사체 종류와 위협 우선순위
- 조준 리드 표시 및 락온 충전
- Bio-Tether 손상과 일시적 전력 불안정
- Web Audio 기반 발사음, 경고음, 생체 심박음
- Wave 사이 업그레이드와 임무 결과 화면
- 달 지형과 기지 구조물의 추가 디테일 및 시차 효과
