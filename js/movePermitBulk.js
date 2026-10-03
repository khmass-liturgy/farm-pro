// ─── 이동승인서: 엑셀 명단 일괄 발급 · PDF 저장 · 이메일 발송 ──────────────────
// 기준 양식은 "양식 다운로드"로 받는 엑셀(번호·운송인성명·운송차량번호·반출일·시료채취일·
// 품종·발급일)이다. 한 줄 = 승인서 한 장(차량 한 대)이고, 농장은 줄마다 적지 않고 업로드할
// 때 한 번 고른다. 발급대장 월별 시트(농장주·농장명 열이 있는 형식)도 그대로 읽는다.
// 열 이름(머리글)으로 찾기 때문에 열 순서가 달라도 되고, 아래 MP_BULK_ALIASES의 이름이면 인식한다.
//
// PDF는 인쇄 서식(buildMovePermitHtml)을 화면 밖에서 그린 뒤 이미지로 캡처해 A4 한 쪽씩
// 넣는다(글자 선택은 안 되지만 인쇄본과 똑같은 모양). 라이브러리는 처음 쓸 때만 불러온다.
//
// 이메일은 이 앱에 서버가 없어서 사용자의 Gmail로 직접 보낸다(Gmail API, gmail.send 범위).
// 구글 클라우드 설정은 js/googleDrive.js 머리말의 절차와 같고, 같은 OAuth 클라이언트에
// "Gmail API 사용 설정"과 "gmail.send 범위"만 추가하면 된다.

const MP_BULK_ALIASES = {
  issueDate: ['발급일', '발급날자', '발급날짜', '날자', '날짜'],
  owner: ['농장주', '대표자', '축주명', '축주'],
  address: ['주소'],
  carrierName: ['이름', '운송인', '운송인성명', '성명'],
  vehicleNo: ['차량번호', '운송차량번호'],
  farmName: ['농장명'],
  ownerBirth: ['주민번호', '주민등록번호', '생년월일'],
  phone: ['전화번호', '연락처'],
  shipCount: ['출하수수', '사육두수', '수수'],
  species: ['축종'],
  breed: ['품종'],
  ageLabel: ['출하일령', '일령', '주령'],
  shipTo: ['출하처'],
  note: ['비고'],
  samplingDate: ['시료채취일'],
  releaseDate: ['출하일', '반출일'],
};

const mpNorm = s => String(s ?? '').replace(/\s+/g, '');
const mpClean = v => {
  const s = String(v ?? '').trim();
  return s === '-' ? '' : s;
};

// hint: 연도가 없는 "10-4" 같은 값의 연도를 정할 기준 날짜(발급일). 기준일에 가장 가까운 해를 고른다.
function mpBulkDate(v, hint) {
  if (v == null || v === '' || v === '-') return null;
  if (typeof v === 'string' && hint) {
    const md = v.trim().match(/^(\d{1,2})[-./](\d{1,2})$/);
    if (md) {
      const base = new Date(hint + 'T12:00:00');
      const best = [-1, 0, 1].map(d => new Date(base.getFullYear() + d, Number(md[1]) - 1, Number(md[2]), 12))
        .sort((a, b) => Math.abs(a - base) - Math.abs(b - base))[0];
      return `${best.getFullYear()}-${String(best.getMonth() + 1).padStart(2, '0')}-${String(best.getDate()).padStart(2, '0')}`;
    }
  }
  if (v instanceof Date && !isNaN(v)) {
    // SheetJS의 날짜는 시간대 때문에 몇 시간 어긋날 수 있어 정오로 밀어 날짜가 바뀌지 않게 한다.
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : null;
  }
  const m = String(v).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

// 머리글 행(농장주·차량번호가 함께 있는 행)을 찾아 열 번호를 알려준다. 없으면 null.
function mpFindHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const cells = (rows[r] || []).map(mpNorm);
    const col = {};
    for (const [key, names] of Object.entries(MP_BULK_ALIASES)) {
      const i = cells.findIndex(c => names.includes(c));
      if (i >= 0) col[key] = i;
    }
    if (col.vehicleNo != null && (col.owner != null || col.carrierName != null)) return { row: r, col };
  }
  return null;
}

function mpSheetRows(wb, sheetName) {
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
}

// 시트 하나를 승인서 초안 목록으로 바꾼다. 농장 매칭·중복 검사까지 여기서 한다.
// defaultFarm: 명단에 농장주 열이 없을 때(기준 양식) 모든 줄에 적용할 농장.
function mpParseRoster(rows, defaultFarm) {
  const head = mpFindHeader(rows);
  if (!head) return null;
  const farms = load('farms');
  const existing = load('movePermits');
  const out = [];
  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = key => (head.col[key] == null ? null : row[head.col[key]]);
    const owner = mpClean(get('owner'));
    const carrierName = mpClean(get('carrierName'));
    const vehicleNo = mpClean(get('vehicleNo'));
    if (!owner && !carrierName && !vehicleNo && !mpClean(get('farmName'))) continue; // 빈 줄
    const sheetFarmName = mpClean(get('farmName'));

    const owned = farms.filter(f => owner && f.owner === owner);
    const farm = owner
      ? ((sheetFarmName && owned.find(f => f.name === sheetFarmName)) || (owned.length === 1 ? owned[0] : null))
      : (defaultFarm || null);

    const species = mpClean(get('species')) || farm?.type || '';
    const farmName = sheetFarmName || farm?.name || '';
    // 숫자만 적었으면 산란계·종계는 주령, 그 외(육계 등)는 일령으로 붙인다.
    const ageRaw = mpClean(get('ageLabel'));
    const ageLabel = /^\d+(\.\d+)?$/.test(ageRaw) ? `${ageRaw}${/산란|종계/.test(species) ? '주령' : '일령'}` : ageRaw;
    const isBreeder = /종계/.test(species) || /종계장/.test(farmName);
    const issueDate = mpBulkDate(get('issueDate'));
    const releaseDate = mpBulkDate(get('releaseDate'), issueDate || mpBulkDate(get('samplingDate'))) || issueDate;
    const shipCount = get('shipCount') == null || mpClean(get('shipCount')) === '' ? null : Number(String(get('shipCount')).replace(/,/g, ''));
    const noteRaw = mpClean(get('note'));
    const birthRaw = mpClean(get('ownerBirth')).replace(/-/g, '');
    const phoneLike = /^[\d-]{9,}$/.test(noteRaw);

    const draft = {
      formType: isBreeder ? 'breeder' : 'general',
      issueDate, farmId: farm?.id || null, farmName,
      owner: owner || farm?.owner || '',
      address: mpClean(get('address')) || farm?.address || '',
      phone: mpClean(get('phone')) || farm?.phone || '',
      ownerBirth: birthRaw ? birthRaw.slice(0, 6) : (farm?.owner_birth ? farm.owner_birth.replace(/-/g, '').slice(2) : ''),
      headCount: shipCount != null && !isNaN(shipCount) ? shipCount : (farm?.count ?? null),
      shipCount: isBreeder && shipCount != null && !isNaN(shipCount) ? shipCount : null,
      clinicalSigns: [], deadCount: null, layingRate: null, clinicalResult: '정상',
      samplingDate: mpBulkDate(get('samplingDate'), issueDate) || (!isBreeder && releaseDate ? mpShiftDate(releaseDate, -2) : null),
      testResult: '음성', test16w: false, test36w: false, test56w: false, mgVaccine: '',
      shipTo: mpClean(get('shipTo')), releaseDate,
      vehicleNo, species, breed: mpClean(get('breed')) || '', ageLabel,
      carrierName, carrierPhone: isBreeder && phoneLike ? noteRaw : '',
      note: isBreeder && phoneLike ? '' : noteRaw,
    };

    const issues = [];
    if (!draft.issueDate) issues.push('발급일 없음');
    if (!draft.farmName) issues.push(owner ? '농장명 없음' : '농장을 선택하세요');
    const invalid = issues.length > 0;
    if (!invalid && !farm) issues.push('농장 목록에 없음(명단 정보로 발급)');
    if (!vehicleNo) issues.push('차량번호 없음');
    const dup = !invalid && existing.some(m => m.issueDate === draft.issueDate && m.vehicleNo === draft.vehicleNo && m.owner === draft.owner && !!draft.vehicleNo);
    if (dup) issues.push('이미 발급됨');
    out.push({ draft, issues, invalid, dup, matched: !!farm, include: !invalid && !dup, sheetRow: r + 1 });
  }
  return out;
}

function mpShiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── 업로드 → 미리보기 모달 ─────────────────────────────────────────────────
let mpBulkWb = null;
let mpBulkRows = [];

async function onMpBulkFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    mpBulkWb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  } catch (err) { alert('엑셀 파일을 읽지 못했습니다: ' + err.message); return; }
  const usable = mpBulkWb.SheetNames.filter(n => mpFindHeader(mpSheetRows(mpBulkWb, n)));
  if (!usable.length) {
    alert('명단을 찾지 못했습니다.\n머리글 행에 "운송인성명"과 "운송차량번호" 열이 있는 시트가 필요합니다. "양식 다운로드"로 받은 엑셀 양식을 사용해주세요.');
    return;
  }
  populateFarmSelect('mpbulk-farm', '');
  const sel = document.getElementById('mpbulk-sheet');
  // 발급대장처럼 시트가 여러 개인 파일은 마지막 시트가 가장 최근 달인 경우가 많다.
  sel.innerHTML = usable.map(n => `<option value="${n}">${n}</option>`).join('');
  sel.value = usable[usable.length - 1];
  document.getElementById('mpbulk-file-name').textContent = file.name;

  loadMpBulkSheet();
  openModal('modal-mp-bulk');
}

// 발급번호는 "발급일(YYMMDD)-일련번호"(예: 261003-1)로 자동 부여한다. 같은 날짜로 이미 발급한
// 번호가 있으면 그 다음부터 이어 붙이고, 이번 명단 안에서는 줄 순서대로 매긴다.

function mpBulkDocNos() {
  const next = {};
  const out = {};
  mpBulkRows.forEach((r, i) => {
    if (!r.include) return;
    const prefix = mpDocPrefixOf(r.draft.issueDate);
    if (next[prefix] == null) next[prefix] = mpNextSerial(prefix);
    out[i] = { prefix, serial: next[prefix]++ };
  });
  return out;
}

function loadMpBulkSheet() {
  const name = document.getElementById('mpbulk-sheet').value;
  const farm = load('farms').find(f => f.id === document.getElementById('mpbulk-farm').value) || null;
  mpBulkRows = mpParseRoster(mpSheetRows(mpBulkWb, name), farm) || [];
  renderMpBulkPreview();
}

function toggleMpBulkRow(i, checked) { mpBulkRows[i].include = checked; renderMpBulkPreview(); }
function toggleMpBulkAll(checked) {
  mpBulkRows.forEach(r => { if (!r.invalid) r.include = checked; });
  renderMpBulkPreview();
}

function renderMpBulkPreview() {
  const n = mpBulkRows.filter(r => r.include).length;
  document.getElementById('mpbulk-count').textContent =
    `명단 ${mpBulkRows.length}줄 중 ${n}건을 발급합니다` +
    (mpBulkRows.some(r => r.dup) ? ' (이미 발급된 건은 기본으로 제외)' : '');
  const btn = document.getElementById('mpbulk-issue-btn');
  btn.disabled = n === 0;
  btn.textContent = n ? `${n}건 일괄 발급` : '일괄 발급';
  document.getElementById('mpbulk-check-all').checked = mpBulkRows.length > 0 && mpBulkRows.filter(r => !r.invalid).every(r => r.include);
  const nos = mpBulkDocNos();
  document.getElementById('mpbulk-tbody').innerHTML = mpBulkRows.map((r, i) => {
    const d = r.draft;
    return `<tr${r.invalid ? ' style="opacity:.5"' : ''}>
      <td style="text-align:center"><input type="checkbox" ${r.include ? 'checked' : ''} ${r.invalid ? 'disabled' : ''} onchange="toggleMpBulkRow(${i}, this.checked)"></td>
      <td>${r.sheetRow}</td>
      <td>${nos[i] ? `${nos[i].prefix}-${nos[i].serial}` : '-'}</td>
      <td>${d.issueDate || '-'}</td>
      <td><strong>${d.farmName || '-'}</strong><div style="font-size:11px;color:var(--text-secondary)">${d.owner || ''}</div></td>
      <td>${d.carrierName || '-'}<div style="font-size:11px;color:var(--text-secondary)">${d.vehicleNo || ''}</div></td>
      <td>${d.headCount != null ? Number(d.headCount).toLocaleString() : '-'}</td>
      <td>${d.species || '-'}${d.ageLabel ? `<div style="font-size:11px;color:var(--text-secondary)">${d.ageLabel}</div>` : ''}</td>
      <td>${d.shipTo || '-'}</td>
      <td>${d.formType === 'breeder' ? '종계장' : '일반'}</td>
      <td style="font-size:11px;color:${r.invalid ? 'var(--red)' : 'var(--text-secondary)'}">${r.issues.join(' · ') || '정상'}</td>
    </tr>`;
  }).join('');
}

async function issueMpBulk() {
  const rows = mpBulkRows.filter(r => r.include);
  if (!rows.length) return;
  const nos = mpBulkDocNos();
  const first = nos[mpBulkRows.indexOf(rows[0])], last = nos[mpBulkRows.indexOf(rows[rows.length - 1])];
  if (!confirm(`이동승인서 ${rows.length}건을 발급합니다.\n발급번호: ${first.prefix}-${first.serial} ~ ${last.prefix}-${last.serial}\n\n계속하시겠습니까?`)) return;

  const btn = document.getElementById('mpbulk-issue-btn');
  const email = await currentUserEmail();
  const issuedIds = [];
  btn.disabled = true;
  try {
    for (let i = 0; i < rows.length; i++) {
      btn.textContent = `발급 중... ${i + 1}/${rows.length}`;
      const no = nos[mpBulkRows.indexOf(rows[i])];
      const data = { ...rows[i].draft, docNoPrefix: no.prefix, docNoSerial: no.serial, issuedByEmail: email };
      const saved = await insertRow('movePermits', data);
      issuedIds.push(saved.id);
    }
  } catch (e) {
    alert(`${issuedIds.length}건 발급 후 중단되었습니다: ${e.message}\n이미 발급된 건은 목록에 남아 있으니, 다시 시도하기 전에 목록을 확인하세요.`);
    renderMovePermits();
    btn.disabled = false;
    return;
  }
  closeModal('modal-mp-bulk');
  mpSelectedIds = new Set(issuedIds); // 방금 발급한 건을 바로 PDF·이메일·인쇄할 수 있게 체크해 둔다
  populateMpFarmFilter();
  renderMovePermits();
  alert(`${issuedIds.length}건을 발급했습니다. 발급한 건이 체크되어 있으니 바로 PDF 저장·이메일·인쇄를 할 수 있습니다.`);
}

// ─── PDF ────────────────────────────────────────────────────────────────────
const MP_PDF_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];
const mpLibPromises = {};
function mpLoadScript(url) {
  if (!mpLibPromises[url]) {
    mpLibPromises[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.onload = resolve;
      s.onerror = () => { delete mpLibPromises[url]; reject(new Error('PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
      document.head.appendChild(s);
    });
  }
  return mpLibPromises[url];
}

function mpSelectedPermits() {
  return load('movePermits').filter(m => mpSelectedIds.has(m.id)).sort((a, b) =>
    (a.issueDate || '').localeCompare(b.issueDate || '') ||
    (a.docNoPrefix || '').localeCompare(b.docNoPrefix || '') || (a.docNoSerial ?? 0) - (b.docNoSerial ?? 0));
}

// 서식 CSS(.mp-table·.rx-table 등)는 전부 css/styles.css의 @media print 안에 있어서, 일반 화면에
// 그냥 그리면 스타일이 빠진다. 그래서 "@media print"를 "@media all"로 바꾼 CSS를 넣은 숨은
// iframe 안에서 서식을 그리고 캡처한다(앱 화면 자체에는 인쇄용 규칙이 새지 않는다).
let mpPdfCssPromise = null;
function mpPrintCss() {
  if (!mpPdfCssPromise) {
    const href = document.querySelector('link[rel="stylesheet"][href*="styles.css"]')?.href;
    mpPdfCssPromise = fetch(href).then(r => r.text()).then(t => t.replace('@media print', '@media all'));
  }
  return mpPdfCssPromise;
}

async function buildMovePermitsPdf(list, onProgress) {
  await Promise.all(MP_PDF_LIBS.map(mpLoadScript));
  const css = await mpPrintCss();
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1200px;border:0;';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><base href="${document.baseURI}"><style>${css}</style></head><body><div id="print-area"></div></body></html>`);
    doc.close();
    const area = doc.getElementById('print-area');
    for (let i = 0; i < list.length; i++) {
      if (onProgress) onProgress(i + 1, list.length);
      area.innerHTML = buildMovePermitHtml(list[i]);
      await Promise.all([...area.querySelectorAll('img')].map(img => img.complete ? null : new Promise(res => { img.onload = img.onerror = res; })));
      // 도장 이미지가 서명줄 아래로 삐져나오므로 캡처 영역 아래에 여백을 둬서 잘리지 않게 한다.
      area.querySelector('.print-page').style.paddingBottom = '16mm';
      const canvas = await window.html2canvas(area.querySelector('.print-page'), { scale: 1.6, backgroundColor: '#fff', useCORS: true });
      let w = 190, h = canvas.height * w / canvas.width;
      if (h > 277) { h = 277; w = canvas.width * h / canvas.height; }
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 10, 10, w, h);
    }
  } finally { frame.remove(); }
  return pdf;
}

function mpPdfFileName(list) {
  const d = (list[0]?.issueDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  return `이동승인서_${d}_${list.length}건.pdf`;
}

async function downloadSelectedMovePermitsPdf() {
  const list = mpSelectedPermits();
  if (!list.length) { alert('PDF로 저장할 이동승인서를 먼저 체크해주세요.'); return; }
  const btn = document.getElementById('mp-pdf-btn');
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const pdf = await buildMovePermitsPdf(list, (i, n) => { btn.textContent = `PDF 만드는 중 ${i}/${n}`; });
    pdf.save(mpPdfFileName(list));
  } catch (e) { alert('PDF 저장 실패: ' + e.message); }
  btn.textContent = label;
  btn.disabled = mpSelectedIds.size === 0;
}

// ─── 이메일 (Gmail API) ─────────────────────────────────────────────────────
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
let gmailTokenClient = null;
let gmailAccessToken = null;

// 반드시 사용자의 클릭 처리 안에서 동기적으로 시작해야 한다(그렇지 않으면 브라우저가
// 구글 동의 팝업을 조용히 막는다 — js/googleDrive.js의 saveMedicationLog 참고).
function getGmailAccessToken() {
  return new Promise((resolve, reject) => {
    if (!window.GOOGLE_DRIVE_CLIENT_ID) { reject(new Error('구글 연동(GOOGLE_DRIVE_CLIENT_ID)이 설정되지 않았습니다.')); return; }
    if (typeof google === 'undefined' || !google.accounts?.oauth2) { reject(new Error('구글 로그인 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.')); return; }
    if (gmailAccessToken && gmailAccessToken.expiresAt > Date.now() + 30000) { resolve(gmailAccessToken.token); return; }
    if (!gmailTokenClient) {
      gmailTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.GOOGLE_DRIVE_CLIENT_ID, scope: GMAIL_SCOPE, callback: () => {},
      });
    }
    gmailTokenClient.callback = resp => {
      if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
      gmailAccessToken = { token: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 };
      resolve(resp.access_token);
    };
    gmailTokenClient.error_callback = err => reject(new Error(err?.message || '구글 로그인이 취소되었습니다.'));
    gmailTokenClient.requestAccessToken({ prompt: '' });
  });
}

const mpB64Utf8 = s => btoa(unescape(encodeURIComponent(s)));
const mpWrap76 = s => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();

// 한글 제목은 RFC 2047 인코딩 단어로 바꾼다(한 단어는 75자 이내라 글자 단위로 나눠 이어 붙임).
function mpEncodeHeader(s) {
  const words = []; let cur = '', bytes = 0;
  for (const ch of s) {
    const b = unescape(encodeURIComponent(ch)).length;
    if (bytes + b > 42) { words.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  if (cur) words.push(cur);
  return words.map(w => `=?UTF-8?B?${mpB64Utf8(w)}?=`).join('\r\n ');
}

function buildMpMime({ to, subject, body, filename, pdfBase64 }) {
  const boundary = '=_mp_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  return [
    `To: ${to}`,
    `Subject: ${mpEncodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    mpWrap76(mpB64Utf8(body)),
    `--${boundary}`,
    `Content-Type: application/pdf; name="move_permits.pdf"; name*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="move_permits.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    '',
    mpWrap76(pdfBase64),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

const MP_EMAIL_TO_KEY = 'mp_email_to';

function openMpEmailModal() {
  const list = mpSelectedPermits();
  if (!list.length) { alert('이메일로 보낼 이동승인서를 먼저 체크해주세요.'); return; }
  let to = '';
  try { to = localStorage.getItem(MP_EMAIL_TO_KEY) || ''; } catch (e) { /* 저장값 없이 진행 */ }
  document.getElementById('mpmail-to').value = to;
  document.getElementById('mpmail-subject').value = `[대한동물병원] 이동승인서 ${list.length}건 (${list[0].issueDate}${list[list.length - 1].issueDate !== list[0].issueDate ? ' ~ ' + list[list.length - 1].issueDate : ''})`;
  document.getElementById('mpmail-body').value = `안녕하세요. 대한동물병원입니다.\n이동승인서 ${list.length}건을 PDF로 첨부합니다.`;
  document.getElementById('mpmail-summary').textContent = `첨부: ${mpPdfFileName(list)} — ${list.map(m => `${m.farmName}${m.vehicleNo ? '(' + m.vehicleNo + ')' : ''}`).join(', ')}`;
  document.getElementById('mpmail-status').textContent = '';
  document.getElementById('mpmail-send-btn').disabled = false;
  openModal('modal-mp-email');
}

async function sendMpEmail() {
  const to = document.getElementById('mpmail-to').value.split(/[,;\s]+/).filter(Boolean);
  if (!to.length || to.some(a => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))) { alert('받는 사람 이메일 주소를 올바르게 입력해주세요(여러 명은 쉼표로 구분).'); return; }
  const subject = document.getElementById('mpmail-subject').value.trim();
  if (!subject) { alert('제목을 입력해주세요.'); return; }
  const list = mpSelectedPermits();
  if (!list.length) { alert('선택된 이동승인서가 없습니다.'); return; }

  const btn = document.getElementById('mpmail-send-btn');
  const status = document.getElementById('mpmail-status');
  btn.disabled = true;
  status.textContent = '구글 로그인 확인 중...';
  // 클릭 직후(어떤 await보다 먼저) 토큰 요청을 시작한다. 아니면 동의 팝업이 막힌다.
  const tokenPromise = getGmailAccessToken();
  tokenPromise.catch(() => {});
  try {
    const pdf = await buildMovePermitsPdf(list, (i, n) => { status.textContent = `PDF 만드는 중 ${i}/${n}`; });
    const token = await tokenPromise;
    status.textContent = '메일 보내는 중...';
    const mime = buildMpMime({
      to: to.join(', '), subject, body: document.getElementById('mpmail-body').value,
      filename: mpPdfFileName(list), pdfBase64: pdf.output('datauristring').split('base64,')[1],
    });
    const res = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' }, body: mime,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      throw new Error(res.status === 403 || res.status === 401
        ? `${msg}\n(구글 클라우드에서 Gmail API 사용 설정과 gmail.send 범위 추가가 되어 있는지 확인하세요)` : msg);
    }
    try { localStorage.setItem(MP_EMAIL_TO_KEY, to.join(', ')); } catch (e) { /* 기억 못 해도 발송엔 지장 없음 */ }
    closeModal('modal-mp-email');
    alert(`${to.join(', ')} 로 이동승인서 ${list.length}건을 보냈습니다.`);
  } catch (e) {
    status.textContent = '';
    alert('이메일 발송 실패: ' + e.message);
    btn.disabled = false;
  }
}

// ─── 양식 다운로드 ──────────────────────────────────────────────────────────
function downloadMpTemplate() {
  const header = ['번호', '운송인성명', '운송차량번호', '반출일', '시료채취일', '축종', '품종', '출하일령', '발급일', '출하처'];
  const aoa = [['이동승인서 발급'], header, ...Array.from({ length: 10 }, (_, i) => [i + 1, '', '', '', '', '', '', '', '', ''])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  const guide = XLSX.utils.aoa_to_sheet([
    ['이동승인서 일괄 발급 양식 작성 방법'],
    [''],
    ['· 한 줄이 승인서 한 장(차량 한 대)입니다. 첫 시트의 2번째 줄(머리글)은 지우거나 바꾸지 마세요.'],
    ['· 농장은 파일에 적지 않습니다. 업로드할 때 화면에서 한 번 선택합니다(농장 정보·사육두수·축종은 농장 등록 정보를 씁니다).'],
    ['· 운송인성명, 운송차량번호: 승인서에 그대로 인쇄됩니다.'],
    ['· 반출일: 10-4 또는 2026-10-04 형식. 연도를 안 적으면 발급일에 가장 가까운 해로 봅니다.'],
    ['· 시료채취일, 발급일: 2026-10-02 형식. 시료채취일을 비우면 반출일 2일 전으로 채웁니다.'],
    ['· 축종: 예) 산란계, 육계. 비우면 농장 등록 정보의 축종을 씁니다.'],
    ['· 품종: 예) 하이라인.'],
    ['· 출하일령: 예) 95주령, 35일령. 숫자만 적으면 산란계·종계는 "주령", 그 외는 "일령"으로 붙입니다.'],
    ['· 출하처: 예) 한려식품. 승인서의 출하처 칸에 인쇄됩니다.'],
    ['· 발급번호는 적지 않습니다. 발급일 기준으로 "YYMMDD-번호"(예: 261003-1)가 자동으로 붙습니다.'],
    ['· 번호 열은 참고용이며, 운송인·차량번호가 모두 비어 있는 줄은 건너뜁니다.'],
  ]);
  guide['!cols'] = [{ wch: 110 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '이동승인서 발급');
  XLSX.utils.book_append_sheet(wb, guide, '작성방법');
  XLSX.writeFile(wb, '이동승인서_일괄발급_양식.xlsx');
}
