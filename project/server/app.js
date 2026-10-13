// 패스키 API. 로컬 서버(local-server.js)와 Vercel 함수(api/index.js)가 같이 쓴다.
// 서버 쪽 패스키 검증은 SimpleWebAuthn(@simplewebauthn/server)에 맡기고,
// 질문 보관·일회용 처리·세션·계정별 자료 분리는 이 파일에서 직접 한다.
import crypto from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL, decodeClientDataJSON } from '@simplewebauthn/server/helpers';
import { query, ensureSchema } from './db.js';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const RP_NAME = '나를 소개하는 한 페이지';
const CHALLENGE_TTL_SEC = 5 * 60; // 질문은 5분 동안만 보관
const SESSION_TTL_SEC = 8 * 60 * 60; // 세션은 8시간
// 패스키를 허용할 주소. ORIGINS 로 직접 정할 수 있고, Vercel 에서는 그 배포의 주소(운영·브랜치·이번 배포)를 자동으로 더한다.
const ORIGINS = [
  ...(process.env.ORIGINS || 'https://1-project-nine.vercel.app,http://localhost:3000,http://localhost:5173').split(','),
  ...['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL', 'VERCEL_URL']
    .map((k) => process.env[k]).filter(Boolean).map((h) => `https://${h}`),
].map((s) => s.trim()).filter(Boolean);

// 패스키가 어디에 저장됐는지 AAGUID(인증기 종류 번호)로 짐작한다.
const AAGUID_NAMES = {
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google 비밀번호 관리자',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome 프로필(Mac 기기 자체)',
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud 키체인',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello(기기 자체)',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello(기기 자체)',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello(기기 자체)',
  '53414d53-554e-4700-0000-000000000000': 'Samsung Pass',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '01020304-0506-0708-0102-030405060708': '브라우저 가상 인증기(시험용 보안 키)',
};
export function storageOf(p) {
  if (AAGUID_NAMES[p.aaguid]) return AAGUID_NAMES[p.aaguid];
  const t = (p.transports || '').split(',');
  if (t.includes('usb') || t.includes('nfc')) return '보안 키(추정)';
  return p.backed_up ? '동기화되는 패스키 관리자(종류 모름)' : '기기 자체(추정)';
}

// ---------- 작은 도구 ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookie(name, value, origin, maxAge, path = '/') {
  const secure = origin.startsWith('https://') ? '; Secure' : '';
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function sendJson(res, status, obj, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100_000) throw new HttpError(413, '요청 본문이 너무 큽니다');
    }
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'JSON 형식이 아닙니다'); }
}

// 상태를 바꾸는 요청은 허용한 출처(Origin)에서 온 것만 받는다. 그 출처가 곧 패스키의 RP ID 가 된다.
function originOf(req, { required }) {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) return o;
  if (!required) {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
    const guess = `${proto}://${host}`;
    if (ORIGINS.includes(guess)) return guess;
    return ORIGINS[0];
  }
  throw new HttpError(403, '허용하지 않은 출처에서 온 요청입니다');
}

// ---------- 세션 ----------
async function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const rows = await query(
    `SELECT u.id, u.account, u.display_name, s.passkey_id FROM pk_sessions s JOIN pk_users u ON u.id = s.user_id
      WHERE s.id_hash = $1 AND s.expires_at > now()`, [sha256(sid)]);
  return rows[0] || null;
}
async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, '패스키로 들어가야 볼 수 있습니다');
  return u;
}
async function startSession(userId, passkeyId, origin) {
  const sid = randomToken();
  await query(
    `INSERT INTO pk_sessions (id_hash, user_id, passkey_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [sha256(sid), userId, passkeyId, SESSION_TTL_SEC]);
  return cookie('sid', sid, origin, SESSION_TTL_SEC);
}

// ---------- 일회용 질문(challenge) ----------
async function saveChallenge(challenge, purpose, userId, mode, origin) {
  const flow = randomToken();
  await query(
    `INSERT INTO pk_challenges (challenge, purpose, user_id, mode, flow_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [challenge, purpose, userId, mode, sha256(flow), CHALLENGE_TTL_SEC]);
  // 질문을 받은 그 브라우저에서만 답할 수 있도록, 질문과 짝인 값을 쿠키로 묶어 둔다.
  return cookie('pk_flow', flow, origin, CHALLENGE_TTL_SEC, '/api');
}

// 기기가 서명한 clientDataJSON 안의 질문을 꺼내, 서버에 보관된 것인지 확인하고 즉시 '사용함'으로 바꾼다.
// 서명 확인 전에 먼저 소모하므로, 서명이 틀린 시도도 그 질문을 다시 쓸 수 없다.
async function consumeChallenge(req, response, purpose) {
  let challenge;
  try { challenge = decodeClientDataJSON(response.response.clientDataJSON).challenge; } catch {
    throw new HttpError(400, '응답 형식이 올바르지 않습니다');
  }
  const rows = await query('SELECT *, expires_at <= now() AS expired FROM pk_challenges WHERE challenge = $1 AND purpose = $2', [challenge, purpose]);
  const row = rows[0];
  if (!row) throw new HttpError(400, '서버가 보낸 적 없는 질문입니다');
  if (row.used_at) throw new HttpError(400, '이미 쓴 질문입니다. 새 질문을 받아 다시 시도하세요');
  if (row.expired) throw new HttpError(400, '시간이 지난 질문입니다. 새 질문을 받아 다시 시도하세요');
  const flow = parseCookies(req).pk_flow;
  if (!flow || sha256(flow) !== row.flow_hash) throw new HttpError(400, '이 브라우저에서 받은 질문이 아닙니다');
  const used = await query('UPDATE pk_challenges SET used_at = now() WHERE challenge = $1 AND used_at IS NULL RETURNING challenge', [challenge]);
  if (!used.length) throw new HttpError(400, '이미 쓴 질문입니다. 새 질문을 받아 다시 시도하세요');
  // 다 쓴 지 오래된 질문은 정리
  await query("DELETE FROM pk_challenges WHERE expires_at < now() - interval '1 day'");
  return row;
}

const passkeyView = (p) => ({
  id: p.id,
  name: p.name,
  created_at: new Date(p.created_at).toISOString(),
  last_used_at: p.last_used_at ? new Date(p.last_used_at).toISOString() : null,
  storage: storageOf(p),
  public_key_preview: p.public_key.slice(0, 24) + '…',
});

function enrollCodeOk(code) {
  const want = process.env.ENROLL_CODE;
  if (!want) return false;
  if (typeof code !== 'string' || !code) return false;
  return crypto.timingSafeEqual(Buffer.from(sha256(code), 'hex'), Buffer.from(sha256(want), 'hex'));
}

function cleanName(v, fallback) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > 40) throw new HttpError(400, '패스키 이름은 40자 이하로 적어 주세요');
  return s || fallback;
}

// ---------- 흐름 1: 등록 ----------
async function registerOptions(req, res) {
  const origin = originOf(req, { required: true });
  const body = await readJson(req);
  let user = await currentUser(req);
  let mode = 'add';
  if (!user) {
    // 처음 등록(패스키가 0개인 계정)은 운영자가 정해 둔 등록 코드가 있어야 한다.
    if (!enrollCodeOk(body.enrollCode)) throw new HttpError(403, '첫 등록에는 올바른 등록 링크가 필요합니다');
    const rows = await query('SELECT id, account, display_name FROM pk_users WHERE account = $1', [String(body.account || '')]);
    if (!rows.length) throw new HttpError(404, '없는 계정입니다');
    user = rows[0];
    const cnt = await query('SELECT count(*)::int AS n FROM pk_passkeys WHERE user_id = $1', [user.id]);
    if (cnt[0].n > 0) throw new HttpError(403, '이미 패스키가 있는 계정입니다. 패스키로 들어간 뒤 추가하세요');
    mode = 'enroll';
  }
  const existing = await query('SELECT credential_id, transports FROM pk_passkeys WHERE user_id = $1', [user.id]);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: new URL(origin).hostname,
    userName: user.account,
    userDisplayName: user.display_name,
    userID: new TextEncoder().encode(`pk-user-${user.id}`),
    attestationType: 'none',
    // 이미 등록한 패스키는 제외해 달라고 기기에 알린다(같은 인증기에 중복 등록 방지).
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports ? c.transports.split(',') : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const setCookie = await saveChallenge(options.challenge, 'register', user.id, mode, origin);
  sendJson(res, 200, options, { 'Set-Cookie': setCookie });
}

async function registerVerify(req, res) {
  const origin = originOf(req, { required: true });
  const body = await readJson(req);
  if (!body.response || typeof body.response !== 'object') throw new HttpError(400, 'response 가 필요합니다');
  const row = await consumeChallenge(req, body.response, 'register');
  const me = await currentUser(req);
  if (row.mode === 'add' && (!me || me.id !== row.user_id)) throw new HttpError(401, '패스키로 들어간 상태에서만 추가할 수 있습니다');
  if (row.mode === 'enroll') {
    const cnt = await query('SELECT count(*)::int AS n FROM pk_passkeys WHERE user_id = $1', [row.user_id]);
    if (cnt[0].n > 0) throw new HttpError(403, '이미 패스키가 있는 계정입니다');
  }
  let v;
  try {
    v = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: row.challenge,
      expectedOrigin: origin,
      expectedRPID: new URL(origin).hostname,
      requireUserVerification: false,
    });
  } catch (e) {
    throw new HttpError(400, `등록 응답 확인 실패: ${e.message}`);
  }
  if (!v.verified) throw new HttpError(400, '등록 응답 확인 실패');
  const info = v.registrationInfo;
  const count = await query('SELECT count(*)::int AS n FROM pk_passkeys WHERE user_id = $1', [row.user_id]);
  const name = cleanName(body.name, `패스키 ${count[0].n + 1}`);
  // 저장하는 것은 공개키(COSE 형식, base64url)와 인증기 정보뿐이다.
  const ins = await query(
    `INSERT INTO pk_passkeys (user_id, credential_id, public_key, counter, transports, device_type, backed_up, aaguid, name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [row.user_id, info.credential.id, isoBase64URL.fromBuffer(info.credential.publicKey), info.credential.counter,
      (info.credential.transports || []).join(','), info.credentialDeviceType, info.credentialBackedUp, info.aaguid, name]);
  const headers = {};
  if (row.mode === 'enroll') headers['Set-Cookie'] = await startSession(row.user_id, ins[0].id, origin);
  sendJson(res, 200, {
    ok: true,
    passkey: passkeyView(ins[0]),
    stored: { credential_id: ins[0].credential_id, public_key_cose: ins[0].public_key, aaguid: ins[0].aaguid },
  }, headers);
}

// ---------- 흐름 2: 로그인 ----------
async function loginOptions(req, res) {
  const origin = originOf(req, { required: true });
  // 계정 이름을 묻지 않는다. 기기가 이 사이트용 패스키를 골라 서명하고, 서버는 패스키 ID 로 계정을 찾는다.
  const options = await generateAuthenticationOptions({ rpID: new URL(origin).hostname, userVerification: 'preferred' });
  const setCookie = await saveChallenge(options.challenge, 'login', null, '', origin);
  sendJson(res, 200, options, { 'Set-Cookie': setCookie });
}

async function loginVerify(req, res) {
  const origin = originOf(req, { required: true });
  const body = await readJson(req);
  if (!body.response || typeof body.response !== 'object') throw new HttpError(400, 'response 가 필요합니다');
  const row = await consumeChallenge(req, body.response, 'login');
  // 본문에 account 같은 값이 와도 쓰지 않는다. 누구인지는 오직 서명한 패스키로 정한다.
  const pk = (await query('SELECT * FROM pk_passkeys WHERE credential_id = $1', [String(body.response.id || '')]))[0];
  if (!pk) throw new HttpError(401, '등록되지 않은 패스키입니다(지웠거나 다른 곳의 패스키)');
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: row.challenge,
      expectedOrigin: origin,
      expectedRPID: new URL(origin).hostname,
      credential: {
        id: pk.credential_id,
        publicKey: isoBase64URL.toBuffer(pk.public_key),
        counter: Number(pk.counter),
        transports: pk.transports ? pk.transports.split(',') : undefined,
      },
      requireUserVerification: false,
    });
  } catch (e) {
    throw new HttpError(401, `서명 확인 실패: ${e.message}`);
  }
  if (!v.verified) throw new HttpError(401, '서명 확인 실패');
  await query('UPDATE pk_passkeys SET counter = $1, last_used_at = now() WHERE id = $2', [v.authenticationInfo.newCounter, pk.id]);
  const setCookie = await startSession(pk.user_id, pk.id, origin);
  const u = (await query('SELECT account, display_name FROM pk_users WHERE id = $1', [pk.user_id]))[0];
  sendJson(res, 200, { ok: true, account: u.account, display_name: u.display_name, passkey: pk.name }, { 'Set-Cookie': setCookie });
}

// ---------- 흐름 3: 로그아웃 ----------
async function logout(req, res) {
  const origin = originOf(req, { required: true });
  const sid = parseCookies(req).sid;
  if (sid) await query('DELETE FROM pk_sessions WHERE id_hash = $1', [sha256(sid)]); // 서버에서 세션을 지운다
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie('sid', '', origin, 0) });
}

// ---------- 흐름 4: 비공개 자료 ----------
// 모든 조회의 조건은 '세션의 사용자 id' 하나뿐이다. 주소·본문에 적힌 계정 이름은 읽지 않는다.
async function listItems(req, res) {
  const u = await requireUser(req);
  const items = await query('SELECT id, title, body, created_at FROM pk_items WHERE user_id = $1 ORDER BY id', [u.id]);
  sendJson(res, 200, { account: u.account, display_name: u.display_name, count: items.length, items });
}
async function getItem(req, res, id) {
  const u = await requireUser(req);
  const rows = await query('SELECT id, title, body, created_at FROM pk_items WHERE id = $1 AND user_id = $2', [id, u.id]);
  if (!rows.length) throw new HttpError(404, '내 자료 중에 그 번호가 없습니다');
  sendJson(res, 200, rows[0]);
}
async function addItem(req, res) {
  originOf(req, { required: true });
  const u = await requireUser(req);
  const b = await readJson(req);
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const text = typeof b.body === 'string' ? b.body.trim() : '';
  if (!title || title.length > 80) throw new HttpError(400, '제목은 1~80자로 적어 주세요');
  if (text.length > 500) throw new HttpError(400, '내용은 500자 이하로 적어 주세요');
  const rows = await query('INSERT INTO pk_items (user_id, title, body) VALUES ($1, $2, $3) RETURNING id, title, body, created_at', [u.id, title, text]);
  sendJson(res, 201, { account: u.account, item: rows[0] });
}
async function deleteItem(req, res, id) {
  originOf(req, { required: true });
  const u = await requireUser(req);
  const rows = await query('DELETE FROM pk_items WHERE id = $1 AND user_id = $2 RETURNING id', [id, u.id]);
  if (!rows.length) throw new HttpError(404, '내 자료 중에 그 번호가 없습니다');
  sendJson(res, 200, { ok: true });
}

// ---------- 패스키 목록·삭제 ----------
async function listPasskeys(req, res) {
  const u = await requireUser(req);
  const rows = await query('SELECT * FROM pk_passkeys WHERE user_id = $1 ORDER BY id', [u.id]);
  sendJson(res, 200, { account: u.account, current_passkey_id: u.passkey_id, passkeys: rows.map(passkeyView) });
}
async function deletePasskey(req, res, id) {
  originOf(req, { required: true });
  const u = await requireUser(req);
  const mine = await query('SELECT id FROM pk_passkeys WHERE id = $1 AND user_id = $2', [id, u.id]);
  if (!mine.length) throw new HttpError(404, '내 패스키 중에 그 번호가 없습니다');
  const cnt = await query('SELECT count(*)::int AS n FROM pk_passkeys WHERE user_id = $1', [u.id]);
  if (cnt[0].n <= 1) {
    throw new HttpError(409, '마지막 남은 패스키는 지울 수 없습니다. 지우면 이 자리에 아무도 들어올 수 없게 됩니다. 다른 기기에서 하나 더 등록한 뒤 지우세요');
  }
  await query('DELETE FROM pk_passkeys WHERE id = $1 AND user_id = $2', [id, u.id]);
  // 지운 패스키로 연 세션도 함께 끝낸다.
  await query('DELETE FROM pk_sessions WHERE passkey_id = $1', [id]);
  sendJson(res, 200, { ok: true, remaining: cnt[0].n - 1 });
}

async function me(req, res) {
  const u = await requireUser(req);
  sendJson(res, 200, { account: u.account, display_name: u.display_name });
}

// ---------- 라우팅 ----------
const ROUTES = [
  ['GET', /^\/api\/health$/, async (req, res) => sendJson(res, 200, { ok: true })],
  ['GET', /^\/api\/me$/, me],
  ['POST', /^\/api\/register\/options$/, registerOptions],
  ['POST', /^\/api\/register\/verify$/, registerVerify],
  ['POST', /^\/api\/login\/options$/, loginOptions],
  ['POST', /^\/api\/login\/verify$/, loginVerify],
  ['POST', /^\/api\/logout$/, logout],
  ['GET', /^\/api\/passkeys$/, listPasskeys],
  ['DELETE', /^\/api\/passkeys\/(\d{1,9})$/, deletePasskey],
  ['GET', /^\/api\/private\/items$/, listItems],
  ['POST', /^\/api\/private\/items$/, addItem],
  ['GET', /^\/api\/private\/items\/(\d{1,9})$/, getItem],
  ['DELETE', /^\/api\/private\/items\/(\d{1,9})$/, deleteItem],
];

export async function handleApi(req, res, url) {
  if (!url.pathname.startsWith('/api/')) return false;
  try {
    const hits = ROUTES.filter(([, re]) => re.test(url.pathname));
    if (!hits.length) throw new HttpError(404, '없는 주소입니다');
    const hit = hits.find(([m]) => m === req.method);
    if (!hit) throw new HttpError(405, '허용하지 않는 방법입니다');
    await ensureSchema();
    const m = url.pathname.match(hit[1]);
    await hit[2](req, res, m[1] ? Number(m[1]) : undefined);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    sendJson(res, status, { error: status >= 500 && !e.status ? '서버 오류' : e.message });
  }
  return true;
}
