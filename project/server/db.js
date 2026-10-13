// DB 연결: DATABASE_URL 이 있으면 Postgres(Supabase 등), 없으면 로컬용 PGlite(진짜 Postgres 엔진, 파일/메모리 저장).
// 이 과제의 표는 모두 pk_ 로 시작해서, 같은 DB 를 다른 과제와 같이 써도 섞이지 않는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let driver;
async function getDriver() {
  if (driver) return driver;
  if (process.env.DATABASE_URL) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.VERCEL ? 1 : 5,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    });
    driver = { query: (s, p) => pool.query(s, p) };
  } else {
    if (process.env.VERCEL) {
      const e = new Error('서버 설정(DATABASE_URL)이 아직 없습니다');
      e.status = 503;
      throw e;
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(here, '..', '.data', 'pglite');
    const lite = dir === 'memory' ? new PGlite() : new PGlite(dir);
    await lite.waitReady;
    driver = { query: (s, p) => lite.query(s, p) };
  }
  return driver;
}

export async function query(sql, params = []) {
  const d = await getDriver();
  return (await d.query(sql, params)).rows;
}

// 비공개 자리에 넣는 내용은 모두 만들어 넣은 것(가상)이다. 실제 연락처·신분증 번호 같은 개인정보는 없다.
const SEED = [
  ['me', '나 (주인)', [
    ['준비 중인 프로젝트 메모', '모드 번역 2편: 용어집 120개 중 80개 정리. 다음 주까지 대사 파일 3개 검수(가상 메모).'],
    ['지원하려는 곳 목록', '① 가상 회사 "북극성랩" 번역 QA ② 가상 스타트업 "느린생각" 콘텐츠 기획 ③ 가상 재단 "열린창" 교육 보조.'],
    ['스스로 쓰는 회고', '이번 달 잘한 것: 매일 30분 영어 원서 읽기. 아쉬운 것: 마감 직전에 몰아서 함(가상 회고).'],
    ['읽을 책 목록', '가상 목록: 『생각의 속도』, 『느리게 읽기』, 『질문하는 법』.'],
  ]],
  ['check-a', '확인용 계정 A', [
    ['A의 비공개 메모 1', '확인용 계정 A 전용 가상 메모입니다. B 에게 보이면 안 됩니다.'],
    ['A의 비공개 메모 2', '확인용 계정 A 전용 두 번째 가상 메모.'],
    ['A의 비공개 메모 3', '확인용 계정 A 전용 세 번째 가상 메모.'],
  ]],
  ['check-b', '확인용 계정 B', [
    ['B의 비공개 메모 1', '확인용 계정 B 전용 가상 메모입니다. A 에게 보이면 안 됩니다.'],
    ['B의 비공개 메모 2', '확인용 계정 B 전용 두 번째 가상 메모.'],
    ['B의 비공개 메모 3', '확인용 계정 B 전용 세 번째 가상 메모.'],
  ]],
];

let ready;
export function ensureSchema() {
  ready ||= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS pk_users (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        account TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL
      )`);
    // 공개키만 저장한다. 비밀번호 칸도, 개인키 칸도 없다.
    await query(`
      CREATE TABLE IF NOT EXISTS pk_passkeys (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES pk_users(id),
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        transports TEXT NOT NULL DEFAULT '',
        device_type TEXT NOT NULL,
        backed_up BOOLEAN NOT NULL,
        aaguid TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ
      )`);
    // 일회용 질문. 서버가 확인할 때까지 여기에 보관하고, 확인에 쓰면 used_at 을 채워 다시 못 쓰게 한다.
    await query(`
      CREATE TABLE IF NOT EXISTS pk_challenges (
        challenge TEXT PRIMARY KEY,
        purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
        user_id INTEGER REFERENCES pk_users(id),
        mode TEXT NOT NULL DEFAULT '',
        flow_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ
      )`);
    // 세션: 쿠키에는 무작위 값, DB 에는 그 값의 SHA-256 만 둔다.
    await query(`
      CREATE TABLE IF NOT EXISTS pk_sessions (
        id_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES pk_users(id),
        passkey_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      )`);
    await query(`
      CREATE TABLE IF NOT EXISTS pk_items (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES pk_users(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    for (const [account, name, items] of SEED) {
      const ins = await query(
        'INSERT INTO pk_users (account, display_name) VALUES ($1, $2) ON CONFLICT (account) DO NOTHING RETURNING id',
        [account, name],
      );
      if (!ins.length) continue; // 이미 있는 계정은 건드리지 않는다
      for (const [title, body] of items) {
        await query('INSERT INTO pk_items (user_id, title, body) VALUES ($1, $2, $3)', [ins[0].id, title, body]);
      }
    }
  })().catch((e) => { ready = undefined; throw e; });
  return ready;
}
