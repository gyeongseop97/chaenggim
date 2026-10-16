# 기상청·푸시 알림 서버 연결 (선택)

GitHub Pages에서는 서버 설정 없이 Open-Meteo 예보로 화면이 작동합니다. 기상청 인증키를 사용하거나 앱이 닫힌 뒤에도 휴대폰 알림을 받으려면 이 폴더의 Cloudflare Worker를 별도로 배포하세요. **GitHub에 코드를 올리는 것만으로 이 서버가 배포되거나 기존 챙김 서버에 연결되지는 않습니다.**

Worker를 사용하면 웹 화면과 API가 **같은 Worker 주소**에서 열립니다. GitHub Pages 화면에서 다른 도메인의 API를 호출하는 구성은 포함하지 않았습니다. 기존 서비스의 인증키·알림 구독·데이터베이스는 이 저장소에 포함하지 않았으며, 새 사이트에서는 각 사용자가 다시 알림을 허용해야 합니다.

## 1. 준비와 화면 배포

Node.js 22 이상을 설치하고 프로젝트 루트에서 다음을 실행합니다. `npm ci`는 동봉된 잠금 파일을 사용해 서버 배포 도구를 설치합니다. 그다음 Cloudflare 계정에 로그인하고 배포합니다.

```sh
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

기본 설정은 알림을 꺼 둡니다. D1이나 비밀키 없이도 배포할 수 있으며 화면은 보조 예보를 사용합니다. Worker에서 `/app-config.js`가 서버 기능 사용 여부를 알려 주며, API는 같은 주소의 `/api/` 아래에서 실행됩니다.

## 2. 기상청 예보만 연결하기

```sh
npx wrangler secret put KMA_API_KEY
```

입력창에 본인 기상청 API Hub 인증키를 붙여 넣으세요. 키를 HTML·브라우저 코드·GitHub 저장소에 적지 마세요. 국내 위치에서 기상청 예보를 우선 사용하고, 연결이 어려우면 Open-Meteo 예보를 사용합니다.

## 3. 휴대폰 푸시 알림 연결하기

### 데이터베이스

```sh
npx wrangler d1 create chaenggim-notifications
```

출력에 표시되는 `database_id`를 복사하세요. 루트 `wrangler.jsonc`에서 주석 처리한 `d1_databases` 항목을 활성화하고, 안내용 문자열을 **직접 생성한 ID**로 바꿉니다. `binding`은 `WEATHER_DB`, `migrations_dir`는 `backend/migrations`로 유지하세요. 그다음 새 데이터베이스의 테이블을 만듭니다.

```sh
npx wrangler d1 migrations apply WEATHER_DB --remote
```

`backend/migrations/0001_notifications.sql`은 새 데이터베이스용 전체 스키마입니다. 다른 버전의 기존 데이터베이스에 업그레이드 용도로 사용하지 마세요.

### 새 알림 키

본인이 연락받을 이메일 주소를 넣어 실행합니다.

```sh
node scripts/generate-push-keys.mjs mailto:your-contact@example.com
```

키는 화면에 표시하지 않고 로컬 `.dev.vars` 파일에 저장합니다. 이 파일은 Git에서 제외됩니다. 기존 `.dev.vars`가 있으면 덮어쓰지 않습니다. 이미 운영 중인 구독이 있다면 키를 새로 생성하지 말고 기존 키를 유지하세요.

`.dev.vars`의 다음 값을 각각 Cloudflare 비밀 값으로 등록합니다. `secret put`의 입력창에 파일의 해당 값만 넣으세요. `VAPID_PRIVATE_JWK` 값 양 끝의 작은따옴표는 빼고 JSON 전체를 넣습니다.

```sh
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler secret put VAPID_SUBJECT
```

`VAPID_SUBJECT`는 본인의 `mailto:` 연락 이메일 또는 본인 HTTPS 주소입니다. 새 키를 발급하면 기존 알림 구독은 다시 등록해야 합니다. `.dev.vars` 및 비밀키를 GitHub에 올리지 마세요.

### 자동 발송 활성화

설정과 테이블 생성을 마친 뒤 `wrangler.jsonc`의 `PUSH_SCHEDULER_READY`를 문자열 `"true"`로 바꾸고 다시 배포합니다.

```sh
npm run build
npx wrangler deploy
```

포함된 Cron Trigger는 매분 확인합니다. `PUSH_SCHEDULER_READY`가 `"false"`이면 예약 발송을 실행하지 않습니다. 일정이 있는 날은 출발 30분 전, 일정이 없는 날은 사용자가 정한 시각(기본 오전 7시)에 발송하며, 기기별 시간대를 사용합니다. 중복 알림을 막고 알림을 끄면 해당 기기의 서버 정보를 삭제합니다. 매분 예약이므로 정확히 초 단위로 발송되는 기능은 아닙니다.

사용자는 **새 Worker HTTPS 주소**에 접속해 알림을 허용해야 합니다. 아이폰·아이패드는 홈 화면에 추가한 앱에서 알림을 켭니다. 기기의 알림 허용·집중 모드·네트워크 상태에 따라 표시나 수신이 달라질 수 있습니다. 서버 배포와 권한 설정 후 실제 기기로 테스트하세요. Cloudflare 요금제의 실행 시간·요청·D1 한도는 본인 계정에서 확인하세요.

별도 cron 서비스는 필요 없습니다. 외부에서 `/api/notifications/tick`을 호출하려는 경우에만 32자 이상 `PUSH_ADMIN_TOKEN`을 추가로 설정합니다. 관리 토큰은 브라우저에 전달하거나 GitHub에 올리면 안 됩니다.

## 로컬 확인

```sh
npm run build
npx wrangler dev
```

로컬 기상청 연결은 `.dev.vars`의 `KMA_API_KEY` 값을 사용합니다. 로컬 D1이 필요하면 데이터베이스 연결을 설정한 뒤 아래 명령으로 별도의 로컬 테이블을 만듭니다.

```sh
npx wrangler d1 migrations apply WEATHER_DB --local
```

`.dev.vars`의 `PUSH_SCHEDULER_READY`는 로컬 설정입니다. 이 파일은 배포되지 않으므로 운영 설정은 `wrangler.jsonc`와 Cloudflare 비밀 값에 따릅니다. 로컬 테스트 중에는 `false`로 유지하세요.

## 서버 API

| 경로 | 용도 |
| --- | --- |
| `GET /api/weather?latitude=...&longitude=...` | 국내 기상청 예보·특보. 키는 서버에서만 사용 |
| `GET /api/notifications/config` | 알림 지원 여부와 공개 VAPID 키 |
| `POST /api/notifications/subscription` | 동의한 기기의 구독 등록·수정 |
| `GET`, `DELETE /api/notifications/subscription` | 기기 토큰으로 상태 확인·삭제 |
| `POST /api/notifications/test` | 등록 기기에서 테스트 알림 요청 |
| `POST /api/notifications/tick` | 선택적 관리 토큰으로만 예약 발송 확인 |

알림 관리에는 기기별 임의 토큰을 사용하고 서버에는 해시를 보관합니다. 브라우저에서 다른 출처가 보낸 수정 요청은 거부합니다. 원본 Sites 전용 MCP 경로는 포함하지 않았습니다.

관련 공식 문서: [정적 파일 바인딩](https://developers.cloudflare.com/workers/static-assets/binding/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/), [비밀 값](https://developers.cloudflare.com/workers/configuration/secrets/).
