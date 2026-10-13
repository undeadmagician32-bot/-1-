// 비공개 자리용 API 호출. 비공개 내용은 페이지에 들어 있지 않고, 패스키로 들어간 뒤 서버가 내려 준다.
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export type Item = { id: number; title: string; body: string; created_at: string };
export type Passkey = {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  storage: string;
  public_key_preview: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: { error?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* 본문 없음 */
  }
  if (!res.ok) throw new ApiError(res.status, data.error || `요청 실패 (${res.status})`);
  return data as T;
}

// 브라우저 쪽에서 난 패스키 오류를 사람이 읽을 문장으로 바꾼다.
export function explainPasskeyError(e: unknown, kind: 'register' | 'login'): string {
  if (e instanceof ApiError) return e.message;
  const name = (e as { name?: string; cause?: { name?: string } })?.name;
  const causeName = (e as { cause?: { name?: string } })?.cause?.name;
  const n = causeName || name;
  if (n === 'NotAllowedError' || n === 'AbortError') {
    return kind === 'register'
      ? '패스키 등록을 취소했습니다. 서버에는 아무것도 저장되지 않았습니다.'
      : '패스키 선택을 취소했거나 시간이 지났습니다. 다시 눌러 주세요.';
  }
  if (n === 'InvalidStateError') {
    return '이 기기(또는 이 비밀번호 관리자)에는 이미 이 계정의 패스키가 있습니다. 다른 기기·브라우저·보안 키로 등록하세요.';
  }
  if (n === 'SecurityError') return '이 주소에서는 패스키를 쓸 수 없습니다. https 주소인지 확인하세요.';
  return (e as Error)?.message || '알 수 없는 오류가 났습니다.';
}

export const getMe = () => api<{ account: string; display_name: string }>('GET', '/api/me');
export const listItems = () => api<{ account: string; count: number; items: Item[] }>('GET', '/api/private/items');
export const addItem = (title: string, body: string) => api('POST', '/api/private/items', { title, body });
export const deleteItem = (id: number) => api('DELETE', `/api/private/items/${id}`);
export const listPasskeys = () =>
  api<{ account: string; current_passkey_id: number | null; passkeys: Passkey[] }>('GET', '/api/passkeys');
export const deletePasskey = (id: number) => api<{ remaining: number }>('DELETE', `/api/passkeys/${id}`);
export const logout = () => api('POST', '/api/logout');

export async function register(name: string, enroll?: { account: string; enrollCode: string }) {
  const optionsJSON = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>(
    'POST',
    '/api/register/options',
    enroll ?? {},
  );
  const response = await startRegistration({ optionsJSON });
  return api<{ ok: true; passkey: Passkey }>('POST', '/api/register/verify', { response, name });
}

export async function login() {
  const optionsJSON = await api<Parameters<typeof startAuthentication>[0]['optionsJSON']>('POST', '/api/login/options', {});
  const response = await startAuthentication({ optionsJSON });
  return api<{ ok: true; account: string; display_name: string }>('POST', '/api/login/verify', { response });
}
