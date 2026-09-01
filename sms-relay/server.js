// ─── 뿌리오 SMS 중계 서버 ────────────────────────────────────────────────
// 왜 이 서버가 필요한가: 뿌리오는 토큰 발급 시 미리 등록해둔 발신 IP만 허용한다
// (등록 안 된 IP면 {"code":"3003","description":"invalid ip"}). Supabase Edge
// Function은 서버리스라 나가는 IP가 매번 달라질 수 있어 이 요구사항과 안 맞는다.
// 그래서 고정 IP를 가진 이 작은 서버 하나를 뿌리오 앞에 세우고, 뿌리오에는
// 이 서버의 IP 하나만 등록해둔다.
//
// 구조: 브라우저 → Supabase Edge Function(로그인 확인) → 이 서버(고정 IP) → 뿌리오
// 뿌리오 인증키(PPURIO_ACCOUNT/PPURIO_TOKEN)는 이 서버의 환경변수에만 있다.
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
const PPURIO_ACCOUNT = process.env.PPURIO_ACCOUNT;
const PPURIO_TOKEN = process.env.PPURIO_TOKEN;
const PPURIO_SENDER = process.env.PPURIO_SENDER || '';
const PPURIO_API_URL = 'https://message.ppurio.com';

const SMS_BYTE_LIMIT = 90;   // 표준 단문(SMS) 바이트 한도
const LMS_BYTE_LIMIT = 2000; // 장문(LMS) 바이트 한도(뿌리오 기준)
const MAX_TARGETS = 50;      // 실수로 대량 발송하는 사고를 막기 위한 1회 상한

if (!RELAY_SECRET || !PPURIO_ACCOUNT || !PPURIO_TOKEN) {
  console.error('[fatal] RELAY_SECRET / PPURIO_ACCOUNT / PPURIO_TOKEN 환경변수가 필요합니다.');
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

// 뿌리오 액세스 토큰은 24시간 유효하다. 이 프로세스는 상시 실행되는 서버라
// (Edge Function과 달리 인스턴스가 수시로 재활용되지 않는다) 메모리 캐시가
// 훨씬 안정적으로 유지된다.
let cachedToken = null; // { token, expiresAt }

function getPpurioToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return Promise.resolve(cachedToken.token);
  const basic = 'Basic ' + Buffer.from(`${PPURIO_ACCOUNT}:${PPURIO_TOKEN}`).toString('base64');
  return fetch(`${PPURIO_API_URL}/v1/token`, { method: 'POST', headers: { Authorization: basic } })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.token) {
        throw new Error(`뿌리오 토큰 발급 실패 (HTTP ${res.status}): ${body?.description || JSON.stringify(body)}`);
      }
      cachedToken = { token: body.token, expiresAt: Date.now() + 23 * 3600 * 1000 }; // 24시간보다 여유 있게
      return body.token;
    });
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

  const from = (payload.from || PPURIO_SENDER || '').replace(/[^0-9]/g, '');
  const content = (payload.content || '').trim();
  const targets = Array.isArray(payload.targets) ? payload.targets : [];

  if (!from) return sendJson(res, 400, { error: '발신번호가 없습니다.' });
  if (!content) return sendJson(res, 400, { error: '내용이 없습니다.' });
  if (!targets.length) return sendJson(res, 400, { error: '받는 사람이 없습니다.' });
  if (targets.length > MAX_TARGETS) return sendJson(res, 400, { error: `한 번에 최대 ${MAX_TARGETS}명까지 보낼 수 있습니다.` });

  const bytes = byteLength(content);
  if (bytes > LMS_BYTE_LIMIT) return sendJson(res, 400, { error: `내용이 너무 깁니다 (${bytes}byte, 최대 ${LMS_BYTE_LIMIT}byte).` });
  const messageType = bytes > SMS_BYTE_LIMIT ? 'LMS' : 'SMS';

  const cleanTargets = targets.map((t) => ({ to: (t.to || '').replace(/[^0-9]/g, ''), ...(t.name ? { name: t.name } : {}) }));
  if (cleanTargets.some((t) => !t.to)) return sendJson(res, 400, { error: '받는 사람 번호에 유효하지 않은 값이 있습니다.' });

  try {
    const accessToken = await getPpurioToken();
    const ppurioRes = await fetch(`${PPURIO_API_URL}/v1/message`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: PPURIO_ACCOUNT,
        messageType,
        content,
        from,
        duplicateFlag: 'Y',
        refKey: payload.refKey || undefined,
        targetCount: cleanTargets.length,
        targets: cleanTargets,
      }),
    });
    const body = await ppurioRes.json().catch(() => null);
    if (!ppurioRes.ok) {
      return sendJson(res, 502, { error: `뿌리오 발송 실패 (HTTP ${ppurioRes.status}): ${body?.description || JSON.stringify(body)}` });
    }
    return sendJson(res, 200, { ok: true, messageType, byteLength: bytes, messageKey: body?.messageKey, raw: body });
  } catch (e) {
    // 토큰이 만료돼 뿌리오가 거부했을 가능성에 대비해 캐시를 비우고, 다음 요청에서 새로 받게 한다.
    cachedToken = null;
    return sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });

  if (req.method !== 'POST' || req.url !== '/send-sms') return sendJson(res, 404, { error: 'not found' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${RELAY_SECRET}`) return sendJson(res, 401, { error: '인증되지 않은 요청입니다.' });

  try {
    await handleSendSms(req, res);
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => console.log(`sms-relay listening on :${PORT}`));
