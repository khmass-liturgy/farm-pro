// ─── 동물약품 검색 (농림축산검역본부 QIA 동물용의약품통합정보시스템 실시간 조회) ──
// daehan 프로젝트(대한가축약품 조회 웹앱)에서 쓰던 QIA 실시간 조회 로직을 그대로 옮겨왔다.
// 로컬 STORE와 무관하게 매 검색마다 QIA 서버를 직접 호출하는 순수 조회 기능.
const QIA_BASE = 'https://medi.qia.go.kr';
let dsearchMode = 'name';
let dsearchQuery = '', dsearchKind = '', dsearchPage = 1, dsearchTotal = 0;
let dsearchRows = [];
let dsearchFuzzy = false;

function setDsearchMode(mode) {
  dsearchMode = mode;
  ['name', 'entp', 'ingr'].forEach(m => document.getElementById('dsearch-mode-' + m).classList.toggle('active', m === mode));
  document.getElementById('dsearch-q').placeholder =
    mode === 'name' ? '제품명을 입력하세요 (예: 이보멕)' :
    mode === 'entp' ? '업체명을 입력하세요 (예: 베링거)' :
    '성분명을 입력하세요 (예: 이버멕틴)';
}

function parseQiaHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const getVal = td => {
    const spans = td.querySelectorAll('span');
    return spans.length >= 2 ? spans[1].textContent.trim() : td.textContent.trim();
  };
  const rows = [...doc.querySelectorAll('table tbody tr')].map(tr => {
    const tds = [...tr.querySelectorAll('td')];
    if (tds.length < 13) return null;
    const link = tds[1].querySelector('a');
    return {
      제품명: getVal(tds[1]),
      링크: link ? (QIA_BASE + link.getAttribute('href')) : '',
      제품영문명: getVal(tds[2]),
      업체명: getVal(tds[3]),
      허가일: getVal(tds[6]),
      품목구분: getVal(tds[7]),
      주성분: getVal(tds[8]),
      제조수입: getVal(tds[11]),
    };
  }).filter(Boolean);
  const m = doc.body.textContent.match(/총\s*([\d,]+)\s*건/);
  const total = m ? +m[1].replace(/,/g, '') : rows.length;
  return { rows, total };
}

async function fetchQiaSearch(term, page) {
  const params = new URLSearchParams({ page: String(page), searchDivision: 'detail' });
  if (dsearchMode === 'name') params.set('itemName', term);
  else if (dsearchMode === 'entp') params.set('entpName', term);
  else params.set('ingrMainName', term); // 성분명 (비공식 파라미터, QIA 폼에는 노출 안 됨)
  if (dsearchKind) params.set('indutyClassCode', dsearchKind);
  const res = await fetch(QIA_BASE + '/searchMedicine?' + params.toString());
  if (!res.ok) throw new Error('QIA 서버 오류 (' + res.status + ')');
  return parseQiaHtml(await res.text());
}

function fetchQiaPage(page) {
  return fetchQiaSearch(dsearchQuery, page);
}

// ── 오타/유사 키워드 허용 검색 ─────────────────────
// 편집거리(레벤슈타인) 기반 유사도: 0(완전 다름) ~ 1(완전 일치)
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}
// 한글 초성 추출 (완성형 음절 → 초성, 이미 자모/영문/숫자는 그대로 유지)
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function toChoseong(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xAC00;
    out += (code >= 0 && code <= 11171) ? CHOSEONG[Math.floor(code / 588)] : ch;
  }
  return out;
}
// 입력이 초성(자음)으로만 이루어졌는지 (예: 'ㅇㅂㅁㅌ')
function isChoseongOnly(str) {
  const s = (str || '').replace(/\s+/g, '');
  return s.length > 0 && /^[ㄱ-ㅎ]+$/.test(s);
}

// 일반 편집거리 유사도와 초성 편집거리 유사도 중 더 높은 쪽을 채택
// → 오타(음절이 살짝 다름)와 초성 검색(자음만 일치) 둘 다 자연스럽게 커버됨
function qiaSimilarity(a, b) {
  a = (a || '').toLowerCase().replace(/\s+/g, '');
  b = (b || '').toLowerCase().replace(/\s+/g, '');
  if (!a || !b) return 0;
  const litSim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const choSim = 1 - levenshtein(toChoseong(a), toChoseong(b)) / Math.max(a.length, b.length);
  return Math.max(litSim, choSim);
}

// 정확검색 실패시 시도할 후보어 생성: 공백 토큰(긴 것부터) + 뒤에서부터 한 글자씩 줄인 접두사
function qiaFuzzyCandidates(q) {
  const seen = new Set([q]);
  const list = [];
  q.split(/\s+/).filter(t => t.length >= 2).sort((a, b) => b.length - a.length).forEach(t => {
    if (!seen.has(t)) { seen.add(t); list.push(t); }
  });
  for (let len = q.length - 1; len >= 2; len--) {
    const p = q.slice(0, len);
    if (!seen.has(p)) { seen.add(p); list.push(p); }
  }
  return list;
}

// 후보어들로 QIA를 순차 조회, 결과를 모아 원래 검색어와의 유사도순으로 정렬
async function fuzzySearchQia(q) {
  const candidates = qiaFuzzyCandidates(q);
  const collected = new Map();
  let tries = 0;
  for (const cand of candidates) {
    if (tries >= 6 || collected.size >= 60) break;
    tries++;
    try {
      const { rows } = await fetchQiaSearch(cand, 1);
      rows.forEach(r => {
        const key = r.링크 || (r.제품명 + '|' + r.업체명);
        if (!collected.has(key)) collected.set(key, r);
      });
    } catch (e) { /* 후보 하나 실패해도 계속 진행 */ }
    if (collected.size >= 15) break;
  }
  const field = dsearchMode === 'name' ? '제품명' : dsearchMode === 'entp' ? '업체명' : '주성분';
  const scored = [...collected.values()]
    .map(r => ({ ...r, _sim: qiaSimilarity(q, r[field]) }))
    .filter(r => r._sim >= 0.3)
    .sort((a, b) => b._sim - a._sim);
  return scored.slice(0, 30);
}

async function searchDrugQia() {
  const q = document.getElementById('dsearch-q').value.trim();
  dsearchKind = document.getElementById('dsearch-kind').value;
  const result = document.getElementById('dsearch-result');
  if (!q) {
    result.innerHTML = '<div class="empty-state"><p>검색어를 입력하세요</p></div>';
    return;
  }
  if (isChoseongOnly(q)) {
    result.innerHTML = `<div class="empty-state"><p>초성만으로는 QIA 전체 데이터를 검색할 수 없어요<br><span class="text-muted">글자를 한 자 이상 입력해주세요 (예: 'ㅇㅂㅁㅌ' 대신 '이버' 또는 '이버멕틴')</span></p></div>`;
    return;
  }
  dsearchQuery = q;
  dsearchPage = 1;
  dsearchFuzzy = false;
  result.innerHTML = '<div class="empty-state"><p>검색 중...</p></div>';
  try {
    const { rows, total } = await fetchQiaPage(1);
    if (rows.length) {
      dsearchRows = rows;
      dsearchTotal = total;
      dsearchFuzzy = false;
    } else {
      // 정확히 일치하는 결과가 없음 → 비슷한 키워드로 재조회
      result.innerHTML = '<div class="empty-state"><p>정확한 일치 결과가 없어 비슷한 이름을 찾는 중...</p></div>';
      const fuzzyRows = await fuzzySearchQia(q);
      dsearchRows = fuzzyRows;
      dsearchTotal = fuzzyRows.length;
      dsearchFuzzy = true;
    }
    renderDsearchResult();
  } catch (e) {
    result.innerHTML = `<div class="empty-state"><p>조회 실패: ${e.message}<br><span class="text-muted">농림축산검역본부(QIA) 서버 연결에 문제가 있을 수 있습니다</span></p></div>`;
    console.error(e);
  }
}

async function loadMoreDrugQia() {
  if (dsearchFuzzy) return; // 유사검색 결과는 이미 유사도순 상위 결과라 페이지네이션 없음
  dsearchPage += 1;
  const btn = document.getElementById('dsearch-more-btn');
  if (btn) { btn.disabled = true; btn.textContent = '불러오는 중...'; }
  try {
    const { rows } = await fetchQiaPage(dsearchPage);
    dsearchRows = dsearchRows.concat(rows);
    renderDsearchResult();
  } catch (e) {
    alert('추가 조회 실패: ' + e.message);
    dsearchPage -= 1;
  }
}

// ─── 약품/백신 등록 모달 내 QIA 검색 (이름 검색 → 성분/제조사 자동 입력) ───
// 약품 등록·백신 등록 두 모달이 필드 id만 다르고 동일한 흐름을 쓰므로 공용 로직으로 뺐다.
let qiaRegisterSearchRows = [];
let qiaRegisterFields = null; // { name, results, ingredient, maker }

async function qiaSearchForRegister(fields) {
  qiaRegisterFields = fields;
  const q = document.getElementById(fields.name).value.trim();
  const box = document.getElementById(fields.results);
  if (!q) { box.innerHTML = '<div class="text-muted mb-16">이름을 입력한 뒤 검색하세요.</div>'; return; }
  box.innerHTML = '<div class="text-muted mb-16">QIA에서 검색 중...</div>';
  try {
    const params = new URLSearchParams({ page: '1', searchDivision: 'detail', itemName: q });
    const res = await fetch(QIA_BASE + '/searchMedicine?' + params.toString());
    if (!res.ok) throw new Error('QIA 서버 오류 (' + res.status + ')');
    const { rows } = parseQiaHtml(await res.text());
    qiaRegisterSearchRows = rows.slice(0, 8);
    renderQiaRegisterSearchResults();
  } catch (e) {
    box.innerHTML = `<div class="text-muted mb-16" style="color:var(--red)">검색 실패: ${e.message}</div>`;
  }
}

function renderQiaRegisterSearchResults() {
  const box = document.getElementById(qiaRegisterFields.results);
  if (!qiaRegisterSearchRows.length) { box.innerHTML = '<div class="text-muted mb-16">검색 결과가 없습니다. 이름을 다르게 입력해보세요.</div>'; return; }
  box.innerHTML = `
    <div class="mb-16" style="border:1px solid var(--border); border-radius:8px; overflow:hidden">
      ${qiaRegisterSearchRows.map((r, i) => `
        <div onclick="applyQiaRegisterResult(${i})"
          style="padding:8px 12px; border-bottom:1px solid var(--border); cursor:pointer; font-size:12px"
          onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
          <strong>${r.제품명}</strong> <span class="text-muted">· ${r.업체명 || '-'}</span><br>
          <span class="text-muted">${r.주성분 || '-'}</span>
        </div>`).join('')}
    </div>
    <div class="text-muted mb-16">위 결과를 클릭하면 이름/성분/제조사가 자동으로 채워집니다.</div>`;
}

function applyQiaRegisterResult(idx) {
  const r = qiaRegisterSearchRows[idx];
  if (!r) return;
  const f = qiaRegisterFields;
  document.getElementById(f.name).value = r.제품명 || '';
  document.getElementById(f.ingredient).value = r.주성분 || '';
  document.getElementById(f.maker).value = r.업체명 || '';
  document.getElementById(f.results).innerHTML = '';
}

function searchDrugForRegister() {
  return qiaSearchForRegister({ name: 'd-name', results: 'd-name-search-results', ingredient: 'd-ingredient', maker: 'd-maker' });
}
function searchVaccineForRegister() {
  return qiaSearchForRegister({ name: 'v-name', results: 'v-name-search-results', ingredient: 'v-ingredient', maker: 'v-maker' });
}

function renderDsearchResult() {
  const result = document.getElementById('dsearch-result');
  if (!dsearchRows.length) { result.innerHTML = '<div class="empty-state"><p>검색 결과가 없습니다</p></div>'; return; }

  const rows = dsearchRows.map(r => `<tr>
    <td>${r.링크 ? `<a href="${r.링크}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">${r.제품명 || ''} ↗</a>` : `<strong>${r.제품명 || ''}</strong>`}</td>
    <td style="font-size:11px;color:var(--text-secondary)">${r.제품영문명 || ''}</td>
    <td>${r.업체명 || ''}</td>
    <td><span class="badge ${r.품목구분 === '동물용의약품' ? 'badge-blue' : 'badge-amber'}">${r.품목구분 || ''}</span></td>
    <td>${r.주성분 || ''}</td>
    <td style="font-size:11px;color:var(--text-secondary)">${r.허가일 || ''}</td>
    <td>${r.제조수입 || ''}</td>
  </tr>`).join('');

  const hasMore = !dsearchFuzzy && dsearchRows.length < dsearchTotal;
  const moreBtn = hasMore
    ? `<button id="dsearch-more-btn" class="btn btn-outline" style="width:100%;margin-top:10px" onclick="loadMoreDrugQia()">더 보기 (${dsearchRows.length} / ${dsearchTotal})</button>`
    : '';

  const fuzzyBanner = dsearchFuzzy
    ? `<div class="mb-16" style="padding:10px 14px;background:var(--amber-bg);border:1px solid var(--amber);border-radius:8px;font-size:12px;color:var(--amber)">
        "${dsearchQuery}"의 정확한 일치 결과가 없어, 비슷한 이름의 결과 ${dsearchRows.length}건을 유사도순으로 보여드립니다
      </div>`
    : '';

  const infoLine = dsearchFuzzy
    ? `유사 검색 결과 ${dsearchRows.length}건 · 제품명 클릭시 공식 상세정보(새창)`
    : `QIA 공식 데이터 · 총 ${dsearchTotal.toLocaleString()}건 중 ${dsearchRows.length}건 표시 · 제품명 클릭시 공식 상세정보(새창)`;

  result.innerHTML = `
    ${fuzzyBanner}
    <p class="text-muted mb-16">${infoLine}</p>
    <div class="card">
      <div class="tbl-wrap"><table>
        <thead><tr><th>제품명</th><th>영문명</th><th>업체명</th><th>구분</th><th>주성분</th><th>허가일</th><th>제조/수입</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${moreBtn}
    </div>`;
}
