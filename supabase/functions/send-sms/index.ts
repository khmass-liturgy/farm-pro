// ─── 문자 발송 (뿌리오 SMS API 프록시) ─────────────────────────────────────
// 뿌리오 인증키(계정/토큰)는 이 함수의 환경변수(시크릿)에만 있고 브라우저에는
// 절대 내려가지 않는다. 프론트엔드(js/sms.js)는 이 함수를 sb.functions.invoke()로
// 호출만 하고, 실제 뿌리오 호출은 전부 여기서(서버 쪽에서) 일어난다.
//
// 배포에 필요한 시크릿 (Supabase 대시보드 → Edge Functions → send-sms → Secrets,
// 또는 `supabase secrets set` 로 등록):
//   PPURIO_ACCOUNT  뿌리오 계정 ID
//   PPURIO_TOKEN    뿌리오 연동 개발 인증키
//   PPURIO_SENDER   기본 발신번호(선택) — 요청에 from이 없으면 이 값을 쓴다
// SUPABASE_URL / SUPABASE_ANON_KEY는 Edge Function 실행환경에 자동으로 주입되므로
// 별도 등록이 필요 없다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PPURIO_API_URL = 'https://message.ppurio.com';
const SMS_BYTE_LIMIT = 90;    // 표준 단문(SMS) 바이트 한도
const LMS_BYTE_LIMIT = 2000;  // 장문(LMS) 바이트 한도(뿌리오 기준)
const MAX_TARGETS = 50;       // 실수로 대량 발송하는 사고를 막기 위한 1회 상한

// 이 사이트가 배포된 곳 + 로컬 개발 서버만 허용한다. 자격 증명은 이 함수가 이미
// Authorization 헤더로 로그인 여부를 확인하므로, CORS는 2차 방어선 성격이다.
const ALLOWED_ORIGINS = [
  'https://khmass-liturgy.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// EUC-KR 근사 바이트 계산: ASCII 1바이트, 그 외(한글 등)는 2바이트로 어림한다.
// js/sms.js의 smsByteLength()와 반드시 같은 방식이어야 한다 — 클라이언트가 보여준
// "SMS/LMS" 판정과 실제 발송 시 판정이 어긋나면 안 되기 때문이다.
function byteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) bytes += ch.codePointAt(0)! > 0x7f ? 2 : 1;
  return bytes;
}

// 뿌리오 액세스 토큰은 24시간 유효하다. 매 요청마다 새로 받으면 불필요한 호출이
// 쌓이므로, 이 함수 인스턴스가 재사용되는 동안(warm start)은 메모리에 캐시해 둔다.
// 인스턴스가 새로 뜨면(cold start) 캐시가 비어 있어 자연스럽게 다시 받아온다.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getPpurioToken(account: string, token: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const basic = 'Basic ' + btoa(`${account}:${token}`);
  const res = await fetch(`${PPURIO_API_URL}/v1/token`, {
    method: 'POST',
    headers: { Authorization: basic },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.token) {
    throw new Error(`뿌리오 토큰 발급 실패 (HTTP ${res.status}): ${body?.message || JSON.stringify(body)}`);
  }
  // 23시간으로 캐시해 실제 24시간 만료보다 여유를 둔다.
  cachedToken = { token: body.token, expiresAt: Date.now() + 23 * 3600 * 1000 };
  return body.token;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'POST만 지원합니다.' }, 405, origin);

  // ── 인증: Supabase에 로그인한 사용자만 허용한다 ──────────────────────────
  // (이 앱의 다른 모든 데이터와 같은 "로그인하면 전체 접근 가능" 공유 워크스페이스
  //  모델을 그대로 따른다. anon key만으로는 통과하지 못하고 실제 로그인 세션이 필요하다.)
  const authHeader = req.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return json({ error: '서버 설정 오류: SUPABASE_URL/SUPABASE_ANON_KEY가 없습니다.' }, 500, origin);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: '로그인이 필요합니다.' }, 401, origin);

  // ── 요청 파싱 및 검증 ────────────────────────────────────────────────────
  let payload: { from?: string; content?: string; targets?: { to: string; name?: string }[]; refKey?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: '요청 본문이 JSON이 아닙니다.' }, 400, origin);
  }

  const account = Deno.env.get('PPURIO_ACCOUNT');
  const ppurioToken = Deno.env.get('PPURIO_TOKEN');
  if (!account || !ppurioToken) {
    return json({ error: '서버에 뿌리오 인증키가 설정되어 있지 않습니다. Supabase 시크릿(PPURIO_ACCOUNT, PPURIO_TOKEN)을 등록하세요.' }, 500, origin);
  }

  const from = (payload.from || Deno.env.get('PPURIO_SENDER') || '').replace(/[^0-9]/g, '');
  const content = (payload.content || '').trim();
  const targets = Array.isArray(payload.targets) ? payload.targets : [];

  if (!from) return json({ error: '발신번호가 없습니다.' }, 400, origin);
  if (!content) return json({ error: '내용이 없습니다.' }, 400, origin);
  if (!targets.length) return json({ error: '받는 사람이 없습니다.' }, 400, origin);
  if (targets.length > MAX_TARGETS) return json({ error: `한 번에 최대 ${MAX_TARGETS}명까지 보낼 수 있습니다.` }, 400, origin);

  const bytes = byteLength(content);
  if (bytes > LMS_BYTE_LIMIT) return json({ error: `내용이 너무 깁니다 (${bytes}byte, 최대 ${LMS_BYTE_LIMIT}byte).` }, 400, origin);
  const messageType = bytes > SMS_BYTE_LIMIT ? 'LMS' : 'SMS';

  const cleanTargets = targets.map((t) => ({
    to: (t.to || '').replace(/[^0-9]/g, ''),
    ...(t.name ? { name: t.name } : {}),
  }));
  if (cleanTargets.some((t) => !t.to)) return json({ error: '받는 사람 번호에 유효하지 않은 값이 있습니다.' }, 400, origin);

  // ── 뿌리오 호출 ─────────────────────────────────────────────────────────
  try {
    const accessToken = await getPpurioToken(account, ppurioToken);
    const res = await fetch(`${PPURIO_API_URL}/v1/message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account,
        messageType,
        content,
        from,
        duplicateFlag: 'Y', // 같은 번호로 여러 농장을 등록해둔 경우도 있을 수 있어 제거하지 않는다
        refKey: payload.refKey || undefined,
        targetCount: cleanTargets.length,
        targets: cleanTargets,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return json({ error: `뿌리오 발송 실패 (HTTP ${res.status}): ${body?.message || JSON.stringify(body)}` }, 502, origin);
    }
    return json({ ok: true, messageType, byteLength: bytes, messageKey: body?.messageKey, raw: body }, 200, origin);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, origin);
  }
});
