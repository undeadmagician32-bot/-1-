import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, LogOut, Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import {
  ApiError,
  addItem,
  deleteItem,
  deletePasskey,
  explainPasskeyError,
  getMe,
  listItems,
  listPasskeys,
  login,
  logout,
  register,
  type Item,
  type Passkey,
} from '@/auth';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });

// 첫 등록 링크: #enroll=<등록 코드>&account=<계정>. 코드는 주소의 # 뒤에만 있어 서버 기록에 남지 않고, 읽자마자 주소에서 지운다.
function readEnrollLink(): { account: string; enrollCode: string } | null {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const code = h.get('enroll');
  if (!code) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { account: h.get('account') || 'me', enrollCode: code };
}

type Me = { account: string; display_name: string };

export function PrivateZone() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [enroll, setEnroll] = useState(readEnrollLink);
  const [items, setItems] = useState<Item[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [currentPk, setCurrentPk] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pkName, setPkName] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  const loadPrivate = useCallback(async () => {
    try {
      const [it, pk] = await Promise.all([listItems(), listPasskeys()]);
      setItems(it.items);
      setPasskeys(pk.passkeys);
      setCurrentPk(pk.current_passkey_id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else setMsg({ kind: 'err', text: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      const e = readEnrollLink();
      if (e) setEnroll(e);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    getMe()
      .then((m) => setMe(m))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me) loadPrivate();
    else {
      setItems([]);
      setPasskeys([]);
    }
  }, [me, loadPrivate]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const onLogin = () =>
    run(async () => {
      try {
        const r = await login();
        setMe({ account: r.account, display_name: r.display_name });
        setMsg({ kind: 'ok', text: '패스키 서명을 확인했습니다. 비공개 자리가 열렸습니다.' });
      } catch (e) {
        setMsg({ kind: 'err', text: explainPasskeyError(e, 'login') });
      }
    });

  const onRegister = () =>
    run(async () => {
      try {
        const r = await register(pkName, me ? undefined : enroll ?? undefined);
        setPkName('');
        setMsg({ kind: 'ok', text: `패스키 "${r.passkey.name}"를 등록했습니다. 서버에는 공개키만 저장됐습니다.` });
        if (!me) setMe(await getMe());
        else await loadPrivate();
      } catch (e) {
        setMsg({ kind: 'err', text: explainPasskeyError(e, 'register') });
      }
    });

  const onLogout = () =>
    run(async () => {
      await logout().catch(() => undefined);
      setMe(null);
      setMsg({ kind: 'ok', text: '로그아웃했습니다. 서버에서 세션을 지웠습니다.' });
    });

  const onDeletePasskey = (p: Passkey) =>
    run(async () => {
      if (!window.confirm(`패스키 "${p.name}"를 지울까요? 지우면 그 패스키로는 더 이상 들어올 수 없습니다.`)) return;
      try {
        const r = await deletePasskey(p.id);
        setMsg({ kind: 'ok', text: `패스키 "${p.name}"를 지웠습니다. 남은 패스키 ${r.remaining}개.` });
        if (p.id === currentPk) {
          setMe(null);
          setMsg({ kind: 'ok', text: `지금 쓰던 패스키 "${p.name}"를 지워서 로그아웃됐습니다. 남은 패스키로 다시 들어오세요.` });
        } else await loadPrivate();
      } catch (e) {
        setMsg({ kind: 'err', text: (e as Error).message });
      }
    });

  const onAddItem = (ev: React.FormEvent) => {
    ev.preventDefault();
    run(async () => {
      try {
        await addItem(title, body);
        setTitle('');
        setBody('');
        await loadPrivate();
      } catch (e) {
        setMsg({ kind: 'err', text: (e as Error).message });
      }
    });
  };

  const onDeleteItem = (it: Item) =>
    run(async () => {
      if (!window.confirm(`"${it.title}"를 지울까요?`)) return;
      try {
        await deleteItem(it.id);
        await loadPrivate();
      } catch (e) {
        setMsg({ kind: 'err', text: (e as Error).message });
      }
    });

  const nameInput = (
    <label className="block text-sm text-ink-200">
      패스키 이름 (알아보기 쉽게, 예: "내 휴대폰", "회사 노트북")
      <input
        type="text"
        value={pkName}
        maxLength={40}
        onChange={(e) => setPkName(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-ink-50"
        placeholder="비워 두면 '패스키 1'처럼 붙습니다"
        autoComplete="off"
      />
    </label>
  );

  return (
    <section aria-labelledby="private-heading" className="border-t-4 border-dashed border-warning-500/70 bg-ink-800/40">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <p className="inline-flex items-center gap-2 rounded-full bg-warning-500/15 px-3 py-1 text-sm font-medium text-warning-400">
          <Lock className="h-4 w-4" aria-hidden="true" />
          여기부터 비공개 · 위쪽은 누구나 보는 공개 소개, 아래쪽은 패스키로 잠긴 나만의 자리
        </p>
        <h2 id="private-heading" className="mt-4 text-2xl font-semibold text-ink-50">
          나만 보는 자리
        </h2>
        <p className="mt-2 text-ink-300">
          비밀번호는 없습니다. 내 기기에 있는 패스키로 서명해야 열립니다. 이 자리의 내용은 모두 만들어 넣은 연습용
          내용이며 실제 개인정보는 없습니다.
        </p>

        {msg && (
          <p
            role={msg.kind === 'err' ? 'alert' : 'status'}
            className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
              msg.kind === 'err'
                ? 'border-error-500/50 bg-error-600/10 text-error-400'
                : 'border-success-500/50 bg-success-600/10 text-success-400'
            }`}
          >
            {msg.text}
          </p>
        )}

        {!supported && (
          <p className="mt-6 rounded-lg border border-error-500/50 bg-error-600/10 px-4 py-3 text-sm text-error-400">
            이 브라우저는 패스키를 지원하지 않거나, https 주소가 아닙니다. 최신 Chrome·Safari·Edge 에서 열어 주세요.
          </p>
        )}

        {me === undefined && <p className="mt-6 text-ink-300">확인하는 중…</p>}

        {me === null && (
          <div className="mt-6 rounded-xl border border-ink-600 bg-ink-900/60 p-6">
            <div className="flex items-center gap-2 text-ink-100">
              <Lock className="h-5 w-5 text-warning-400" aria-hidden="true" />
              <span className="font-medium">잠겨 있음</span>
            </div>
            <p className="mt-2 text-sm text-ink-300">
              이 페이지에는 비공개 내용이 들어 있지 않습니다. 패스키 서명을 서버가 확인한 뒤에만 서버가 내용을 내려 줍니다.
            </p>
            <button
              type="button"
              onClick={onLogin}
              disabled={busy || !supported}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              패스키로 들어가기
            </button>

            {enroll && (
              <div className="mt-6 space-y-3 rounded-lg border border-accent-500/40 bg-accent-600/10 p-4">
                <p className="text-sm text-ink-100">
                  첫 패스키 등록 링크로 들어왔습니다 (계정: <strong>{enroll.account}</strong>). 패스키가 하나도 없는
                  계정에만 쓸 수 있습니다.
                </p>
                {nameInput}
                <button
                  type="button"
                  onClick={onRegister}
                  disabled={busy || !supported}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />이 기기에 패스키 만들기
                </button>
              </div>
            )}
          </div>
        )}

        {me && (
          <div className="mt-6 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-success-400">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                {me.display_name} ({me.account}) 으로 들어와 있습니다
              </p>
              <button
                type="button"
                onClick={onLogout}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-ink-500 px-3 py-1.5 text-sm text-ink-100 hover:bg-ink-700"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                로그아웃
              </button>
            </div>

            <div>
              <h3 className="text-lg font-medium text-ink-50">비공개 메모 ({items.length}개)</h3>
              <ul className="mt-3 space-y-3">
                {items.map((it) => (
                  <li key={it.id} className="rounded-lg border border-ink-600 bg-ink-900/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink-100">{it.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-300">{it.body}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(it)}
                        disabled={busy}
                        aria-label={`${it.title} 지우기`}
                        className="rounded p-1 text-ink-300 hover:text-error-400"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <form onSubmit={onAddItem} className="mt-4 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                <input
                  type="text"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="메모 제목"
                  aria-label="메모 제목"
                  className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-ink-50"
                  autoComplete="off"
                />
                <input
                  type="text"
                  value={body}
                  maxLength={500}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="내용 (만들어 넣은 내용만)"
                  aria-label="메모 내용"
                  className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-ink-50"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={busy || !title.trim()}
                  className="rounded-lg bg-ink-600 px-4 py-2 text-ink-50 hover:bg-ink-500 disabled:opacity-50"
                >
                  메모 추가
                </button>
              </form>
            </div>

            <div>
              <h3 className="text-lg font-medium text-ink-50">내 패스키 ({passkeys.length}개)</h3>
              <p className="mt-1 text-sm text-ink-300">
                서버에는 각 패스키의 공개키만 있습니다. 개인키는 기기 밖으로 나오지 않습니다.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-ink-300">
                    <tr>
                      <th className="py-2 pr-3 font-medium">이름</th>
                      <th className="py-2 pr-3 font-medium">등록한 날짜</th>
                      <th className="py-2 pr-3 font-medium">저장 위치(추정)</th>
                      <th className="py-2 pr-3 font-medium">마지막 사용</th>
                      <th className="py-2 pr-3 font-medium">저장된 공개키(앞부분)</th>
                      <th className="py-2 font-medium">
                        <span className="sr-only">지우기</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {passkeys.map((p) => (
                      <tr key={p.id} className="border-t border-ink-700 text-ink-100">
                        <td className="py-2 pr-3">
                          {p.name}
                          {p.id === currentPk && <span className="ml-2 text-xs text-accent-300">(지금 사용 중)</span>}
                        </td>
                        <td className="py-2 pr-3">{fmt(p.created_at)}</td>
                        <td className="py-2 pr-3">{p.storage}</td>
                        <td className="py-2 pr-3">{p.last_used_at ? fmt(p.last_used_at) : '-'}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-ink-300">{p.public_key_preview}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => onDeletePasskey(p)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded border border-ink-500 px-2 py-1 text-xs hover:border-error-400 hover:text-error-400"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                            지우기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {passkeys.length === 1 && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning-500/50 bg-warning-500/10 px-4 py-3 text-sm text-warning-400">
                  <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  패스키가 하나뿐입니다. 이 기기를 잃어버리면 아무도 들어올 수 없습니다. 다른 기기나 보안 키로 하나 더
                  등록해 두세요. 마지막 남은 패스키는 지울 수 없게 막아 두었습니다. 패스키가 0개가 되면 이 자리는
                  운영자가 정한 첫 등록 링크로만 다시 열 수 있습니다.
                </p>
              )}
              <div className="mt-4 space-y-3 rounded-lg border border-ink-600 p-4">
                <p className="text-sm text-ink-200">
                  다른 기기·브라우저·보안 키에 패스키 하나 더 등록하기 (같은 기기에는 이미 있는 패스키 때문에 막힐 수 있습니다)
                </p>
                {nameInput}
                <button
                  type="button"
                  onClick={onRegister}
                  disabled={busy || !supported}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  패스키 추가
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
