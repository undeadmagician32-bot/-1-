# 패스키 확인 기록 (로컬, 진짜 Chromium + 가상 인증기)

- 대상: http://localhost:3000 (배포본과 같은 코드, DB 는 PGlite = Postgres 엔진) · 실행 시각(UTC): 2026-10-13T06:52:50.384Z
- 계정: `check-a`(확인용 A), `check-b`(확인용 B). 둘 다 만들어 넣은 내용만 들어 있습니다.
- 기기: Chromium 의 가상 인증기(CDP WebAuthn). 실제 기기처럼 기기 안에서 열쇠 쌍을 만들고 개인키로 서명합니다. "A-폰", "A-노트북", "B-폰"은 서로 다른 가상 기기입니다.
- 가림: `sid`(세션)·`pk_flow`(질문 짝 쿠키) 값은 `****(길이, 가림)`으로 바꿨습니다. 긴 base64url 값은 앞 40자만 적고 길이를 붙였습니다.
- 이 파일은 `node scripts/evidence.mjs` 가 자동으로 만들었습니다.
- 결과: 판정 30건 중 30건 통과


## 확인 1. 패스키 없이 열기 (T08-C15·C16·C17·C18)

로그인하지 않은 채 받은 첫 화면 HTML 과, 그 HTML 이 불러오는 JS 묶음 전체에서 비공개 메모 제목을 찾아봤습니다.

```http
GET /

HTTP 200 (본문 1113자)
<!doctype html> <html lang="ko"> <head> <meta charset="UTF-8" /> <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%232a8b9e'/%3E%3Ctext x='50' y='68' font-size='55' text-anchor='middle' fill='%23f2f4f8' font-family='sans-serif'%3E%EC%86%8C%3C/text%3E%3C/svg%3E" /> <meta name="viewport" content="width=device-width, initial-scale=1.0" /> <meta name="description" content="나를 소개하는 한 페이지 — 공개 범위와 근거 중심의 개인 소개 사이트" /> <title>양재훈 — 나를 소개하는 한 페이지</title> <link rel="preconnect" href="https://fonts. …

GET /assets/index-M6Ie23L1.js  (본문 188577자)
찾은 비공개 문구: 없음
```
> **판정: 통과** — 로그인 없이 받은 페이지 소스(HTML·JS)에 비공개 내용이 없다

화면 전체의 비밀번호 입력 칸(input type=password) 수: 0

> **판정: 통과** — 어디에도 비밀번호 입력 칸이 없다

화면: [전체 페이지(공개 영역 + 잠긴 비공개 자리)](screens/01-public-and-locked.png), [잠긴 자리만](screens/02-locked-zone.png)

```http
# 쿠키 없이 비공개 자료 직접 요청
GET /api/private/items

HTTP 401
{
  "error": "패스키로 들어가야 볼 수 있습니다"
}
```
```http
# 쿠키 없이 비공개 자료 한 건 직접 요청
GET /api/private/items/1

HTTP 401
{
  "error": "패스키로 들어가야 볼 수 있습니다"
}
```
```http
# 쿠키 없이 패스키 목록 요청
GET /api/passkeys

HTTP 401
{
  "error": "패스키로 들어가야 볼 수 있습니다"
}
```
```http
# 지어낸 세션 값으로 요청
GET /api/private/items
Cookie: sid=****(21자, 가림)

HTTP 401
{
  "error": "패스키로 들어가야 볼 수 있습니다"
}
```
> **판정: 통과** — 로그인 없이 직접 요청하면 401 로 거절된다

## 카드 2. 패스키 등록 (T08-C19~C26)

### 등록용 질문이 매번 다르다 (C19·C20)

```http
# 틀린 등록 코드로 첫 등록용 질문 요청
POST /api/register/options
{
  "account": "check-a",
  "enrollCode": "wrong-code"
}

HTTP 403
{
  "error": "첫 등록에는 올바른 등록 링크가 필요합니다"
}
```
> **판정: 통과** — 올바른 등록 링크 없이는 첫 등록용 질문도 주지 않는다(403)

```http
# 올바른 등록 링크로 등록용 질문을 세 번 받음 (요청 본문의 enrollCode 는 기록에서 뺌)
POST /api/register/options  → HTTP 200  challenge #1 = y4CFWVYdizphPz75rdU_4EhQnxx7mD7Djb2FLVcIdxQ
POST /api/register/options  → HTTP 200  challenge #2 = um_XevwEK6CI6S63gkHz7LpVH_hHZJXEO3utnI1PyCI
POST /api/register/options  → HTTP 200  challenge #3 = qRgbGOWNf7LcwgU1yVe1DQG0XDFb5omRP29WJs-y1aA
```
> **판정: 통과** — 등록 요청마다 질문 값이 서로 다르다

서버는 질문을 `pk_challenges` 표에 (질문, 용도, 계정, 만료 시각=5분 뒤, 받은 브라우저와 짝인 쿠키의 해시) 로 보관하고, 답을 확인할 때 `used_at` 을 채워 다시 못 쓰게 합니다 (`server/app.js` 의 `saveChallenge`, `consumeChallenge`).

### UI 로 첫 패스키 등록: A-폰 (C21·C23·C24)

```http
# 브라우저가 실제로 보낸 등록 확인 요청 (UI 에서 버튼을 눌렀을 때 붙잡음)
POST /api/register/verify
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "response": {
      "attestationObject": "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViB…(212자)",
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hh…(183자)",
      "transports": [
        "internal"
      ],
      "publicKeyAlgorithm": -8,
      "publicKey": "MCowBQYDK2VwAyEAJW38N0wpGRTWn7VnNz7AePn5NHhRzOUerkxjDIlWcj4",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMd…(172자)"
    },
    "type": "public-key",
    "clientExtensionResults": {
      "credProps": {
        "rk": true
      }
    },
    "authenticatorAttachment": "platform"
  },
  "name": "A-폰"
}

HTTP 200
{
  "ok": true,
  "passkey": {
    "id": 1,
    "name": "A-폰",
    "created_at": "2026-10-13T06:52:54.347Z",
    "last_used_at": null,
    "storage": "브라우저 가상 인증기(시험용 보안 키)",
    "public_key_preview": "pAEBAycgBiFYICVt_DdMKRkU…"
  },
  "stored": {
    "credential_id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "public_key_cose": "pAEBAycgBiFYICVt_DdMKRkU1p-1Zzc-wHj5-TR4UczlHq5MYwyJVnI-",
    "aaguid": "01020304-0506-0708-0102-030405060708"
  }
}
```
등록 요청 본문에 들어 있는 칸 전체: `response.id`, `response.rawId`, `response.response.attestationObject`, `response.response.clientDataJSON`, `response.response.transports`, `response.response.publicKeyAlgorithm`, `response.response.publicKey`, `response.response.authenticatorData`, `response.type`, `response.clientExtensionResults.credProps.rk`, `response.authenticatorAttachment`, `name`

- `response.response.publicKey` 는 **공개키**(SPKI), `response.response.attestationObject` 안에도 같은 공개키(COSE)가 들어 있습니다. `response.response.clientDataJSON` 은 서버의 질문·출처, `name` 은 사람이 붙인 이름입니다.
- 개인키(private key)를 담는 칸은 없습니다. 개인키는 가상 기기 안에만 있고, 기기는 그 개인키로 만든 결과(서명·공개키)만 내보냅니다.

```http
# 등록 요청 안의 clientDataJSON 을 풀어 본 것
{
  "type": "webauthn.create",
  "challenge": "8UB4fuBxv2LuzFEkohgJcjeWdjl2JWUxE_nIf34K2-0",
  "origin": "http://localhost:3000",
  "crossOrigin": false
}
```
> **판정: 통과** — 등록 요청 본문에 개인키 칸이 없다

> **판정: 통과** — clientDataJSON 의 질문이 서버가 준 질문과 같다

### 서버에 저장된 값 (C21·C22·C26)

```http
# pk_passkeys 표에 저장된 값 (등록 응답의 stored 칸 = DB 에 넣은 값 그대로)
credential_id   = HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY
public_key(COSE)= pAEBAycgBiFYICVt_DdMKRkU1p-1Zzc-wHj5-TR4UczlHq5MYwyJVnI-
aaguid          = 01020304-0506-0708-0102-030405060708

# public_key 를 COSE 로 풀어 본 것
1(kty)=1 (OKP)  3(alg)=-8 (-8 = EdDSA)  -1(crv)=6 (6 = Ed25519)
-2(x)=JW38N0wpGRTWn7VnNz7AePn5NHhRzOUerkxjDIlWcj4
→ Ed25519 공개키 x(32바이트) 하나뿐입니다. 개인키 성분(-4, d)이 없으므로 이 값으로는 서명을 만들 수 없고, 서명을 "확인"만 할 수 있습니다.
COSE 안의 칸 번호 전체: 1, 3, -1, -2  (개인키 칸 -4 없음)
```
> **판정: 통과** — 저장된 값이 공개키이고 개인키 성분(COSE -4, d)이 없다

비밀번호와 다른 점: 비밀번호는 서버가 받은 값과 저장된 해시를 비교하므로, 저장소가 새면 대입 공격 재료가 됩니다. 공개키는 처음부터 공개돼도 되는 값이라, 이 값이 새어도 그것만으로는 들어올 수 없습니다.

> **판정: 통과** — 등록 직후 첫 등록 계정은 세션 쿠키를 받는다

### 이름·저장 위치가 보이는 목록 (C24·C26)

```http
# A-폰으로 들어간 상태에서 패스키 목록
GET /api/passkeys
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-a",
  "current_passkey_id": 1,
  "passkeys": [
    {
      "id": 1,
      "name": "A-폰",
      "created_at": "2026-10-13T06:52:54.347Z",
      "last_used_at": null,
      "storage": "브라우저 가상 인증기(시험용 보안 키)",
      "public_key_preview": "pAEBAycgBiFYICVt_DdMKRkU…"
    }
  ]
}
```
### 등록 취소 (C25)

```http
# 패스키 창에서 [취소]를 누른 경우 (navigator.credentials.create 가 NotAllowedError 로 끝나게 함)
브라우저가 보낸 API 요청: POST /api/register/options   ← verify 요청은 가지 않음
화면 안내: 패스키 등록을 취소했습니다. 서버에는 아무것도 저장되지 않았습니다.
등록 전 패스키 수 1 → 취소 뒤 1
```
화면: [취소 안내](screens/03-register-cancelled.png)

> **판정: 통과** — 등록을 취소하면 안내가 나오고 서버에 아무것도 저장되지 않는다

## 카드 3. 패스키로 들어가기 (T08-C27~C35)

### 로그인용 질문이 매번 다르다 (C27·C28)

```http
POST /api/login/options  → HTTP 200  challenge #1 = -F7_aqPTKTYD0BkYBkSLXIU8w6mEA687ZwmPT_2Qbdo
POST /api/login/options  → HTTP 200  challenge #2 = mQk4smXP2tP13r7hzG8he35ErDUOkgGPbXxduEBnS50
POST /api/login/options  → HTTP 200  challenge #3 = KHhbfiFVSWjS4VCjeEPWcQdT6VlvYg299et0Z0fWNus
```
> **판정: 통과** — 로그인 요청마다 질문 값이 서로 다르다

```http
# 먼저 로그아웃
POST /api/logout
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{}

HTTP 200
Set-Cookie: sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0
{
  "ok": true
}
```
### 서명 확인: 성공한 요청과 실패한 요청 나란히 (C29·C30)

```http
# A-폰: 로그인용 질문 받기
POST /api/login/options
Cookie: pk_flow=****(43자, 가림)
{}

HTTP 200
Set-Cookie: pk_flow=****(43자, 가림); Path=/api; HttpOnly; SameSite=Strict; Max-Age=300
{
  "rpId": "localhost",
  "challenge": "y_THdg8AoZplfOPGTxzP1kO6qsnPJCn3bku_ovpXhPg",
  "timeout": 60000,
  "userVerification": "preferred"
}
```
```http
# 성공: A-폰이 개인키로 서명한 답을 그대로 보냄
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림)
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(324자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAg",
      "signature": "guhSltvR6JHkoXbloSPKss6fmwpfb1MBsA-UDIWPlwJCaQihzvoAVWNts9oA7moVUNSocKAr4RECMUsVvK6NCg",
      "userHandle": "cGstdXNlci0y"
    }
  }
}

HTTP 200
Set-Cookie: sid=****(43자, 가림); Path=/; HttpOnly; SameSite=Strict; Max-Age=28800
{
  "ok": true,
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "passkey": "A-폰"
}
```
> **판정: 통과** — 올바른 서명은 200 으로 통과하고 세션이 생긴다

```http
# A-폰(서명 변조용): 로그인용 질문 받기
POST /api/login/options
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{}

HTTP 200
Set-Cookie: pk_flow=****(43자, 가림); Path=/api; HttpOnly; SameSite=Strict; Max-Age=300
{
  "rpId": "localhost",
  "challenge": "ju2TdBrEBMEKUFgdvkbIX8HfbOInM5VCMMitb-SN704",
  "timeout": 60000,
  "userVerification": "preferred"
}
```
```http
# 실패: 같은 기기의 답이지만 서명 바이트 1개를 바꿔서 보냄
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(324자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAw",
      "signature": "xNTr3ynU-udMjXTWiMa2Y5mUb4JEQk0x_x0R5xywLylxw7FwCVOMA9aYxjWTkjslsh-qtG3t7TLrAwUIZK56DQ",
      "userHandle": "cGstdXNlci0y"
    }
  }
}

HTTP 401
{
  "error": "서명 확인 실패"
}
```
> **판정: 통과** — 서명을 1바이트 바꾸면 401 로 거절된다(서명을 실제로 공개키로 확인함)

### 이미 쓴 질문 재사용 (C31)

```http
# 위에서 성공한 로그인 답(같은 질문·같은 서명)을 한 번 더 보냄
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(324자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAg",
      "signature": "guhSltvR6JHkoXbloSPKss6fmwpfb1MBsA-UDIWPlwJCaQihzvoAVWNts9oA7moVUNSocKAr4RECMUsVvK6NCg",
      "userHandle": "cGstdXNlci0y"
    }
  }
}

HTTP 400
{
  "error": "이미 쓴 질문입니다. 새 질문을 받아 다시 시도하세요"
}
```
> **판정: 통과** — 이미 쓴 질문으로 다시 로그인하면 거절된다

```http
# 서명이 틀려 실패했던 답의 질문도 다시 못 씀(실패해도 질문은 소모됨)
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(324자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAw",
      "signature": "xNTr3ynU-udMjXTWiMa2Y5mUb4JEQk0x_x0R5xywLylxw7FwCVOMA9aYxjWTkjslsh-qtG3t7TLrAwUIZK56DQ",
      "userHandle": "cGstdXNlci0y"
    }
  }
}

HTTP 400
{
  "error": "이미 쓴 질문입니다. 새 질문을 받아 다시 시도하세요"
}
```
> **판정: 통과** — 실패한 시도의 질문도 다시 쓸 수 없다

### 로그인 뒤 사람을 알아보는 방법 (C32·C34)

- **세션**입니다. 로그인에 성공하면 서버가 무작위 32바이트 값을 만들어 `sid` 쿠키(HttpOnly, SameSite=Strict, 배포에서는 Secure, 8시간)로 주고, DB `pk_sessions` 에는 그 값의 SHA-256 만 둡니다. 토큰(JWT 등)은 쓰지 않습니다.
- 이 기록의 모든 `sid`·`pk_flow` 값은 가렸습니다.

```http
# A 세션으로 비공개 자료 조회 (성공 쪽)
GET /api/private/items
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "count": 3,
  "items": [
    {
      "id": 5,
      "title": "A의 비공개 메모 1",
      "body": "확인용 계정 A 전용 가상 메모입니다. B 에게 보이면 안 됩니다.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 6,
      "title": "A의 비공개 메모 2",
      "body": "확인용 계정 A 전용 두 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 7,
      "title": "A의 비공개 메모 3",
      "body": "확인용 계정 A 전용 세 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.650Z"
    }
  ]
}
```
> **판정: 통과** — A 세션으로는 A 의 비공개 메모 3개를 받는다

### 로그아웃 뒤 같은 세션 값으로 다시 요청 (C33)

```http
# 로그아웃 (서버에서 세션 행 삭제)
POST /api/logout
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{}

HTTP 200
Set-Cookie: sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0
{
  "ok": true
}
```
```http
# 로그아웃 전에 쓰던 sid 값을 그대로 다시 보냄
GET /api/private/items
Cookie: sid=****(43자, 가림)

HTTP 401
{
  "error": "패스키로 들어가야 볼 수 있습니다"
}
```
> **판정: 통과** — 로그아웃 뒤 같은 세션 값은 401 로 거절된다

## 확인 2. 남의 패스키·남의 자료 (T08-C36~C41)

```http
# check-b 계정에 B-폰 패스키 등록 (UI)
POST /api/register/verify → HTTP 200  {"id":2,"name":"B-폰","created_at":"2026-10-13T06:52:57.621Z","last_used_at":null,"storage":"브라우저 가상 인증기(시험용 보안 키)","public_key_preview":"pAEBAycgBiFYIFxFHn0pYzAR…"}
```
```http
# 같은 요청을 올바른 코드로 보냈을 때
POST /api/register/options {"account":"check-b","enrollCode":"(가림)"}

HTTP 403
{"error":"이미 패스키가 있는 계정입니다. 패스키로 들어간 뒤 추가하세요"}
```
> **판정: 통과** — 이미 패스키가 있는 계정은 등록 링크로 새 패스키를 붙일 수 없다(403)

```http
# A 다시 로그인: 로그인용 질문 받기
POST /api/login/options
Cookie: pk_flow=****(43자, 가림)
{}

HTTP 200
Set-Cookie: pk_flow=****(43자, 가림); Path=/api; HttpOnly; SameSite=Strict; Max-Age=300
{
  "rpId": "localhost",
  "challenge": "qCR6fsJFEceuJOaLeqn9_IJ3dXSdLwN52P2PLSTnbQw",
  "timeout": 60000,
  "userVerification": "preferred"
}
```
```http
# A-폰으로 다시 로그인
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림)
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(179자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAABA",
      "signature": "fPRZYqbnRhSsDILiQRI3DPODSus4eeGjjzOZs5lSHNRc1SZ9xB4YJEIE3mNyBkSfXzzgOYJBEv2ZHRcGu43wCg",
      "userHandle": "cGstdXNlci0y"
    }
  }
}

HTTP 200
Set-Cookie: sid=****(43자, 가림); Path=/; HttpOnly; SameSite=Strict; Max-Age=28800
{
  "ok": true,
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "passkey": "A-폰"
}
```
```http
# A 의 자료
GET /api/private/items
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "count": 3,
  "items": [
    {
      "id": 5,
      "title": "A의 비공개 메모 1",
      "body": "확인용 계정 A 전용 가상 메모입니다. B 에게 보이면 안 됩니다.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 6,
      "title": "A의 비공개 메모 2",
      "body": "확인용 계정 A 전용 두 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 7,
      "title": "A의 비공개 메모 3",
      "body": "확인용 계정 A 전용 세 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.650Z"
    }
  ]
}
```
```http
# B 의 자료
GET /api/private/items
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-b",
  "display_name": "확인용 계정 B",
  "count": 3,
  "items": [
    {
      "id": 8,
      "title": "B의 비공개 메모 1",
      "body": "확인용 계정 B 전용 가상 메모입니다. A 에게 보이면 안 됩니다.",
      "created_at": "2026-10-13T06:52:52.652Z"
    },
    {
      "id": 9,
      "title": "B의 비공개 메모 2",
      "body": "확인용 계정 B 전용 두 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.652Z"
    },
    {
      "id": 10,
      "title": "B의 비공개 메모 3",
      "body": "확인용 계정 B 전용 세 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.653Z"
    }
  ]
}
```
> **판정: 통과** — 두 계정 모두 패스키로 들어와 있고, 서로 다른 비공개 내용을 가진다

### A → B (C37)

```http
# A 세션으로 B 의 메모 #8 읽기
GET /api/private/items/8
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 404
{
  "error": "내 자료 중에 그 번호가 없습니다"
}
```
```http
# A 세션으로 B 의 메모 #8 지우기
DELETE /api/private/items/8
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 404
{
  "error": "내 자료 중에 그 번호가 없습니다"
}
```
```http
# A 세션으로 B 의 패스키 #2 지우기
DELETE /api/passkeys/2
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 404
{
  "error": "내 패스키 중에 그 번호가 없습니다"
}
```
```http
# 비교: A 세션으로 A 자신의 메모 #5 읽기 (성공 쪽)
GET /api/private/items/5
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "id": 5,
  "title": "A의 비공개 메모 1",
  "body": "확인용 계정 A 전용 가상 메모입니다. B 에게 보이면 안 됩니다.",
  "created_at": "2026-10-13T06:52:52.647Z"
}
```
> **판정: 통과** — A 가 B 의 자료를 읽기·지우기, B 의 패스키 지우기 모두 404 로 거절된다

### B → A (C38)

```http
# B 세션으로 A 의 메모 #5 읽기
GET /api/private/items/5
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 404
{
  "error": "내 자료 중에 그 번호가 없습니다"
}
```
```http
# B 세션으로 A 의 메모 #5 지우기
DELETE /api/private/items/5
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 404
{
  "error": "내 자료 중에 그 번호가 없습니다"
}
```
```http
# B 세션으로 A 의 패스키 #1 지우기
DELETE /api/passkeys/1
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 404
{
  "error": "내 패스키 중에 그 번호가 없습니다"
}
```
> **판정: 통과** — B 가 A 의 자료·패스키에 손대는 요청도 똑같이 404 로 거절된다

### 주소·본문에 다른 계정을 적어 보내기 (C40)

```http
# A 세션, 주소에 account=check-b 를 붙임
GET /api/private/items?account=check-b&user_id=3
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "count": 3,
  "items": [
    {
      "id": 5,
      "title": "A의 비공개 메모 1",
      "body": "확인용 계정 A 전용 가상 메모입니다. B 에게 보이면 안 됩니다.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 6,
      "title": "A의 비공개 메모 2",
      "body": "확인용 계정 A 전용 두 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 7,
      "title": "A의 비공개 메모 3",
      "body": "확인용 계정 A 전용 세 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.650Z"
    }
  ]
}
```
```http
# A 세션, 본문에 account=check-b 를 적어 메모 추가
POST /api/private/items
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{
  "title": "A가 B 이름으로 써 본 메모",
  "body": "본문에 account 를 B 로 적음",
  "account": "check-b",
  "user_id": 3
}

HTTP 201
{
  "account": "check-a",
  "item": {
    "id": 11,
    "title": "A가 B 이름으로 써 본 메모",
    "body": "본문에 account 를 B 로 적음",
    "created_at": "2026-10-13T06:52:57.760Z"
  }
}
```
```http
# 그 메모가 어디에 들어갔는지 A 쪽에서 확인
GET /api/private/items
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "count": 4,
  "items": [
    {
      "id": 5,
      "title": "A의 비공개 메모 1",
      "body": "확인용 계정 A 전용 가상 메모입니다. B 에게 보이면 안 됩니다.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 6,
      "title": "A의 비공개 메모 2",
      "body": "확인용 계정 A 전용 두 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 7,
      "title": "A의 비공개 메모 3",
      "body": "확인용 계정 A 전용 세 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.650Z"
    },
    {
      "id": 11,
      "title": "A가 B 이름으로 써 본 메모",
      "body": "본문에 account 를 B 로 적음",
      "created_at": "2026-10-13T06:52:57.760Z"
    }
  ]
}
```
> **판정: 통과** — 다른 계정을 적어 보내도 A 자신의 자료만 돌아오고, 새 메모도 A 에게 들어간다

### 남의 패스키로 열기: B 의 기기가 서명한 답을 A 의 패스키인 척 보내기

```http
# B 로그아웃
POST /api/logout
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{}

HTTP 200
Set-Cookie: sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0
{
  "ok": true
}
```
```http
# B-폰: 로그인용 질문 받기
POST /api/login/options
Cookie: pk_flow=****(43자, 가림)
{}

HTTP 200
Set-Cookie: pk_flow=****(43자, 가림); Path=/api; HttpOnly; SameSite=Strict; Max-Age=300
{
  "rpId": "localhost",
  "challenge": "sEeqgxTnM-yNMtrrYwsgeU469JgY6wG5Nrl2dezTZ6g",
  "timeout": 60000,
  "userVerification": "preferred"
}
```
```http
# B-폰이 서명한 답의 id 만 A-폰 패스키 id 로 바꾸고, 본문에 account=check-a 도 적음
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림)
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(324자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAg",
      "signature": "yRWBd9zewIWr0pE45rAX1dUuyKpvskCrLWGNkBA8qH-QNugCYvud-4D9eZp1WgEZ5BXAfJ6Mby4O8P3qOOHsAw",
      "userHandle": "cGstdXNlci0z"
    }
  },
  "account": "check-a"
}

HTTP 401
{
  "error": "서명 확인 실패: Response counter value 2 was lower than expected 4"
}
```
```http
# 같은 답의 서명을 두 공개키로 직접 확인 (SimpleWebAuthn 의 verifySignature)
A-폰 공개키로 확인: false
B-폰 공개키로 확인: true
```
> **판정: 통과** — B-폰의 서명은 A-폰 공개키로는 맞지 않는다

```http
# B-폰: 로그인용 질문 받기
POST /api/login/options
Cookie: pk_flow=****(43자, 가림)
{}

HTTP 200
Set-Cookie: pk_flow=****(43자, 가림); Path=/api; HttpOnly; SameSite=Strict; Max-Age=300
{
  "rpId": "localhost",
  "challenge": "rrnbvlPaQPbBrGQYDuTi4qAs3iuDL7mXqhFAOEib6TQ",
  "timeout": 60000,
  "userVerification": "preferred"
}
```
```http
# 비교: B-폰 답을 그대로 보내되 본문에 account=check-a 를 적음
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림)
{
  "response": {
    "id": "48uL2S8Ti4yKvsoCQIYuUGnq-pnh6rsxbljRTbGr85o",
    "rawId": "48uL2S8Ti4yKvsoCQIYuUGnq-pnh6rsxbljRTbGr85o",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(324자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAw",
      "signature": "akevGzxiwqWB9LmhhLTzsgWlsHuh-tIGLX8KMEJ4gqQE8lnCKW9FuLlHlUztTsUPfekzJ2FKMpFbFg-jADUoDg",
      "userHandle": "cGstdXNlci0z"
    }
  },
  "account": "check-a"
}

HTTP 200
Set-Cookie: sid=****(43자, 가림); Path=/; HttpOnly; SameSite=Strict; Max-Age=28800
{
  "ok": true,
  "account": "check-b",
  "display_name": "확인용 계정 B",
  "passkey": "B-폰"
}
```
> **판정: 통과** — 남의 패스키인 척한 답은 401, 내 패스키 답은 account 를 뭐라 적든 내 계정(check-b)으로만 열린다

### 거절 앞뒤 자료 건수 (C39)

```http
# A 의 시도들이 끝난 뒤 B 의 자료
GET /api/private/items
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-b",
  "display_name": "확인용 계정 B",
  "count": 3,
  "items": [
    {
      "id": 8,
      "title": "B의 비공개 메모 1",
      "body": "확인용 계정 B 전용 가상 메모입니다. A 에게 보이면 안 됩니다.",
      "created_at": "2026-10-13T06:52:52.652Z"
    },
    {
      "id": 9,
      "title": "B의 비공개 메모 2",
      "body": "확인용 계정 B 전용 두 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.652Z"
    },
    {
      "id": 10,
      "title": "B의 비공개 메모 3",
      "body": "확인용 계정 B 전용 세 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.653Z"
    }
  ]
}
```
```http
# B 의 시도들이 끝난 뒤 A 의 자료 (A 가 직접 1건 추가했으므로 +1)
GET /api/private/items
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "count": 4,
  "items": [
    {
      "id": 5,
      "title": "A의 비공개 메모 1",
      "body": "확인용 계정 A 전용 가상 메모입니다. B 에게 보이면 안 됩니다.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 6,
      "title": "A의 비공개 메모 2",
      "body": "확인용 계정 A 전용 두 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.647Z"
    },
    {
      "id": 7,
      "title": "A의 비공개 메모 3",
      "body": "확인용 계정 A 전용 세 번째 가상 메모.",
      "created_at": "2026-10-13T06:52:52.650Z"
    },
    {
      "id": 11,
      "title": "A가 B 이름으로 써 본 메모",
      "body": "본문에 account 를 B 로 적음",
      "created_at": "2026-10-13T06:52:57.760Z"
    }
  ]
}
```
```http
B 의 자료 건수: 거절 전 3 → 거절 뒤 3
A 의 자료 건수: 거절 전 3 → 거절 뒤 4 (A 자신이 추가한 1건 말고는 그대로)
```
> **판정: 통과** — 거절 앞뒤로 반대편 자료 건수가 같다

거절을 만드는 소스: `server/app.js` 의 `getItem`·`deleteItem`·`deletePasskey` (`WHERE id = $1 AND user_id = $2`, user_id 는 세션에서만 얻음), `listItems`·`addItem` (주소·본문의 account 를 읽지 않음), `loginVerify` (계정은 서명한 패스키의 주인으로만 정함), `requireUser` (세션 없으면 401).

## 확인 3·4. 패스키 두 개, 하나 지운 뒤 (T08-C42~C46)

```http
# 로그인한 상태에서 두 번째 기기(A-노트북)에 패스키 추가 (UI). 이때 질문에는 이미 등록한 A-폰이 excludeCredentials 로 들어감
excludeCredentials = [{"id":"HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY","transports":["internal"],"type":"public-key"}]
POST /api/register/verify → HTTP 200  {"id":3,"name":"A-노트북","created_at":"2026-10-13T06:52:59.487Z","last_used_at":null,"storage":"브라우저 가상 인증기(시험용 보안 키)","public_key_preview":"pAEBAycgBiFYIDP0VHZSTaBu…"}
```
```http
# 패스키 두 개가 있는 목록
GET /api/passkeys
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "account": "check-a",
  "current_passkey_id": 1,
  "passkeys": [
    {
      "id": 1,
      "name": "A-폰",
      "created_at": "2026-10-13T06:52:54.347Z",
      "last_used_at": "2026-10-13T06:52:57.677Z",
      "storage": "브라우저 가상 인증기(시험용 보안 키)",
      "public_key_preview": "pAEBAycgBiFYICVt_DdMKRkU…"
    },
    {
      "id": 3,
      "name": "A-노트북",
      "created_at": "2026-10-13T06:52:59.487Z",
      "last_used_at": null,
      "storage": "브라우저 가상 인증기(시험용 보안 키)",
      "public_key_preview": "pAEBAycgBiFYIDP0VHZSTaBu…"
    }
  ]
}
```
> **판정: 통과** — 한 계정에 패스키 두 개가 있고, 이름·등록 날짜가 보인다

화면: [패스키 두 개가 보이는 목록](screens/04-two-passkeys.png)

```http
# A-폰 패스키 지우기 (A-폰을 잃어버렸다고 가정)
DELETE /api/passkeys/1
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 200
{
  "ok": true,
  "remaining": 1
}
```
```http
# 로그아웃
POST /api/logout
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{}

HTTP 200
Set-Cookie: sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0
{
  "ok": true
}
```
```http
# 남은 A-노트북: 로그인용 질문 받기
POST /api/login/options
Cookie: pk_flow=****(43자, 가림)
{}

HTTP 200
Set-Cookie: pk_flow=****(43자, 가림); Path=/api; HttpOnly; SameSite=Strict; Max-Age=300
{
  "rpId": "localhost",
  "challenge": "vqWXAKi_YouxYI2ZncBGrv1e6YXLnizKQjlr2Ju19B8",
  "timeout": 60000,
  "userVerification": "preferred"
}
```
```http
# 성공 쪽: 남은 A-노트북으로 로그인
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림)
{
  "response": {
    "id": "qz7jYqlhDVgE5VWwXM1rEe3MF0soK9o4D24lAr_gcK4",
    "rawId": "qz7jYqlhDVgE5VWwXM1rEe3MF0soK9o4D24lAr_gcK4",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(179자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAg",
      "signature": "0t1n-D60WG0nQgGpk05f1RMNsd3dLr5__FNF38nZY8x8pnDFeVC69e46psSaGI-_OQhQre1RA0t79oBXhLGjDA",
      "userHandle": "cGstdXNlci0y"
    }
  }
}

HTTP 200
Set-Cookie: sid=****(43자, 가림); Path=/; HttpOnly; SameSite=Strict; Max-Age=28800
{
  "ok": true,
  "account": "check-a",
  "display_name": "확인용 계정 A",
  "passkey": "A-노트북"
}
```
> **판정: 통과** — 패스키 하나를 지운 뒤 남은 하나로 들어갈 수 있다

```http
# 지운 A-폰: 로그인용 질문 받기
POST /api/login/options
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{}

HTTP 200
Set-Cookie: pk_flow=****(43자, 가림); Path=/api; HttpOnly; SameSite=Strict; Max-Age=300
{
  "rpId": "localhost",
  "challenge": "UREDPmfdrGjZ8C-wJpDPoKKlAeGpbGBcLVt3iipCS5Q",
  "timeout": 60000,
  "userVerification": "preferred"
}
```
```http
# 거절 쪽: 지운 A-폰(기기에는 아직 개인키가 남아 있음)으로 로그인
POST /api/login/verify
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)
{
  "response": {
    "id": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "rawId": "HbyDGtZdXHE5FtrymbAWVZTIOWoW5O6COGVMJjNhDbY",
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxl…(324자)",
      "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAABQ",
      "signature": "Qb5ZieKPkP-2KbfE_ESbmahi8QMcB01sFfrbfBOpS5Vw1_KkJsq1Cw4BU0asmc8oSLDq1Bj5XgXaJwyymDAEAA",
      "userHandle": "cGstdXNlci0y"
    }
  }
}

HTTP 401
{
  "error": "등록되지 않은 패스키입니다(지웠거나 다른 곳의 패스키)"
}
```
> **판정: 통과** — 지운 패스키로는 더 이상 들어갈 수 없다

```http
# 마지막 남은 A-노트북까지 지우려는 요청
DELETE /api/passkeys/3
Cookie: pk_flow=****(43자, 가림); sid=****(43자, 가림)

HTTP 409
{
  "error": "마지막 남은 패스키는 지울 수 없습니다. 지우면 이 자리에 아무도 들어올 수 없게 됩니다. 다른 기기에서 하나 더 등록한 뒤 지우세요"
}
```
> **판정: 통과** — 마지막 남은 패스키는 지울 수 없다(409)

> **판정: 통과** — 들어간 뒤 화면에도 비밀번호 입력 칸이 없다

화면: [하나 남았을 때의 경고](screens/05-one-passkey-warning.png), [들어간 뒤 전체 페이지](screens/06-unlocked-full.png)
