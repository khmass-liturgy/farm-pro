// ─── 문자 발송 (뿌리오 SMS API, Supabase Edge Function 경유) ────────────────
// 뿌리오 인증키는 이 파일 어디에도 없다. 여기서는 수신자(등록된 농장) 선택 UI와
// 바이트수 표시만 담당하고, 실제 발송은 sb.functions.invoke('send-sms', ...)로
// Edge Function(supabase/functions/send-sms)에 위임한다 — 인증키는 그 함수의
// 서버 쪽 환경변수에만 있고 브라우저로는 절대 내려오지 않는다.
//
// 지금은 "직접입력"만 지원한다. 처방전/투약프로그램/보고서 내용을 자동으로 채워
// 넣는 건 추후 필요에 맞게 추가한다(각 화면에서 이 모달을 프리필해 열도록 하면 됨).

const SMS_BYTE_LIMIT_SMS = 90;   // 표준 단문(SMS) 바이트 한도
const SMS_BYTE_LIMIT_LMS = 2000; // 장문(LMS) 바이트 한도(뿌리오 기준)

let smsSelectedFarmIds = new Set();

// EUC-KR 근사 바이트 계산: ASCII 1바이트, 그 외(한글 등)는 2바이트로 어림한다.
// supabase/functions/send-sms/index.ts의 byteLength()와 반드시 같은 방식이어야
// 한다 — 여기서 "SMS"로 보여준 걸 서버가 "LMS"로 판정하면 요금/글자수가 어긋난다.
function smsByteLength(text) {
  let bytes = 0;
  for (const ch of text) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

function openSmsModal() {
  smsSelectedFarmIds = new Set();
  document.getElementById('sms-farm-search').value = '';
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
      <input type="checkbox" ${checked} ${noPhone ? 'disabled' : ''} onchange="toggleSmsFarm('${f.id}', this.checked)">
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
  document.getElementById('sms-recipient-summary').textContent =
    smsSelectedFarmIds.size ? `선택된 수신자 ${smsSelectedFarmIds.size}명` : '선택된 수신자 없음';
}

function updateSmsByteCount() {
  const bytes = smsByteLength(document.getElementById('sms-content').value);
  const type = bytes > SMS_BYTE_LIMIT_SMS ? 'LMS' : 'SMS';
  const limit = type === 'SMS' ? SMS_BYTE_LIMIT_SMS : SMS_BYTE_LIMIT_LMS;
  const el = document.getElementById('sms-byte-count');
  el.textContent = `${bytes} byte (${type} 예상, 최대 ${limit}byte)` + (bytes > limit ? ' — 한도 초과!' : '');
  el.style.color = bytes > limit ? 'var(--red)' : '';
}

async function sendSmsToSelectedFarms() {
  const farms = load('farms').filter(f => smsSelectedFarmIds.has(f.id));
  if (!farms.length) { alert('받는 사람을 선택해주세요.'); return; }
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

  const targets = farms.map(f => ({ to: f.phone.replace(/[^0-9]/g, ''), name: f.owner || '' }));

  const btn = document.getElementById('sms-send-btn');
  btn.disabled = true;
  btn.textContent = '발송 중...';
  try {
    const { data, error } = await sb.functions.invoke('send-sms', { body: { from, content, targets } });
    if (error) throw error;
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
