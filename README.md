# 챙김 — 날씨와 옷차림

현재 위치의 실제 날씨와 시간별 예보를 확인하고, 외출 시간에 맞는 옷차림과 준비물을 추천하는 설치형 웹앱입니다.

![챙김 화면 미리보기](.github/preview.png)

## GitHub에 올리고 화면 열기

1. ZIP을 압축 해제합니다. **`index.html`이 있는 폴더 안의 파일과 폴더 전체**를 GitHub 저장소 최상위에 업로드합니다. ZIP 파일 자체를 업로드하는 방식이 아닙니다.
2. 저장소의 **Settings → Pages**로 들어갑니다.
3. Source를 **Deploy from a branch**, Branch를 **main**, 폴더를 **/ (root)**로 선택하고 **Save**를 누릅니다. 브랜치 이름이 `master`이면 그 브랜치를 고릅니다.
4. 게시가 끝나면 같은 화면에 나온 **Visit site**를 누릅니다. 주소는 `https://깃허브아이디.github.io/저장소이름/` 형태입니다.

별도 빌드나 API 키 입력 없이 화면, 실제 날씨 조회, GPS 위치 지정, 지역 검색, 옷차림 추천, 고정 일정, 시간별 그래프, 테마와 홈 화면 아이콘을 사용할 수 있습니다. GPS는 브라우저에서 위치 사용을 허용해야 합니다. 권한을 거절한 경우 지역을 검색해 지정할 수 있습니다.

GitHub의 파일 목록 화면에서는 HTML이 실행되지 않습니다. 앱은 **GitHub Pages 주소**에서 열어 주세요. 위 미리보기는 예시 날씨로 촬영한 화면입니다.

### 코드 변경 때 자동으로 게시하기

`.github/workflows/pages.yml`도 포함되어 있습니다. 이 방식을 사용할 때는 Settings → Pages → Source를 **GitHub Actions**로 선택합니다. `main` 또는 `master`에 업로드할 때 공개 화면 파일만 골라 빌드한 뒤 게시합니다. 처음부터 Actions 방식을 골라도 됩니다. 두 게시 방식 중 하나를 선택하면 됩니다.

[GitHub 공식 게시 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 포함된 기능

- GPS 기반 위치 지정, 주소 표시, 수동 지역 검색
- 실제 현재 날씨, 시간별 기온·강수확률, 그래프
- 외출 일정과 추위·더위 민감도를 반영한 옷차림과 준비물
- 반복 일정 및 하루 일정, 일정 없는 날의 알림 시간 설정
- 비비드 포인트 색과 차분한 색을 섞은 코디 추천
- 일출·일몰에 맞춘 배경, 날씨 애니메이션, 글래스 효과
- 드래그로 이동하는 하단 탭, 모바일 전체 화면
- 홈 화면 설치, 앱 아이콘, 오프라인 앱 화면

오프라인에서는 앱 화면을 열 수 있지만 새 날씨를 조회하려면 인터넷 연결이 필요합니다. 브라우저 저장 공간을 지우면 그 브라우저의 위치·일정·선호 설정도 초기화됩니다.

## 기상청 API와 휴대폰 푸시 알림

| 배포 방식 | 날씨 | 휴대폰 푸시 알림 |
| --- | --- | --- |
| GitHub Pages 기본 배포 | Open-Meteo 실제 예보, 키 필요 없음 | 서버가 필요해 비활성화 |
| 포함된 Cloudflare Worker로 전체 앱 배포 | 국내 기상청 우선, 실패 시 Open-Meteo | D1·푸시 키·예약 실행 설정 후 사용 가능 |

GitHub Pages는 서버 코드를 실행하거나 비밀 API 키를 보관하지 않습니다. **기상청 키를 HTML·JavaScript·GitHub 저장소에 넣지 마세요.** 전체 기능을 운영할 때는 [서버 배포 안내](backend/README.md)에 따라 포함된 서버를 함께 배포합니다. GitHub Pages에서 다른 서버의 알림을 대신 사용하는 연결은 제공하지 않습니다. 전체 기능은 Worker가 발급한 사이트 주소에서 사용합니다.

아이폰의 홈 화면 설치는 Safari의 공유 메뉴에서 진행합니다. 설치 버튼으로 바로 설치 가능한 브라우저에서는 브라우저 설치 창이 열립니다. 아이폰 푸시 알림은 홈 화면에 추가한 앱에서 허용해야 합니다.

기존에 다른 주소에서 설치한 앱의 알림 구독·일정·위치 설정은 새 주소로 자동 이전되지 않습니다. 새 주소에서 위치를 설정하고 알림을 켜 주세요.

## 내 컴퓨터에서 실행하기

Node.js 22 이상에서 다음을 실행합니다. 기본 화면 실행과 빌드는 외부 패키지를 설치하지 않아도 됩니다.

```sh
npm run dev
```

표시된 `http://127.0.0.1:4173` 주소로 접속합니다. `index.html`을 더블 클릭하는 방식은 위치 권한·설치 기능이 제한되므로 로컬 서버 또는 게시 주소를 사용합니다.

```sh
npm run build   # 공개 화면 파일만 dist/로 복사
npm test        # 정적 배포와 서버 진입점 확인
```

## 파일 구조

```text
index.html                 바로 열리는 앱 화면
app-config.js              GitHub Pages 기본 모드
weather-*.js / *.css        날씨·추천·디자인·알림 화면
assets/                    아이콘과 Lucide 파일
manifest.webmanifest       홈 화면 이름·아이콘·시작 주소
sw.js                      오프라인 화면·푸시 수신
backend/                   선택형 기상청·푸시 서버와 새 DB 스키마
scripts/                   로컬 실행·공개 파일 빌드·푸시 키 생성
tests/                     외부 발송 없이 실행하는 검사
.github/workflows/pages.yml GitHub Pages 자동 게시
```

`dist/`는 빌드 결과이며 업로드 원본에 포함하지 않아도 됩니다. 실제 비밀키, 이전 배포 계정 설정, 사용자 위치·알림 구독 DB, 작업 로그와 백업은 포함하지 않았습니다.

## 데이터와 아이콘 출처

날씨: [Open-Meteo](https://open-meteo.com/) · 지역 검색: [GeoNames](https://www.geonames.org/), Open-Meteo Geocoding · GPS 주소: [BigDataCloud](https://www.bigdatacloud.com/) · 미세먼지: CAMS 모델 예보(Open-Meteo Air Quality) · 국내 서버 연결 시: [기상청 API 허브](https://apihub.kma.go.kr/)

아이콘: [Lucide](https://lucide.dev/), [동봉 라이선스](assets/lucide-LICENSE.txt). 각 데이터 제공자의 이용 조건과 호출 한도는 해당 서비스의 정책을 따릅니다.
