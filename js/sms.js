// ─── 문자 발송 (알리고 SMS API, Supabase Edge Function 경유) ────────────────
// 알리고 인증키는 이 파일 어디에도 없다. 여기서는 수신자(등록된 농장) 선택 UI와
// 바이트수 표시만 담당하고, 실제 발송은 sb.functions.invoke('send-sms', ...)로
// Edge Function(supabase/functions/send-sms)에 위임한다 — 인증키는 그 함수의
// 서버 쪽 환경변수에만 있고 브라우저로는 절대 내려오지 않는다.
//
// 내용은 지금은 "직접입력"만 지원한다. 처방전/투약프로그램/보고서 내용을 자동으로
// 채워 넣는 건 추후 필요에 맞게 추가한다(각 화면에서 이 모달을 프리필해 열도록 하면 됨).
//
// 수신자는 두 가지를 섞어서 쓸 수 있다: 등록된 농장 선택 + 번호 직접 입력.
// 아직 농장으로 등록하지 않은 곳(신규 상담처 등)에도 보내야 하는 경우가 있어서다.

const SMS_BYTE_LIMIT_SMS = 90;   // 표준 단문(SMS) 바이트 한도
const SMS_BYTE_LIMIT_LMS = 2000; // 장문(LMS) 바이트 한도(알리고 기준)
const SMS_MAX_TARGETS = 50;      // 1회 발송 상한 — Edge Function/sms-relay의 MAX_TARGETS와 같은 값이어야 한다

let smsSelectedFarmIds = new Set();

// "01012345678, 010-9876-5432" 처럼 자유롭게 적은 걸 숫자만 남긴 번호 배열로 바꾼다.
// 구분자로 쉼표·세미콜론·공백·줄바꿈을 모두 허용한다 — 엑셀이나 메모에서 그대로
// 붙여넣는 경우가 많아 형식을 강제하면 오히려 쓰기 불편해지기 때문이다.
function parseSmsManualNumbers() {
  const raw = document.getElementById('sms-manual-numbers')?.value || '';
  return raw.split(/[,;\s]+/).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean);
}

// 국내 번호는 지역번호 포함 9~11자리다. 이 범위를 벗어나면 오타로 보고 발송 전에 막는다.
function invalidSmsNumbers(numbers) {
  return numbers.filter(n => n.length < 9 || n.length > 11);
}

// EUC-KR 근사 바이트 계산: ASCII 1바이트, 그 외(한글 등)는 2바이트로 어림한다.
// supabase/functions/send-sms/index.ts의 byteLength()와 반드시 같은 방식이어야
// 한다 — 여기서 "SMS"로 보여준 걸 서버(알리고)가 "LMS"로 판정하면 요금/글자수가 어긋난다.
function smsByteLength(text) {
  let bytes = 0;
  for (const ch of text) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

function openSmsModal() {
  smsSelectedFarmIds = new Set();
  document.getElementById('sms-farm-search').value = '';
  document.getElementById('sms-manual-numbers').value = '';
  document.getElementById('sms-from').value = DEFAULT_VET_PHONE;
  document.getElementById('sms-content').value = '';
  renderSmsFarmList();
  updateSmsByteCount();
  openModal('modal-sms');
}

function renderSmsFarmList() {
  const q = (document.getElementById('sms-farm-search').value || '').toLowerCase();
  const farms = farmsByOwner().filter(f =>
    !q || f.name.toLowerCase().includes(q) || (f.owner || '').toLowerCase().includes(q));
  const list = document.getElementById('sms-farm-list');
  if (!farms.length) { list.innerHTML = '<div class="text-muted" style="padding:8px">검색 결과가 없습니다.</div>'; return; }
  list.innerHTML = farms.map(f => {
    const checked = smsSelectedFarmIds.has(f.id) ? 'checked' : '';
    const noPhone = !f.phone;
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;${noPhone ? 'opacity:0.5' : ''}">
      <input type="checkbox" style="width:auto;flex:none" ${checked} ${noPhone ? 'disabled' : ''} onchange="toggleSmsFarm('${f.id}', this.checked)">
      <span style="flex:1">${f.name} <span class="text-muted">(${f.owner})</span></span>
      <span class="text-muted" style="font-size:11px">${f.phone || '연락처 없음'}</span>
    </label>`;
  }).join('');
  updateSmsRecipientSummary();
}

function toggleSmsFarm(farmId, checked) {
  if (checked) smsSelectedFarmIds.add(farmId); else smsSelectedFarmIds.delete(farmId);
  updateSmsRecipientSummary();
}

function updateSmsRecipientSummary() {
  const manual = parseSmsManualNumbers();
  const total = smsSelectedFarmIds.size + manual.length;
  const el = document.getElementById('sms-recipient-summary');
  if (!total) { el.textContent = '선택된 수신자 없음'; el.style.color = ''; return; }

  const parts = [];
  if (smsSelectedFarmIds.size) parts.push(`농장 ${smsSelectedFarmIds.size}곳`);
  if (manual.length) parts.push(`직접입력 ${manual.length}개`);
  // 중복은 발송 시점에 합쳐지므로 여기 숫자는 "고르신 개수"이고, 실제 발송 건수는 이보다 적을 수 있다.
  let text = `선택된 수신자 ${total}명 (${parts.join(' + ')})`;

  const bad = invalidSmsNumbers(manual);
  if (bad.length) text += ` — 번호 형식 오류: ${bad.join(', ')}`;
  else if (total > SMS_MAX_TARGETS) text += ` — 1회 최대 ${SMS_MAX_TARGETS}명까지만 보낼 수 있습니다`;

  el.textContent = text;
  el.style.color = (bad.length || total > SMS_MAX_TARGETS) ? 'var(--red)' : '';
}

function updateSmsByteCount() {
  const bytes = smsByteLength(document.getElementById('sms-content').value);
  const type = bytes > SMS_BYTE_LIMIT_SMS ? 'LMS' : 'SMS';
  const limit = type === 'SMS' ? SMS_BYTE_LIMIT_SMS : SMS_BYTE_LIMIT_LMS;
  const el = document.getElementById('sms-byte-count');
  el.textContent = `${bytes} byte (${type} 예상, 최대 ${limit}byte)` + (bytes > limit ? ' — 한도 초과!' : '');
  el.style.color = bytes > limit ? 'var(--red)' : '';
}

// sb.functions.invoke()가 실패하면 error.message는 그냥 "Edge Function returned a
// non-2xx status code"로 뭉뚱그려진다. 실제로 무엇이 잘못됐는지(뿌리오 토큰 발급
// 실패, 발신번호 미등록 등)는 error.context(원본 Response)의 JSON 본문에 들어
// 있으므로, 그걸 직접 읽어야 send-sms/index.ts가 보낸 진짜 메시지를 보여줄 수 있다.
async function extractFunctionErrorMessage(error) {
  try {
    const body = await error.context?.clone().json();
    if (body?.error) return body.error;
  } catch (e) { /* 본문이 JSON이 아니거나 이미 읽혔으면 원래 메시지로 대체 */ }
  return error.message || String(error);
}

async function sendSms() {
  const farms = load('farms').filter(f => smsSelectedFarmIds.has(f.id));
  const manualNumbers = parseSmsManualNumbers();
  if (!farms.length && !manualNumbers.length) {
    alert('받는 사람을 선택하거나 번호를 직접 입력해주세요.');
    return;
  }
  const badNumbers = invalidSmsNumbers(manualNumbers);
  if (badNumbers.length) {
    alert('직접 입력한 번호 중 형식이 올바르지 않은 것이 있습니다:\n' + badNumbers.join(', '));
    return;
  }
  const content = document.getElementById('sms-content').value.trim();
  if (!content) { alert('내용을 입력해주세요.'); return; }
  if (smsByteLength(content) > SMS_BYTE_LIMIT_LMS) {
    alert(`내용이 너무 깁니다 (${smsByteLength(content)}byte, 최대 ${SMS_BYTE_LIMIT_LMS}byte).`);
    return;
  }
  const from = document.getElementById('sms-from').value.replace(/[^0-9]/g, '');
  if (!from) { alert('발신번호를 입력해주세요.'); return; }
  const withoutPhone = farms.filter(f => !f.phone);
  if (withoutPhone.length) {
    alert('연락처가 없는 농장이 있습니다: ' + withoutPhone.map(f => f.name).join(', '));
    return;
  }

  // 농장 연락처와 직접 입력한 번호가 겹치면 같은 사람이 문자를 두 번 받게 되므로 하나로 합친다.
  const targets = [];
  const seen = new Set();
  for (const f of farms) {
    const to = f.phone.replace(/[^0-9]/g, '');
    if (seen.has(to)) continue;
    seen.add(to);
    targets.push({ to, name: f.owner || '' });
  }
  for (const to of manualNumbers) {
    if (seen.has(to)) continue;
    seen.add(to);
    targets.push({ to });
  }

  // 서버(Edge Function/sms-relay)도 같은 상한을 검사하지만, 여기서 먼저 막아야
  // 사용자가 "발송 중..."을 거쳐 오류를 받는 대신 즉시 알 수 있다.
  if (targets.length > SMS_MAX_TARGETS) {
    alert(`한 번에 최대 ${SMS_MAX_TARGETS}명까지 보낼 수 있습니다. (현재 ${targets.length}명)`);
    return;
  }

  const btn = document.getElementById('sms-send-btn');
  btn.disabled = true;
  btn.textContent = '발송 중...';
  try {
    const { data, error } = await sb.functions.invoke('send-sms', { body: { from, content, targets } });
    if (error) throw new Error(await extractFunctionErrorMessage(error));
    if (data?.error) throw new Error(data.error);
    alert(`문자 발송 완료 (${targets.length}명, ${data.messageType})`);
    closeModal('modal-sms');
  } catch (e) {
    alert('문자 발송 실패: ' + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = '발송';
  }
}
