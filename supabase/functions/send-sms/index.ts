// ─── 문자 발송 (알리고 SMS API) ──────────────────────────────────────────
// 문자 발송 업체를 뿌리오 → 알리고(Aligo)로 변경. 알리고 API는 발신 IP를
// 등록/제한하지 않으므로(공식 문서 https://smartsms.aligo.in/admin/api/spec.html
// 에 IP 제한 항목 없음), 뿌리오 때 필요했던 고정 IP 중계 서버(옛 sms-relay/)가
// 더 이상 필요 없다 — 이 Edge Function이 알리고를 직접 호출한다.
//
//   브라우저 → 이 Edge Function(로그인 확인 + 알리고 호출) → 알리고
//
// 알리고 인증키는 이 함수의 환경변수에만 있고 브라우저로는 절대 내려오지 않는다.
//
// 배포에 필요한 시크릿 (`supabase secrets set` 로 등록):
//   ALIGO_API_KEY   알리고 관리자 페이지 → API 연동 관리에서 발급받은 API Key
//   ALIGO_USER_ID   알리고 로그인 아이디
// 발신번호(sender)는 알리고 사이트(관리자 페이지 → 발신번호 관리)에 미리
// 등록해둔 번호만 쓸 수 있다 — 등록 안 된 번호면 알리고가 발송을 거부한다.
// SUPABASE_URL / SUPABASE_ANON_KEY는 Edge Function 실행환경에 자동으로 주입되므로
// 별도 등록이 필요 없다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SMS_BYTE_LIMIT = 90;   // 표준 단문(SMS) 바이트 한도
const LMS_BYTE_LIMIT = 2000; // 장문(LMS) 바이트 한도(알리고 기준)
const MAX_TARGETS = 50;      // 실수로 대량 발송하는 사고를 막기 위한 1회 상한 (알리고 자체 한도는 최대 1,000명)
const ALIGO_API_URL = 'https://apis.aligo.in/send/';

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
// js/sms.js의 같은 이름 함수와 반드시 같은 방식이어야 한다 — 여기서 "SMS"로
// 판정한 걸 알리고가 "LMS"로 판정하면 요금/글자수가 어긋난다.
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

  // ── 요청 파싱 및 검증 ────────────────────────────────────────────────────
  let payload: { from?: string; content?: string; targets?: { to: string; name?: string }[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: '요청 본문이 JSON이 아닙니다.' }, 400, origin);
  }

  const content = (payload.content || '').trim();
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const from = (payload.from || '').replace(/[^0-9]/g, '');

  if (!from) return json({ error: '발신번호가 없습니다.' }, 400, origin);
  if (!content) return json({ error: '내용이 없습니다.' }, 400, origin);
  if (!targets.length) return json({ error: '받는 사람이 없습니다.' }, 400, origin);
  if (targets.length > MAX_TARGETS) return json({ error: `한 번에 최대 ${MAX_TARGETS}명까지 보낼 수 있습니다.` }, 400, origin);
  const bytes = byteLength(content);
  if (bytes > LMS_BYTE_LIMIT) return json({ error: `내용이 너무 깁니다 (${bytes}byte, 최대 ${LMS_BYTE_LIMIT}byte).` }, 400, origin);

  const cleanReceivers = targets.map((t) => (t.to || '').replace(/[^0-9]/g, ''));
  if (cleanReceivers.some((r) => !r)) return json({ error: '받는 사람 번호에 유효하지 않은 값이 있습니다.' }, 400, origin);

  // ── 알리고 호출 ─────────────────────────────────────────────────────────
  const apiKey = Deno.env.get('ALIGO_API_KEY');
  const userId = Deno.env.get('ALIGO_USER_ID');
  if (!apiKey || !userId) {
    return json({ error: '서버 설정 오류: ALIGO_API_KEY/ALIGO_USER_ID가 없습니다. Supabase 시크릿을 등록하세요.' }, 500, origin);
  }

  const messageType = bytes > SMS_BYTE_LIMIT ? 'LMS' : 'SMS';
  const form = new URLSearchParams({
    key: apiKey,
    user_id: userId,
    sender: from,
    receiver: cleanReceivers.join(','),
    msg: content,
    msg_type: messageType,
  });

  try {
    const aligoRes = await fetch(ALIGO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const body = await aligoRes.json().catch(() => null);
    // 알리고는 실패해도 HTTP는 대체로 200을 주고 result_code로 성공/실패를
    // 구분한다(0 이상 성공, 음수 실패) — HTTP 상태만으로는 판정할 수 없다.
    if (!aligoRes.ok || !body || Number(body.result_code) < 0) {
      return json({ error: body?.message || `알리고 발송 실패 (HTTP ${aligoRes.status})` }, 502, origin);
    }
    return json({
      ok: true,
      messageType: body.msg_type || messageType,
      byteLength: bytes,
      successCount: body.success_cnt,
      errorCount: body.error_cnt,
      raw: body,
    }, 200, origin);
  } catch (e) {
    return json({ error: `알리고 연결 실패: ${e instanceof Error ? e.message : String(e)}` }, 502, origin);
  }
});
