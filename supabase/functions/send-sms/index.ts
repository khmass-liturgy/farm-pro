// ─── 문자 발송 (알리고 SMS API 중계) ────────────────────────────────────────
// 알리고는 관리자 페이지(발신 서버 IP 등록)에 미리 등록해둔 IP에서 온 요청만
// 허용한다(등록 안 된 IP면 "인증오류입니다.-IP"). 이 Edge Function은 서버리스라
// 나가는 IP가 매번 달라질 수 있어 알리고를 직접 호출할 수 없다. 그래서 실제
// 알리고 호출은 고정 IP를 가진 별도 서버(sms-relay/, 예: Oracle Cloud 무료 VPS)가
// 담당하고, 이 함수는 "로그인 확인 → 그 서버에 전달"만 한다.
//
//   브라우저 → 이 Edge Function(로그인 확인) → sms-relay(고정 IP) → 알리고
//
// 알리고 인증키(API Key/사용자ID)는 이제 이 함수에 전혀 없다 — sms-relay 서버의
// 환경변수에만 있다. 이 함수는 SMS_RELAY_URL과, sms-relay를 인증하기 위한
// SMS_RELAY_SECRET(그 서버의 RELAY_SECRET과 같은 값)만 알면 된다.
//
// 배포에 필요한 시크릿 (`supabase secrets set` 로 등록):
//   SMS_RELAY_URL     sms-relay 서버의 발송 엔드포인트 (예: https://x-x-x-x.nip.io/send-sms)
//   SMS_RELAY_SECRET  sms-relay 서버의 RELAY_SECRET과 동일한 값
// SUPABASE_URL / SUPABASE_ANON_KEY는 Edge Function 실행환경에 자동으로 주입되므로
// 별도 등록이 필요 없다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LMS_BYTE_LIMIT = 2000; // 장문(LMS) 바이트 한도(알리고 기준) — 여기서도 먼저 걸러 sms-relay를 불필요하게 깨우지 않는다
const MAX_TARGETS = 50;      // 실수로 대량 발송하는 사고를 막기 위한 1회 상한

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
// js/sms.js와 sms-relay/server.js의 같은 이름 함수와 반드시 같은 방식이어야 한다.
function byteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) bytes += ch.codePointAt(0)! > 0x7f ? 2 : 1;
  return bytes;
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

  // ── 요청 파싱 및 1차 검증 (sms-relay가 최종 판정하지만, 여기서도 먼저 걸러
  //    명백히 잘못된 요청으로 그 서버를 불필요하게 호출하지 않는다) ────────────
  let payload: { from?: string; content?: string; targets?: { to: string; name?: string }[]; refKey?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: '요청 본문이 JSON이 아닙니다.' }, 400, origin);
  }

  const content = (payload.content || '').trim();
  const targets = Array.isArray(payload.targets) ? payload.targets : [];

  if (!content) return json({ error: '내용이 없습니다.' }, 400, origin);
  if (!targets.length) return json({ error: '받는 사람이 없습니다.' }, 400, origin);
  if (targets.length > MAX_TARGETS) return json({ error: `한 번에 최대 ${MAX_TARGETS}명까지 보낼 수 있습니다.` }, 400, origin);
  const bytes = byteLength(content);
  if (bytes > LMS_BYTE_LIMIT) return json({ error: `내용이 너무 깁니다 (${bytes}byte, 최대 ${LMS_BYTE_LIMIT}byte).` }, 400, origin);

  // ── sms-relay로 전달 ────────────────────────────────────────────────────
  const relayUrl = Deno.env.get('SMS_RELAY_URL');
  const relaySecret = Deno.env.get('SMS_RELAY_SECRET');
  if (!relayUrl || !relaySecret) {
    return json({ error: '서버 설정 오류: SMS_RELAY_URL/SMS_RELAY_SECRET이 없습니다. sms-relay 배포 후 시크릿을 등록하세요.' }, 500, origin);
  }

  try {
    const relayRes = await fetch(relayUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${relaySecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: payload.from, content, targets, refKey: payload.refKey }),
    });
    const body = await relayRes.json().catch(() => null);
    if (!relayRes.ok) {
      return json({ error: body?.error || `중계 서버 오류 (HTTP ${relayRes.status})` }, 502, origin);
    }
    return json(body, 200, origin);
  } catch (e) {
    return json({ error: `중계 서버 연결 실패: ${e instanceof Error ? e.message : String(e)}` }, 502, origin);
  }
});
