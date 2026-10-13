# 나를 소개하는 한 페이지 (과제 1 → 과제 8 패스키)

- 결과물: https://1-project-nine.vercel.app — 첫 화면은 누구나 보는 공개 소개, 맨 아래 "나만 보는 자리"만 패스키로 잠겨 있습니다. 비밀번호는 없습니다.
- 코드는 `project/` 아래에 있습니다.
  - 화면: `project/src/components/PrivateZone.tsx`, `project/src/auth.ts` (과제 1 의 공개 내용은 그대로)
  - 서버: `project/server/app.js` (등록·로그인·로그아웃·비공개 자료), `project/server/db.js`, Vercel 함수 `project/api/index.js`
- 과제 8 제출문: [`project/docs/SUBMISSION-8.md`](project/docs/SUBMISSION-8.md)
- 인증 구현 설명서: [`project/docs/AUTH.md`](project/docs/AUTH.md)
- 확인 기록: [`project/docs/evidence-local.md`](project/docs/evidence-local.md)

## 로컬에서 돌리기

```
cd project
npm install
npm run build
ENROLL_CODE=아무-시험용-값 npm start          # http://localhost:3000 (DB: project/.data/pglite)
# 첫 패스키 등록: http://localhost:3000/#enroll=아무-시험용-값&account=me
ENROLL_CODE=아무-시험용-값 npm run evidence   # 빈 메모리 DB 로 서버를 띄워 확인 기록(docs/evidence-local.md) 다시 만들기
```

## 배포(Vercel) 환경변수

| 이름 | 뜻 |
|---|---|
| `DATABASE_URL` | Postgres 연결 주소 (표는 `pk_` 로 시작해 다른 과제와 섞이지 않음) |
| `ENROLL_CODE` | 패스키가 0개인 계정에 첫 패스키를 붙일 때만 쓰는 코드. 등록을 마치면 지워도 됨 |
| `ORIGINS` (선택) | 패스키를 허용할 주소 목록. 기본값 `https://1-project-nine.vercel.app,http://localhost:3000,http://localhost:5173` |
