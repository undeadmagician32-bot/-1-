// 확인 기록 만들기: 진짜 Chromium + 가상 인증기(CDP WebAuthn)로 등록·로그인·로그아웃·삭제를 해 보고,
// 요청과 응답을 docs/evidence-local.md 에, 화면을 docs/screens/ 에 남긴다. 세션·흐름 쿠키 값은 가린다.
//
//   npm run build && ENROLL_CODE=local-test-code npm run evidence
//
// BASE 를 주지 않으면 빈 메모리 DB 로 로컬 서버(localhost:3000)를 직접 띄운다.
// BASE 를 주면 그 서버를 쓰며, 그 DB 는 처음 상태(check-a·check-b 계정에 패스키 0개)여야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { decodeCredentialPublicKey, isoBase64URL, decodeClientDataJSON, verifySignature, toHash, isoUint8Array } from '@simplewebauthn/server/helpers';

const here = path.dirname(fileURLToPath(import.meta.url));
const CODE = process.env.ENROLL_CODE;
if (!CODE) throw new Error('ENROLL_CODE 가 필요합니다');
const BASE = process.env.BASE || 'http://localhost:3000';
let localServer;
if (!process.env.BASE) {
  process.env.PGLITE_DIR = 'memory';
  ({ server: localServer } = await import('../local-server.js'));
  await new Promise((r) => localServer.listen(3000, r));
}
const DOCS = path.join(here, '..', 'docs');
const SHOTS = path.join(DOCS, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

const out = [];
const w = (s = '') => out.push(s);
const results = [];
function expect(label, ok) {
  results.push([label, ok]);
  w(`> **판정: ${ok ? '통과' : '실패'}** — ${label}`);
  w();
}

// ---------- 기록 도구 ----------
const mask = (v) => String(v).replace(/(sid|pk_flow)=([^;,\s]+)/g, (_, k, val) => `${k}=****(${val.length}자, 가림)`);
function shorten(v, max = 90) {
  if (typeof v === 'string') return v.length > max ? `${v.slice(0, 40)}…(${v.length}자)` : v;
  if (Array.isArray(v)) return v.map((x) => shorten(x, max));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shorten(x, max)]));
  return v;
}
function block(lines) {
  w('```http');
  for (const l of lines) w(l);
  w('```');
}
async function call(ctx, method, url, body, { cookie, note, full } = {}) {
  const headers = { Origin: BASE };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie !== undefined) headers.Cookie = cookie;
  const reqCookie = cookie ?? (await ctx.cookies(BASE + url)).filter((c) => c.name === 'sid' || c.name === 'pk_flow').map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await ctx.request.fetch(BASE + url, {
    method, headers, data: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  const lines = [];
  if (note) lines.push(`# ${note}`);
  lines.push(`${method} ${url}`);
  if (reqCookie) lines.push(mask(`Cookie: ${reqCookie}`));
  if (body !== undefined) lines.push(JSON.stringify(full ? body : shorten(body), null, 2));
  lines.push('');
  lines.push(`HTTP ${res.status()}`);
  const sc = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
  for (const c of sc) lines.push(mask(`Set-Cookie: ${c}`));
  lines.push(typeof json === 'string' ? shorten(json, 300) : JSON.stringify(shorten(json, 120), null, 2));
  block(lines);
  return { status: res.status(), json };
}

// ---------- 가상 기기(인증기) ----------
// 한 브라우저 문맥에 인증기를 하나만 붙여 두고, '기기'를 바꿀 때는 떼었다가 그 기기의 자격증명으로 다시 붙인다.
class Devices {
  constructor(ctx, page) { this.ctx = ctx; this.page = page; this.creds = {}; this.cur = null; this.authId = null; }
  async init() {
    this.cdp = await this.ctx.newCDPSession(this.page);
    await this.cdp.send('WebAuthn.enable', { enableUI: false });
  }
  async use(name) {
    if (this.cur === name) return;
    if (this.authId) {
      const { credentials } = await this.cdp.send('WebAuthn.getCredentials', { authenticatorId: this.authId });
      this.creds[this.cur] = credentials;
      await this.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: this.authId });
    }
    const { authenticatorId } = await this.cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
        isUserVerified: true, automaticPresenceSimulation: true },
    });
    for (const c of this.creds[name] || []) await this.cdp.send('WebAuthn.addCredential', { authenticatorId, credential: c });
    this.authId = authenticatorId; this.cur = name;
  }
}

// 페이지 안에서 navigator.credentials 를 부르는 도우미 (SimpleWebAuthn 브라우저 쪽과 같은 JSON 모양으로 돌려줌)
const PAGE_HELPERS = `
window.__pk = (() => {
  const b2u = (b) => { const s = String.fromCharCode(...new Uint8Array(b)); return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); };
  const u2b = (u) => { const s = atob(u.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((u.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)).buffer; };
  return {
    async get(o) {
      const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: u2b(o.challenge),
        allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: u2b(c.id) })) } });
      const r = cred.response;
      return { id: cred.id, rawId: b2u(cred.rawId), type: cred.type, clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment,
        response: { clientDataJSON: b2u(r.clientDataJSON), authenticatorData: b2u(r.authenticatorData), signature: b2u(r.signature),
          userHandle: r.userHandle ? b2u(r.userHandle) : undefined } };
    },
  };
})();`;

async function loginVia(ctx, page, label) {
  const opt = await call(ctx, 'POST', '/api/login/options', {}, { note: `${label}: 로그인용 질문 받기` });
  const response = await page.evaluate((o) => window.__pk.get(o), opt.json);
  return { opt, response };
}

// UI 로 등록(첫 등록 링크 또는 로그인 뒤 추가)하고, 브라우저가 실제로 보낸 요청·응답을 붙잡는다.
async function uiRegister(page, { enrollAccount, name }) {
  if (enrollAccount) await page.goto(`${BASE}/#enroll=${encodeURIComponent(CODE)}&account=${enrollAccount}`);
  const optRes = page.waitForResponse((r) => r.url().endsWith('/api/register/options'));
  const verReq = page.waitForRequest((r) => r.url().endsWith('/api/register/verify'));
  const verRes = page.waitForResponse((r) => r.url().endsWith('/api/register/verify'));
  const box = page.locator('section[aria-labelledby="private-heading"]');
  await box.getByLabel(/패스키 이름/).fill(name);
  await box.getByRole('button', { name: enrollAccount ? /이 기기에 패스키 만들기/ : /^패스키 추가$/ }).click();
  const o = await optRes; const rq = await verReq; const rs = await verRes;
  await page.getByText(`패스키 "${name}"를 등록했습니다`).waitFor();
  return { options: await o.json(), optionsHeaders: o.headers(), verifyBody: JSON.parse(rq.postData()), verifyReqHeaders: await rq.allHeaders(), verifyStatus: rs.status(), verify: await rs.json() };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const newCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript(PAGE_HELPERS);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  const dev = new Devices(ctx, page); await dev.init();
  return { ctx, page, dev };
};
const cookieOf = async (ctx, name) => (await ctx.cookies(BASE)).find((c) => c.name === name);

w('# 패스키 확인 기록 (로컬, 진짜 Chromium + 가상 인증기)');
w();
w(`- 대상: ${BASE} (배포본과 같은 코드, DB 는 PGlite = Postgres 엔진) · 실행 시각(UTC): ${new Date().toISOString()}`);
w('- 계정: `check-a`(확인용 A), `check-b`(확인용 B). 둘 다 만들어 넣은 내용만 들어 있습니다.');
w('- 기기: Chromium 의 가상 인증기(CDP WebAuthn). 실제 기기처럼 기기 안에서 열쇠 쌍을 만들고 개인키로 서명합니다. "A-폰", "A-노트북", "B-폰"은 서로 다른 가상 기기입니다.');
w('- 가림: `sid`(세션)·`pk_flow`(질문 짝 쿠키) 값은 `****(길이, 가림)`으로 바꿨습니다. 긴 base64url 값은 앞 40자만 적고 길이를 붙였습니다.');
w('- 이 파일은 `node scripts/evidence.mjs` 가 자동으로 만들었습니다.');
w();

const A = await newCtx();
const B = await newCtx();
const SEED_A = ['A의 비공개 메모 1', 'A의 비공개 메모 2', 'A의 비공개 메모 3'];
const SEED_ME = ['준비 중인 프로젝트 메모', '지원하려는 곳 목록', '스스로 쓰는 회고'];

// ===== 1. 로그인 없이 =====
w('## 확인 1. 패스키 없이 열기 (T08-C15·C16·C17·C18)');
w();
const html = await (await A.ctx.request.get(BASE + '/')).text();
const js = (html.match(/src="(\/assets\/[^"]+\.js)"/) || [])[1];
const jsText = js ? await (await A.ctx.request.get(BASE + js)).text() : '';
const leaked = [...SEED_A, ...SEED_ME, 'B의 비공개 메모'].filter((s) => html.includes(s) || jsText.includes(s));
w('로그인하지 않은 채 받은 첫 화면 HTML 과, 그 HTML 이 불러오는 JS 묶음 전체에서 비공개 메모 제목을 찾아봤습니다.');
w();
block([`GET /`, '', `HTTP 200 (본문 ${html.length}자)`, html.replace(/\n\s*/g, ' ').slice(0, 600) + ' …',
  '', `GET ${js}  (본문 ${jsText.length}자)`, `찾은 비공개 문구: ${leaked.length ? leaked.join(', ') : '없음'}`]);
expect('로그인 없이 받은 페이지 소스(HTML·JS)에 비공개 내용이 없다', leaked.length === 0 && html.length > 0);
await A.page.screenshot({ path: path.join(SHOTS, '01-public-and-locked.png'), fullPage: true });
const pwInputs = await A.page.locator('input[type="password"]').count();
w(`화면 전체의 비밀번호 입력 칸(input type=password) 수: ${pwInputs}`);
w();
expect('어디에도 비밀번호 입력 칸이 없다', pwInputs === 0);
await A.page.locator('section[aria-labelledby="private-heading"]').screenshot({ path: path.join(SHOTS, '02-locked-zone.png') });
w('화면: [전체 페이지(공개 영역 + 잠긴 비공개 자리)](screens/01-public-and-locked.png), [잠긴 자리만](screens/02-locked-zone.png)');
w();
const anon1 = await call(A.ctx, 'GET', '/api/private/items', undefined, { note: '쿠키 없이 비공개 자료 직접 요청' });
const anon2 = await call(A.ctx, 'GET', '/api/private/items/1', undefined, { note: '쿠키 없이 비공개 자료 한 건 직접 요청' });
const anon3 = await call(A.ctx, 'GET', '/api/passkeys', undefined, { note: '쿠키 없이 패스키 목록 요청' });
const anon4 = await call(A.ctx, 'GET', '/api/private/items', undefined, { cookie: 'sid=made-up-session-value', note: '지어낸 세션 값으로 요청' });
expect('로그인 없이 직접 요청하면 401 로 거절된다', [anon1, anon2, anon3, anon4].every((r) => r.status === 401));

// ===== 2. 등록 =====
w('## 카드 2. 패스키 등록 (T08-C19~C26)');
w();
w('### 등록용 질문이 매번 다르다 (C19·C20)');
w();
const wrong = await call(A.ctx, 'POST', '/api/register/options', { account: 'check-a', enrollCode: 'wrong-code' }, { note: '틀린 등록 코드로 첫 등록용 질문 요청' });
expect('올바른 등록 링크 없이는 첫 등록용 질문도 주지 않는다(403)', wrong.status === 403);
const chs = [];
for (let i = 1; i <= 3; i++) {
  const r = await A.ctx.request.fetch(BASE + '/api/register/options', { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify({ account: 'check-a', enrollCode: CODE }) });
  chs.push((await r.json()).challenge);
}
block(['# 올바른 등록 링크로 등록용 질문을 세 번 받음 (요청 본문의 enrollCode 는 기록에서 뺌)', ...chs.map((c, i) => `POST /api/register/options  → HTTP 200  challenge #${i + 1} = ${c}`)]);
expect('등록 요청마다 질문 값이 서로 다르다', new Set(chs).size === 3);
w('서버는 질문을 `pk_challenges` 표에 (질문, 용도, 계정, 만료 시각=5분 뒤, 받은 브라우저와 짝인 쿠키의 해시) 로 보관하고, 답을 확인할 때 `used_at` 을 채워 다시 못 쓰게 합니다 (`server/app.js` 의 `saveChallenge`, `consumeChallenge`).');
w();

w('### UI 로 첫 패스키 등록: A-폰 (C21·C23·C24)');
w();
await A.dev.use('A-폰');
const regA1 = await uiRegister(A.page, { enrollAccount: 'check-a', name: 'A-폰' });
block([
  '# 브라우저가 실제로 보낸 등록 확인 요청 (UI 에서 버튼을 눌렀을 때 붙잡음)',
  'POST /api/register/verify',
  JSON.stringify(shorten(regA1.verifyBody), null, 2),
  '', `HTTP ${regA1.verifyStatus}`, JSON.stringify(shorten(regA1.verify, 200), null, 2),
]);
const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
const bodyKeys = keys(regA1.verifyBody);
w(`등록 요청 본문에 들어 있는 칸 전체: \`${bodyKeys.join('`, `')}\``);
w();
w('- `response.response.publicKey` 는 **공개키**(SPKI), `response.response.attestationObject` 안에도 같은 공개키(COSE)가 들어 있습니다. `response.response.clientDataJSON` 은 서버의 질문·출처, `name` 은 사람이 붙인 이름입니다.');
w('- 개인키(private key)를 담는 칸은 없습니다. 개인키는 가상 기기 안에만 있고, 기기는 그 개인키로 만든 결과(서명·공개키)만 내보냅니다.');
w();
const cd = decodeClientDataJSON(regA1.verifyBody.response.response.clientDataJSON);
block(['# 등록 요청 안의 clientDataJSON 을 풀어 본 것', JSON.stringify(cd, null, 2)]);
expect('등록 요청 본문에 개인키 칸이 없다', !bodyKeys.some((k) => /priv|secret|password|^d$/i.test(k.split('.').pop())));
expect('clientDataJSON 의 질문이 서버가 준 질문과 같다', cd.challenge === regA1.options.challenge);
w('### 서버에 저장된 값 (C21·C22·C26)');
w();
const cose = decodeCredentialPublicKey(isoBase64URL.toBuffer(regA1.verify.stored.public_key_cose));
const coseView = Object.fromEntries([...cose.entries()].map(([k, v]) => [k, v instanceof Uint8Array ? isoBase64URL.fromBuffer(v) : v]));
block([
  '# pk_passkeys 표에 저장된 값 (등록 응답의 stored 칸 = DB 에 넣은 값 그대로)',
  `credential_id   = ${regA1.verify.stored.credential_id}`,
  `public_key(COSE)= ${regA1.verify.stored.public_key_cose}`,
  `aaguid          = ${regA1.verify.stored.aaguid}`,
  '',
  '# public_key 를 COSE 로 풀어 본 것',
  ...(coseView[1] === 1
    ? [`1(kty)=1 (OKP)  3(alg)=${coseView[3]} (-8 = EdDSA)  -1(crv)=${coseView[-1]} (6 = Ed25519)`, `-2(x)=${coseView[-2]}`,
      '→ Ed25519 공개키 x(32바이트) 하나뿐입니다. 개인키 성분(-4, d)이 없으므로 이 값으로는 서명을 만들 수 없고, 서명을 "확인"만 할 수 있습니다.']
    : [`1(kty)=${coseView[1]} (2 = EC2)  3(alg)=${coseView[3]} (-7 = ES256)  -1(crv)=${coseView[-1]} (1 = P-256)`, `-2(x)=${coseView[-2]}`, `-3(y)=${coseView[-3]}`,
      '→ 점 (x, y) 하나뿐인 공개키입니다. 개인키 성분(-4, d)이 없으므로 이 값으로는 서명을 만들 수 없고, 서명을 "확인"만 할 수 있습니다.']),
  `COSE 안의 칸 번호 전체: ${Object.keys(coseView).join(', ')}  (개인키 칸 -4 없음)`,
]);
expect('저장된 값이 공개키이고 개인키 성분(COSE -4, d)이 없다', !!coseView[-2] && coseView[-4] === undefined && [1, 2].includes(coseView[1]));
w('비밀번호와 다른 점: 비밀번호는 서버가 받은 값과 저장된 해시를 비교하므로, 저장소가 새면 대입 공격 재료가 됩니다. 공개키는 처음부터 공개돼도 되는 값이라, 이 값이 새어도 그것만으로는 들어올 수 없습니다.');
w();
expect('등록 직후 첫 등록 계정은 세션 쿠키를 받는다', !!(await cookieOf(A.ctx, 'sid')));

w('### 이름·저장 위치가 보이는 목록 (C24·C26)');
w();
await call(A.ctx, 'GET', '/api/passkeys', undefined, { note: 'A-폰으로 들어간 상태에서 패스키 목록' });

w('### 등록 취소 (C25)');
w();
const before = (await (await A.ctx.request.get(BASE + '/api/passkeys')).json()).passkeys.length;
await A.page.evaluate(() => {
  window.__origCreate = navigator.credentials.create.bind(navigator.credentials);
  navigator.credentials.create = () => Promise.reject(new DOMException('사용자가 취소함', 'NotAllowedError'));
});
const reqLog = [];
const onReq = (r) => { if (r.url().includes('/api/')) reqLog.push(`${r.method()} ${new URL(r.url()).pathname}`); };
A.page.on('request', onReq);
await A.page.locator('section[aria-labelledby="private-heading"]').getByLabel(/패스키 이름/).fill('취소해 볼 패스키');
await A.page.getByRole('button', { name: /^패스키 추가$/ }).click();
const cancelMsg = await A.page.getByRole('alert').textContent();
A.page.off('request', onReq);
await A.page.evaluate(() => { navigator.credentials.create = window.__origCreate; });
await A.page.locator('section[aria-labelledby="private-heading"]').screenshot({ path: path.join(SHOTS, '03-register-cancelled.png') });
const after = (await (await A.ctx.request.get(BASE + '/api/passkeys')).json()).passkeys.length;
block(['# 패스키 창에서 [취소]를 누른 경우 (navigator.credentials.create 가 NotAllowedError 로 끝나게 함)',
  `브라우저가 보낸 API 요청: ${reqLog.join(', ')}   ← verify 요청은 가지 않음`,
  `화면 안내: ${cancelMsg}`, `등록 전 패스키 수 ${before} → 취소 뒤 ${after}`]);
w('화면: [취소 안내](screens/03-register-cancelled.png)');
w();
expect('등록을 취소하면 안내가 나오고 서버에 아무것도 저장되지 않는다', /취소/.test(cancelMsg) && before === after && !reqLog.some((l) => l.includes('verify')));

// ===== 3. 로그인 =====
w('## 카드 3. 패스키로 들어가기 (T08-C27~C35)');
w();
w('### 로그인용 질문이 매번 다르다 (C27·C28)');
w();
const lch = [];
for (let i = 0; i < 3; i++) lch.push((await (await A.ctx.request.fetch(BASE + '/api/login/options', { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: '{}' })).json()).challenge);
block(lch.map((c, i) => `POST /api/login/options  → HTTP 200  challenge #${i + 1} = ${c}`));
expect('로그인 요청마다 질문 값이 서로 다르다', new Set(lch).size === 3);

await call(A.ctx, 'POST', '/api/logout', {}, { note: '먼저 로그아웃' });
w('### 서명 확인: 성공한 요청과 실패한 요청 나란히 (C29·C30)');
w();
const okLogin = await loginVia(A.ctx, A.page, 'A-폰');
const okRes = await call(A.ctx, 'POST', '/api/login/verify', { response: okLogin.response }, { note: '성공: A-폰이 개인키로 서명한 답을 그대로 보냄' });
expect('올바른 서명은 200 으로 통과하고 세션이 생긴다', okRes.status === 200 && okRes.json.account === 'check-a');
const sidAfterLogin = (await cookieOf(A.ctx, 'sid')).value;
// 틀린 서명: 새 질문으로 서명받은 뒤 서명 바이트 하나를 바꿈
const badLogin = await loginVia(A.ctx, A.page, 'A-폰(서명 변조용)');
const sig = Buffer.from(isoBase64URL.toBuffer(badLogin.response.response.signature));
sig[sig.length - 5] ^= 0x01;
const tampered = { ...badLogin.response, response: { ...badLogin.response.response, signature: isoBase64URL.fromBuffer(sig) } };
const badRes = await call(A.ctx, 'POST', '/api/login/verify', { response: tampered }, { note: '실패: 같은 기기의 답이지만 서명 바이트 1개를 바꿔서 보냄' });
expect('서명을 1바이트 바꾸면 401 로 거절된다(서명을 실제로 공개키로 확인함)', badRes.status === 401);

w('### 이미 쓴 질문 재사용 (C31)');
w();
const replay = await call(A.ctx, 'POST', '/api/login/verify', { response: okLogin.response }, { note: '위에서 성공한 로그인 답(같은 질문·같은 서명)을 한 번 더 보냄' });
expect('이미 쓴 질문으로 다시 로그인하면 거절된다', replay.status === 400 && /이미 쓴 질문/.test(replay.json.error));
const replay2 = await call(A.ctx, 'POST', '/api/login/verify', { response: tampered }, { note: '서명이 틀려 실패했던 답의 질문도 다시 못 씀(실패해도 질문은 소모됨)' });
expect('실패한 시도의 질문도 다시 쓸 수 없다', replay2.status === 400);

w('### 로그인 뒤 사람을 알아보는 방법 (C32·C34)');
w();
w('- **세션**입니다. 로그인에 성공하면 서버가 무작위 32바이트 값을 만들어 `sid` 쿠키(HttpOnly, SameSite=Strict, 배포에서는 Secure, 8시간)로 주고, DB `pk_sessions` 에는 그 값의 SHA-256 만 둡니다. 토큰(JWT 등)은 쓰지 않습니다.');
w('- 이 기록의 모든 `sid`·`pk_flow` 값은 가렸습니다.');
w();
const inA = await call(A.ctx, 'GET', '/api/private/items', undefined, { note: 'A 세션으로 비공개 자료 조회 (성공 쪽)' });
expect('A 세션으로는 A 의 비공개 메모 3개를 받는다', inA.status === 200 && inA.json.count === 3);

w('### 로그아웃 뒤 같은 세션 값으로 다시 요청 (C33)');
w();
await call(A.ctx, 'POST', '/api/logout', {}, { note: '로그아웃 (서버에서 세션 행 삭제)' });
const afterLogout = await call(A.ctx, 'GET', '/api/private/items', undefined, { cookie: `sid=${sidAfterLogin}`, note: '로그아웃 전에 쓰던 sid 값을 그대로 다시 보냄' });
expect('로그아웃 뒤 같은 세션 값은 401 로 거절된다', afterLogout.status === 401);

// ===== 4. 계정 두 개 =====
w('## 확인 2. 남의 패스키·남의 자료 (T08-C36~C41)');
w();
await B.dev.use('B-폰');
const regB = await uiRegister(B.page, { enrollAccount: 'check-b', name: 'B-폰' });
block([`# check-b 계정에 B-폰 패스키 등록 (UI)`, `POST /api/register/verify → HTTP ${regB.verifyStatus}  ${JSON.stringify(shorten(regB.verify.passkey))}`]);
const reuseReal = await A.ctx.request.fetch(BASE + '/api/register/options', { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify({ account: 'check-b', enrollCode: CODE }) });
block(['# 같은 요청을 올바른 코드로 보냈을 때', `POST /api/register/options {"account":"check-b","enrollCode":"(가림)"}`, '', `HTTP ${reuseReal.status()}`, await reuseReal.text()]);
expect('이미 패스키가 있는 계정은 등록 링크로 새 패스키를 붙일 수 없다(403)', reuseReal.status() === 403);

await A.dev.use('A-폰');
const la = await loginVia(A.ctx, A.page, 'A 다시 로그인');
await call(A.ctx, 'POST', '/api/login/verify', { response: la.response }, { note: 'A-폰으로 다시 로그인' });

const aItems = await call(A.ctx, 'GET', '/api/private/items', undefined, { note: 'A 의 자료' });
const bItems = await call(B.ctx, 'GET', '/api/private/items', undefined, { note: 'B 의 자료' });
expect('두 계정 모두 패스키로 들어와 있고, 서로 다른 비공개 내용을 가진다',
  aItems.json.account === 'check-a' && bItems.json.account === 'check-b' && aItems.json.items.every((x) => !bItems.json.items.some((y) => y.title === x.title)));
const aId = aItems.json.items[0].id; const bId = bItems.json.items[0].id;
const bPk = (await (await B.ctx.request.get(BASE + '/api/passkeys')).json()).passkeys[0].id;
const aPk = (await (await A.ctx.request.get(BASE + '/api/passkeys')).json()).passkeys[0].id;

w('### A → B (C37)');
w();
const bCount0 = bItems.json.count;
const a2b1 = await call(A.ctx, 'GET', `/api/private/items/${bId}`, undefined, { note: `A 세션으로 B 의 메모 #${bId} 읽기` });
const a2b2 = await call(A.ctx, 'DELETE', `/api/private/items/${bId}`, undefined, { note: `A 세션으로 B 의 메모 #${bId} 지우기` });
const a2b3 = await call(A.ctx, 'DELETE', `/api/passkeys/${bPk}`, undefined, { note: `A 세션으로 B 의 패스키 #${bPk} 지우기` });
const okOwn = await call(A.ctx, 'GET', `/api/private/items/${aId}`, undefined, { note: `비교: A 세션으로 A 자신의 메모 #${aId} 읽기 (성공 쪽)` });
expect('A 가 B 의 자료를 읽기·지우기, B 의 패스키 지우기 모두 404 로 거절된다', [a2b1, a2b2, a2b3].every((r) => r.status === 404) && okOwn.status === 200);

w('### B → A (C38)');
w();
const aCount0 = aItems.json.count;
const b2a1 = await call(B.ctx, 'GET', `/api/private/items/${aId}`, undefined, { note: `B 세션으로 A 의 메모 #${aId} 읽기` });
const b2a2 = await call(B.ctx, 'DELETE', `/api/private/items/${aId}`, undefined, { note: `B 세션으로 A 의 메모 #${aId} 지우기` });
const b2a3 = await call(B.ctx, 'DELETE', `/api/passkeys/${aPk}`, undefined, { note: `B 세션으로 A 의 패스키 #${aPk} 지우기` });
expect('B 가 A 의 자료·패스키에 손대는 요청도 똑같이 404 로 거절된다', [b2a1, b2a2, b2a3].every((r) => r.status === 404));

w('### 주소·본문에 다른 계정을 적어 보내기 (C40)');
w();
const q1 = await call(A.ctx, 'GET', '/api/private/items?account=check-b&user_id=3', undefined, { note: 'A 세션, 주소에 account=check-b 를 붙임' });
const p1 = await call(A.ctx, 'POST', '/api/private/items', { title: 'A가 B 이름으로 써 본 메모', body: '본문에 account 를 B 로 적음', account: 'check-b', user_id: 3 }, { note: 'A 세션, 본문에 account=check-b 를 적어 메모 추가' });
const q2 = await call(A.ctx, 'GET', '/api/private/items', undefined, { note: '그 메모가 어디에 들어갔는지 A 쪽에서 확인' });
expect('다른 계정을 적어 보내도 A 자신의 자료만 돌아오고, 새 메모도 A 에게 들어간다',
  q1.json.account === 'check-a' && q1.json.items.every((x) => x.title.startsWith('A')) && p1.json.account === 'check-a' && q2.json.count === aCount0 + 1);

w('### 남의 패스키로 열기: B 의 기기가 서명한 답을 A 의 패스키인 척 보내기');
w();
await B.dev.use('B-폰');
await call(B.ctx, 'POST', '/api/logout', {}, { note: 'B 로그아웃' });
const lb = await loginVia(B.ctx, B.page, 'B-폰');
const aCred = regA1.verify.stored.credential_id;
const fake = { ...lb.response, id: aCred, rawId: aCred };
const fakeRes = await call(B.ctx, 'POST', '/api/login/verify', { response: fake, account: 'check-a' }, { note: 'B-폰이 서명한 답의 id 만 A-폰 패스키 id 로 바꾸고, 본문에 account=check-a 도 적음' });
// 서버는 위 요청을 서명 확인 과정에서 거절한다. 같은 답의 서명을 A-폰 공개키로 직접 확인해 본 결과도 남긴다.
const signed = isoUint8Array.concat([isoBase64URL.toBuffer(lb.response.response.authenticatorData), await toHash(isoBase64URL.toBuffer(lb.response.response.clientDataJSON))]);
const withA = await verifySignature({ signature: isoBase64URL.toBuffer(lb.response.response.signature), data: signed, credentialPublicKey: isoBase64URL.toBuffer(regA1.verify.stored.public_key_cose) });
const withB = await verifySignature({ signature: isoBase64URL.toBuffer(lb.response.response.signature), data: signed, credentialPublicKey: isoBase64URL.toBuffer(regB.verify.stored.public_key_cose) });
block(['# 같은 답의 서명을 두 공개키로 직접 확인 (SimpleWebAuthn 의 verifySignature)', `A-폰 공개키로 확인: ${withA}`, `B-폰 공개키로 확인: ${withB}`]);
expect('B-폰의 서명은 A-폰 공개키로는 맞지 않는다', withA === false && withB === true);
const lb2 = await loginVia(B.ctx, B.page, 'B-폰');
const realB = await call(B.ctx, 'POST', '/api/login/verify', { response: lb2.response, account: 'check-a' }, { note: '비교: B-폰 답을 그대로 보내되 본문에 account=check-a 를 적음' });
expect('남의 패스키인 척한 답은 401, 내 패스키 답은 account 를 뭐라 적든 내 계정(check-b)으로만 열린다', fakeRes.status === 401 && realB.status === 200 && realB.json.account === 'check-b');

w('### 거절 앞뒤 자료 건수 (C39)');
w();
const bCount1 = (await call(B.ctx, 'GET', '/api/private/items', undefined, { note: 'A 의 시도들이 끝난 뒤 B 의 자료' })).json.count;
const aCount1 = (await call(A.ctx, 'GET', '/api/private/items', undefined, { note: 'B 의 시도들이 끝난 뒤 A 의 자료 (A 가 직접 1건 추가했으므로 +1)' })).json.count;
block([`B 의 자료 건수: 거절 전 ${bCount0} → 거절 뒤 ${bCount1}`, `A 의 자료 건수: 거절 전 ${aCount0} → 거절 뒤 ${aCount1} (A 자신이 추가한 1건 말고는 그대로)`]);
expect('거절 앞뒤로 반대편 자료 건수가 같다', bCount0 === bCount1 && aCount1 === aCount0 + 1);
w('거절을 만드는 소스: `server/app.js` 의 `getItem`·`deleteItem`·`deletePasskey` (`WHERE id = $1 AND user_id = $2`, user_id 는 세션에서만 얻음), `listItems`·`addItem` (주소·본문의 account 를 읽지 않음), `loginVerify` (계정은 서명한 패스키의 주인으로만 정함), `requireUser` (세션 없으면 401).');
w();

// ===== 5. 기기 분실 대비 =====
w('## 확인 3·4. 패스키 두 개, 하나 지운 뒤 (T08-C42~C46)');
w();
await A.dev.use('A-노트북');
await A.page.goto(BASE + '/');
await A.page.getByText('check-a) 으로 들어와 있습니다').waitFor();
const regA2 = await uiRegister(A.page, { name: 'A-노트북' });
block(['# 로그인한 상태에서 두 번째 기기(A-노트북)에 패스키 추가 (UI). 이때 질문에는 이미 등록한 A-폰이 excludeCredentials 로 들어감',
  `excludeCredentials = ${JSON.stringify(shorten(regA2.options.excludeCredentials))}`,
  `POST /api/register/verify → HTTP ${regA2.verifyStatus}  ${JSON.stringify(shorten(regA2.verify.passkey))}`]);
const list2 = await call(A.ctx, 'GET', '/api/passkeys', undefined, { note: '패스키 두 개가 있는 목록' });
expect('한 계정에 패스키 두 개가 있고, 이름·등록 날짜가 보인다', list2.json.passkeys.length === 2 && list2.json.passkeys.every((p) => p.name && p.created_at));
await A.page.locator('section[aria-labelledby="private-heading"]').screenshot({ path: path.join(SHOTS, '04-two-passkeys.png') });
w('화면: [패스키 두 개가 보이는 목록](screens/04-two-passkeys.png)');
w();
const phone = list2.json.passkeys.find((p) => p.name === 'A-폰');
await call(A.ctx, 'DELETE', `/api/passkeys/${phone.id}`, undefined, { note: 'A-폰 패스키 지우기 (A-폰을 잃어버렸다고 가정)' });
await call(A.ctx, 'POST', '/api/logout', {}, { note: '로그아웃' });
const lnb = await loginVia(A.ctx, A.page, '남은 A-노트북');
const lnbRes = await call(A.ctx, 'POST', '/api/login/verify', { response: lnb.response }, { note: '성공 쪽: 남은 A-노트북으로 로그인' });
expect('패스키 하나를 지운 뒤 남은 하나로 들어갈 수 있다', lnbRes.status === 200);
await A.dev.use('A-폰');
const lph = await loginVia(A.ctx, A.page, '지운 A-폰');
const lphRes = await call(A.ctx, 'POST', '/api/login/verify', { response: lph.response }, { note: '거절 쪽: 지운 A-폰(기기에는 아직 개인키가 남아 있음)으로 로그인' });
expect('지운 패스키로는 더 이상 들어갈 수 없다', lphRes.status === 401);
const last = (await (await A.ctx.request.get(BASE + '/api/passkeys')).json()).passkeys;
const lastDel = await call(A.ctx, 'DELETE', `/api/passkeys/${last[0].id}`, undefined, { note: '마지막 남은 A-노트북까지 지우려는 요청' });
expect('마지막 남은 패스키는 지울 수 없다(409)', lastDel.status === 409);
await A.dev.use('A-노트북');
await A.page.goto(BASE + '/');
await A.page.getByText('check-a) 으로 들어와 있습니다').waitFor();
await A.page.locator('section[aria-labelledby="private-heading"]').screenshot({ path: path.join(SHOTS, '05-one-passkey-warning.png') });
await A.page.screenshot({ path: path.join(SHOTS, '06-unlocked-full.png'), fullPage: true });
expect('들어간 뒤 화면에도 비밀번호 입력 칸이 없다', (await A.page.locator('input[type="password"]').count()) === 0);
w('화면: [하나 남았을 때의 경고](screens/05-one-passkey-warning.png), [들어간 뒤 전체 페이지](screens/06-unlocked-full.png)');
w();

await browser.close();
localServer?.close();

const failed = results.filter(([, ok]) => !ok);
out.splice(7, 0, `- 결과: 판정 ${results.length}건 중 ${results.length - failed.length}건 통과${failed.length ? ` / 실패: ${failed.map(([l]) => l).join('; ')}` : ''}`, '');
fs.writeFileSync(path.join(DOCS, 'evidence-local.md'), out.join('\n'));
console.log(`판정 ${results.length}건 중 ${results.length - failed.length}건 통과`);
for (const [l, ok] of results) console.log(ok ? '  ✓' : '  ✗', l);
process.exit(failed.length ? 1 : 0);
