// ─── 알리고 SMS 중계 서버 ────────────────────────────────────────────────
// 왜 이 서버가 필요한가: 알리고는 관리자 페이지(발신 서버 IP 등록)에 미리
// 등록해둔 IP에서 온 요청만 허용한다(등록 안 된 IP면 "인증오류입니다.-IP").
// Supabase Edge Function은 서버리스라 나가는 IP가 매번 달라질 수 있어 이
// 요구사항과 안 맞는다. 그래서 고정 IP를 가진 이 작은 서버 하나를 알리고
// 앞에 세우고, 알리고에는 이 서버의 IP 하나만 등록해둔다.
//
// 구조: 브라우저 → Supabase Edge Function(로그인 확인) → 이 서버(고정 IP) → 알리고
// 알리고 인증키(ALIGO_API_KEY/ALIGO_USER_ID)는 이 서버의 환경변수에만 있다.
// Edge Function과 이 서버 사이는 RELAY_SECRET 공유 비밀값으로만 인증한다 —
// Edge Function은 이미 Supabase 로그인 여부를 확인했으므로, 이 서버는 "Edge
// Function이 보낸 요청이 맞는지"만 확인하면 된다(사용자 신원까지 다시 볼 필요 없음).
//
// 외부 npm 패키지를 쓰지 않는다(Node 내장 모듈만) — `npm install` 없이 이 파일
// 하나만 서버에 올리면 바로 실행되게 하기 위함이다.
//
// 운영 명령 (systemd로 등록했다면):
//   sudo systemctl status sms-relay   # 상태 확인
//   sudo systemctl restart sms-relay  # 코드 수정 후 재시작
//   sudo journalctl -u sms-relay -f   # 실시간 로그

const http = require('http');

const PORT = Number(process.env.PORT) || 8080;
const RELAY_SECRET = process.env.RELAY_SECRET;
const ALIGO_API_KEY = process.env.ALIGO_API_KEY;
const ALIGO_USER_ID = process.env.ALIGO_USER_ID;
const ALIGO_SENDER = process.env.ALIGO_SENDER || '';
const ALIGO_API_URL = 'https://apis.aligo.in/send/';

const SMS_BYTE_LIMIT = 90;   // 표준 단문(SMS) 바이트 한도
const LMS_BYTE_LIMIT = 2000; // 장문(LMS) 바이트 한도(알리고 기준)
const MAX_TARGETS = 50;      // 실수로 대량 발송하는 사고를 막기 위한 1회 상한 (알리고 자체 한도는 최대 1,000명)

if (!RELAY_SECRET || !ALIGO_API_KEY || !ALIGO_USER_ID) {
  console.error('[fatal] RELAY_SECRET / ALIGO_API_KEY / ALIGO_USER_ID 환경변수가 필요합니다.');
  process.exit(1);
}

// EUC-KR 근사 바이트 계산: ASCII 1바이트, 그 외(한글 등)는 2바이트로 어림한다.
// js/sms.js와 supabase/functions/send-sms/index.ts의 같은 이름 함수와 반드시
// 같은 방식이어야 한다 — 세 곳 중 어디서 봐도 SMS/LMS 판정이 같아야 하기 때문이다.
function byteLength(text) {
  let bytes = 0;
  for (const ch of text) bytes += ch.codePointAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) { reject(new Error('요청이 너무 큽니다.')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleSendSms(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: '요청 본문이 JSON이 아닙니다.' });
  }

  const from = (payload.from || ALIGO_SENDER || '').replace(/[^0-9]/g, '');
  const content = (payload.content || '').trim();
  const targets = Array.isArray(payload.targets) ? payload.targets : [];

  if (!from) return sendJson(res, 400, { error: '발신번호가 없습니다.' });
  if (!content) return sendJson(res, 400, { error: '내용이 없습니다.' });
  if (!targets.length) return sendJson(res, 400, { error: '받는 사람이 없습니다.' });
  if (targets.length > MAX_TARGETS) return sendJson(res, 400, { error: `한 번에 최대 ${MAX_TARGETS}명까지 보낼 수 있습니다.` });

  const bytes = byteLength(content);
  if (bytes > LMS_BYTE_LIMIT) return sendJson(res, 400, { error: `내용이 너무 깁니다 (${bytes}byte, 최대 ${LMS_BYTE_LIMIT}byte).` });
  const messageType = bytes > SMS_BYTE_LIMIT ? 'LMS' : 'SMS';

  const receivers = targets.map((t) => (t.to || '').replace(/[^0-9]/g, ''));
  if (receivers.some((r) => !r)) return sendJson(res, 400, { error: '받는 사람 번호에 유효하지 않은 값이 있습니다.' });

  try {
    const form = new URLSearchParams({
      key: ALIGO_API_KEY,
      user_id: ALIGO_USER_ID,
      sender: from,
      receiver: receivers.join(','),
      msg: content,
      msg_type: messageType,
    });
    const aligoRes = await fetch(ALIGO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const body = await aligoRes.json().catch(() => null);
    // 알리고는 실패해도 HTTP는 대체로 200을 주고 result_code로 성공/실패를
    // 구분한다(0 이상 성공, 음수 실패) — HTTP 상태만으로는 판정할 수 없다.
    if (!aligoRes.ok || !body || Number(body.result_code) < 0) {
      return sendJson(res, 502, { error: `알리고 발송 실패 (HTTP ${aligoRes.status}): ${body?.message || JSON.stringify(body)}` });
    }
    return sendJson(res, 200, {
      ok: true,
      messageType: body.msg_type || messageType,
      byteLength: bytes,
      successCount: body.success_cnt,
      errorCount: body.error_cnt,
      raw: body,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

// ─── 농식품부 배합사료 통계 중계 (pb 저장소의 GitHub Actions용) ──────────────
// 농식품부(mafra.go.kr)는 해외 IP 접속을 막아 GitHub Actions(미국)에서 직접
// 받을 수 없다. 이 서버는 국내 리전이라 대신 받아 그대로 돌려준다. 열린
// 프록시가 되지 않도록 RELAY_SECRET 인증 + https://www.mafra.go.kr 의 배합사료
// 게시판(bbs/home/789) 목록·글·첨부 경로만 허용하고, 리다이렉트로 다른 호스트로
// 넘어가면 거부한다.
const MAFRA_HOST = 'www.mafra.go.kr';
const MAFRA_ALLOWED_PATH = /^\/bbs\/home\/789\/(artclList\.do|\d+\/artclView\.do|\d+\/download\.do)$/;
const MAFRA_MAX_BYTES = 5 * 1024 * 1024;

async function handleFetchMafra(req, res) {
  const target = new URL(req.url, 'http://localhost').searchParams.get('url') || '';
  let u;
  try { u = new URL(target); } catch { return sendJson(res, 400, { error: 'url이 올바르지 않습니다.' }); }
  if (u.protocol !== 'https:' || u.hostname !== MAFRA_HOST || u.port || !MAFRA_ALLOWED_PATH.test(u.pathname)) {
    return sendJson(res, 403, { error: '허용되지 않은 주소입니다.' });
  }
  try {
    const upstream = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pb-feed-relay/1.0)', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(25_000),
    });
    if (new URL(upstream.url).hostname !== MAFRA_HOST) {
      return sendJson(res, 502, { error: '다른 호스트로 리다이렉트되어 거부했습니다.' });
    }
    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAFRA_MAX_BYTES) return sendJson(res, 502, { error: '응답이 너무 큽니다.' });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAFRA_MAX_BYTES) return sendJson(res, 502, { error: '응답이 너무 큽니다.' });
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Content-Length': buf.length,
    });
    return res.end(buf);
  } catch (e) {
    return sendJson(res, 502, { error: `농식품부 요청 실패: ${e instanceof Error ? e.message : String(e)}` });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });

  const path = new URL(req.url, 'http://localhost').pathname;
  const isSms = req.method === 'POST' && req.url === '/send-sms';
  const isMafra = req.method === 'GET' && path === '/fetch-mafra';
  if (!isSms && !isMafra) return sendJson(res, 404, { error: 'not found' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${RELAY_SECRET}`) return sendJson(res, 401, { error: '인증되지 않은 요청입니다.' });

  try {
    await (isSms ? handleSendSms : handleFetchMafra)(req, res);
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => console.log(`sms-relay listening on :${PORT}`));
