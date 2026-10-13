# 인증 구현 설명서 — 소개 페이지에 패스키 달기 (과제 8)

- 결과물 주소: https://1-project-nine.vercel.app (첫 화면은 누구나 보는 공개 소개, 맨 아래 비공개 자리만 패스키로 잠금)
- 소스 주소: https://github.com/undeadmagician32-bot/-1- (이 과제의 코드는 `project/` 아래)
- 확인 기록 원문: [`evidence-local.md`](evidence-local.md) (판정 30건 모두 통과), 화면: [`screens/`](screens/)
- 비공개 자리에 넣은 내용은 모두 **만들어 넣은 가상 내용**입니다(가상 회사 이름, 가상 메모). 실제 연락처·신분증 번호·비밀값은 없습니다.

---

## ① 무엇으로 붙였나

- **라이브러리**: 서버 쪽 패스키(WebAuthn) 검증은 **SimpleWebAuthn** `@simplewebauthn/server 13.3.3`, 브라우저 쪽은 `@simplewebauthn/browser 13.x` 를 썼습니다.
- 인증 서비스(Auth0·Firebase·Supabase Auth 등)는 쓰지 않았습니다. 일회용 질문 보관·재사용 차단, 세션, 계정별 자료 분리는 직접 구현했습니다(`project/server/app.js`).
- 그 밖에: `pg 8`(배포 DB = Postgres, 기존 과제에서 쓰던 Supabase 를 `pk_` 로 시작하는 별도 표로 공유), 로컬 확인용 DB 는 PGlite 0.3(진짜 Postgres 엔진).
- 서버는 Vercel 서버리스 함수 하나(`project/api/index.js`)이고, 화면은 과제 1의 React(Vite) 페이지 그대로입니다.
- 로그인 뒤 사람을 알아보는 방법: **세션**. 무작위 32바이트 값을 `sid` 쿠키(HttpOnly, SameSite=Strict, https 에서 Secure, 8시간)로 주고, DB `pk_sessions` 에는 그 값의 SHA-256 만 둡니다. 토큰(JWT)은 쓰지 않습니다.

## ② 왜 그걸 골랐나

- WebAuthn 응답 검증(CBOR 해석, attestation·authenticatorData 파싱, 출처·RP ID 확인, 서명 알고리즘별 확인)은 직접 짜면 틀리기 쉽고, 틀려도 "늘 통과"로 조용히 실패합니다. 많이 쓰이고 관리되는 라이브러리에 맡기는 쪽이 안전하다고 판단했습니다.
- SimpleWebAuthn 은 Node 와 브라우저 짝이 맞고, 질문(challenge)을 어디에 보관할지는 앱에 맡깁니다. 그래서 과제의 핵심인 "질문을 서버에 보관하고 한 번 쓰면 버린다"를 제가 직접 만들고 기록으로 보일 수 있었습니다.
- 인증 서비스를 쓰지 않은 이유: 이 과제는 공개키·일회용 질문·기기 분실 대비가 실제로 어디서 일어나는지 보는 것이 목적인데, 서비스를 쓰면 그 부분이 밖으로 숨습니다. 또 소개 페이지 하나에 외부 계정 가입을 늘리고 싶지 않았습니다.
- 세션을 고른 이유: 로그아웃하면 서버에서 세션 행을 지워 즉시 무효로 만들 수 있습니다(C33). JWT 는 만료 전까지 서버가 되돌리기 어렵습니다.

## ③ 어디를 어떻게 고쳤나

과제 1 의 공개 내용(`src/data.ts`, `Hero`·`Strengths`·`ScopeCard`·`Defects`·`Footer`)은 한 글자도 바꾸지 않았습니다. 새로 붙인 것만 적습니다. 경로는 `project/` 기준입니다.

| 파일 | 한 일 |
|---|---|
| `src/App.tsx` | 맨 위 초록 띠 "공개 영역", 맨 아래 `<PrivateZone />` 추가 |
| `src/components/PrivateZone.tsx` | 노란 점선 경계 "여기부터 비공개", 잠김 화면·등록·로그인·로그아웃·메모·패스키 목록 |
| `src/auth.ts` | API 호출과 `startRegistration`/`startAuthentication` 호출, 취소 등 오류를 사람 말로 바꿈 |
| `server/app.js` | 패스키 API 전부 (아래 네 흐름) |
| `server/db.js` | 표 5개(`pk_users`, `pk_passkeys`, `pk_challenges`, `pk_sessions`, `pk_items`)와 가상 내용 넣기 |
| `api/index.js`, `vercel.json` | Vercel 에서 `/api/*` 를 한 함수로 보냄 |
| `local-server.js`, `scripts/evidence.mjs` | 로컬 서버, 진짜 Chromium + 가상 인증기로 확인 기록 자동 생성 |

네 흐름이 지나는 자리 (`server/app.js`):

1. **등록**: 화면 `PrivateZone.onRegister` → `auth.ts register()` → `POST /api/register/options` = `registerOptions` (로그인 상태이거나, 패스키 0개 계정 + 첫 등록 링크 코드일 때만 질문 발급, `generateRegistrationOptions`, 이미 등록한 패스키는 `excludeCredentials`) → `saveChallenge` (질문을 `pk_challenges` 에 5분 보관 + 그 브라우저와 짝인 `pk_flow` 쿠키) → 기기에서 열쇠 쌍 생성 → `POST /api/register/verify` = `registerVerify` → `consumeChallenge` (질문 확인·즉시 사용 처리) → `verifyRegistrationResponse` → **공개키만** `pk_passkeys` 에 저장(이름 포함).
2. **로그인**: `PrivateZone.onLogin` → `auth.ts login()` → `POST /api/login/options` = `loginOptions` (매번 새 질문, `saveChallenge`) → 기기가 개인키로 서명 → `POST /api/login/verify` = `loginVerify` → `consumeChallenge` (이미 쓴 질문이면 400) → 패스키 ID 로 공개키 찾기(없으면 401) → `verifyAuthenticationResponse` (저장된 공개키로 서명 확인, 실패 401) → `startSession`.
3. **로그아웃**: `PrivateZone.onLogout` → `POST /api/logout` = `logout` (`pk_sessions` 행 삭제 + 쿠키 지움).
4. **비공개 자료 조회**: `PrivateZone.loadPrivate` → `GET /api/private/items` = `listItems`, `GET /api/private/items/:id` = `getItem` → 모두 `requireUser` (세션 없으면 401) → `WHERE user_id = <세션의 사용자>` 로만 조회. 주소·본문의 `account` 는 읽지 않습니다.

거절을 만드는 소스 위치 (C41):

- 로그인 없이 → 401: `requireUser` (`server/app.js` 109행 근처)
- 남의 자료 읽기·지우기 → 404: `getItem`·`deleteItem` 의 `WHERE id = $1 AND user_id = $2`
- 남의 패스키 지우기 → 404, 마지막 패스키 지우기 → 409: `deletePasskey`
- 다른 계정 이름을 적어 보내도 내 자료만: `listItems`·`addItem` 이 세션의 `u.id` 만 씀
- 남의 패스키인 척 → 401: `loginVerify` 가 계정을 오직 서명한 패스키의 주인으로 정하고, 그 공개키로 서명 확인
- 이미 쓴 질문 → 400: `consumeChallenge` 의 `used_at` 확인과 `UPDATE … WHERE used_at IS NULL`
- 이미 패스키가 있는 계정에 첫 등록 링크 재사용 → 403: `registerOptions`·`registerVerify`

## ④ 안 열리는 것을 확인한 기록

모두 [`evidence-local.md`](evidence-local.md) 에서 옮긴 것입니다. 로컬(`http://localhost:3000`, 배포와 같은 코드)에서 진짜 Chromium 과 가상 인증기(기기 안에서 열쇠 쌍을 만들고 개인키로 서명)로 실행했습니다. 계정 `check-a`·`check-b` 는 확인용이고, 세션 값은 가렸습니다.

| 확인 | 통과한 요청 | 거절된 요청 |
|---|---|---|
| 1. 로그인 없이 열기 | A 세션으로 `GET /api/private/items` → **200**, 메모 3개 | 쿠키 없이 `GET /api/private/items` → **401** `패스키로 들어가야 볼 수 있습니다` / 지어낸 `sid` → **401** / 로그인 없이 받은 HTML·JS 전체에 비공개 문구 0건 |
| 2. 남의 패스키로 열기 | B-폰 답을 그대로 보냄(본문에 `account: check-a` 를 적어도) → **200**, `account: check-b` 로만 열림 | B-폰이 서명한 답의 id 만 A-폰 패스키로 바꿈 → **401** 거절. 같은 서명을 A-폰 공개키로 직접 확인하면 `false`, B-폰 공개키로는 `true` |
| 2-1. 남의 자료 | A 가 자기 메모 `GET /api/private/items/5` → **200** | A → B 메모 읽기·지우기, B 패스키 지우기 → 모두 **404** / B → A 도 똑같이 **404** / 주소에 `?account=check-b`, 본문에 `account: check-b` → A 자신의 자료만 돌아옴 / 거절 앞뒤 B 의 자료 3건 → 3건 |
| 3. 이미 쓴 질문 재사용 | 새 질문에 A-폰이 서명한 답 → **200** | 그 답을 한 번 더 → **400** `이미 쓴 질문입니다` / 서명이 틀려 실패한 답의 질문도 재사용 → **400** / 서명 1바이트 변조 → **401** `서명 확인 실패` |
| 4. 패스키 삭제 뒤 로그인 | A-폰 삭제 뒤 남은 A-노트북으로 → **200** | 지운 A-폰(기기에는 개인키가 남아 있음)으로 → **401** `등록되지 않은 패스키입니다` / 마지막 남은 패스키 지우기 → **409** |
| 로그아웃 뒤 | 로그아웃 전 같은 `sid` 로 조회 → **200** | 로그아웃 뒤 같은 `sid` 값 → **401** |

질문이 매번 다른 기록(등록 3번·로그인 3번)과 서버에 저장된 공개키(COSE 를 풀어 본 값, 개인키 성분 `-4(d)` 없음), 등록 요청 본문(개인키 칸 없음), 등록 취소 시 verify 요청이 가지 않고 패스키 수가 그대로인 기록도 같은 파일에 있습니다.

배포 주소에서의 실제 기기 확인(내 계정 `me`)은 제출문의 "실제 기기 확인" 칸에 적습니다.

## ⑤ AI와 나

- AI 에게 맡긴 일: 서버·화면 코드 작성, SimpleWebAuthn 사용법 확인, 가상 인증기로 확인 기록을 만드는 스크립트 작성, 이 설명서 초안.
- 내가 직접 판단한 일: (제출문의 "AI와 내 판단 3줄" 과 같은 내용 — 제출 전에 본인이 확인해 고칩니다)
- AI 제안을 따르지 않은 일: (같은 곳에 적습니다)

## ⑥ 아직 못 막은 것

1. **첫 등록 링크는 코드 하나로 지켜진다.** 패스키가 0개인 계정에는 `ENROLL_CODE`(Vercel 환경변수)를 아는 누구나 첫 패스키를 붙일 수 있습니다. 배포에서 `check-a`·`check-b` 처럼 아직 등록하지 않은 계정이 남아 있으면 코드가 샐 때 그 계정을 남이 차지할 수 있습니다. 내 계정에 패스키 두 개를 등록한 뒤에는 `ENROLL_CODE` 를 지워 두는 것으로 줄였지만, 링크 자체를 일회용으로 만들지는 못했습니다.
2. **마지막 패스키까지 잃어버리면 스스로 복구할 길이 없다.** 마지막 패스키는 지울 수 없게(409) 막았지만, 그 기기를 잃으면 들어갈 수 없습니다. 복구하려면 운영자가 DB 에서 그 계정의 패스키를 직접 지운 뒤 첫 등록 링크로 다시 등록해야 합니다.
3. **요청 횟수 제한이 없다.** `/api/login/options` 를 계속 부르면 질문 행이 계속 쌓입니다(5분 뒤 만료, 하루 지난 것은 다음 확인 때 정리). 서명 실패 시도도 막지 않고 셉니다.
4. **사용자 확인(지문·PIN)을 필수로 하지 않았다** (`userVerification: 'preferred'`). 지문 없는 보안 키라면 그 키를 손에 넣은 사람은 그냥 들어옵니다.
5. **세션 목록·원격 로그아웃이 없다.** 다른 기기에 열린 세션은 8시간 동안 유효합니다. 그 세션을 연 패스키를 지우면 함께 끝나지만, 세션만 골라 끊는 화면은 없습니다.
