// ─── 가금컨설팅 › 유료서비스 카드 (pb 저장소 polcon.cc의 「유료서비스」 메뉴를 분류별로) ──────────
// 카드 목록은 pb 저장소 index.html의 PREMIUM_ITEMS(기본 메뉴)를 그대로 옮겨 온 것이다(2026-11-10, pb 2298425).
// pb에서 카드를 더하거나 고치면 여기도 같이 고쳐야 한다(pb 관리자가 사이트에서 편집한 메뉴는 Firebase에
// 저장돼 이 목록과 다를 수 있다 — 실제 화면은 항상 polcon.cc 쪽이 기준).
// 카드를 누르면 가금컨설팅 화면(polcon.cc를 띄운 iframe)을 「유료서비스」 탭으로 연다. 그 카드 하나로
// 바로 들어가는 길은 pb에 아직 없어서(탭 이름만 받는다), 유료서비스 화면에서 같은 카드를 한 번 더 누른다.
// 회원 로그인도 그 화면에서 한다(유료서비스는 polcon.cc 회원 전용).

// 분류: 사이드바 항목 이름(showPage의 name) → pb의 category 이름. 순서 = 사이드바·화면 순서.
const PBPM_CATEGORIES = [
  { page: "pbpm-academy", name: "최꼬 아카데미", icon: "🎓", color: "#C62828", tagline: "🐥 꼬꼬댁~ 병아리도 졸업하는 농장 학교, 오늘도 한 알씩 배워 가세요 🥚" },
  { page: "pbpm-game", name: "체험·게임", icon: "🎮", color: "#F9A825", tagline: "🐣 삐약이부터 출하까지, 내 손으로 키워 보는 꼬꼬 농장 🥚" },
  { page: "pbpm-drug", name: "약품·투약·소독", icon: "💊", color: "#00838F", tagline: "💊 약은 똑똑하게, 휴약기간은 꼼꼼하게! 닭도 사람도 안심 🐔" },
  { page: "pbpm-vaccine", name: "백신·약품관리", icon: "🛡️", color: "#3949AB", tagline: "💉 접종 시간은 약속! 한 방울도 놓치지 말고 정시에 쏙~" },
  { page: "pbpm-husbandry", name: "사양관리", icon: "🌡️", color: "#0288D1", tagline: "🌡️ 잘 먹고 잘 자야 알도 쑥쑥, 닭의 하루는 사양관리가 결정해요" },
  { page: "pbpm-market", name: "시세 예측·분석", icon: "📈", color: "#5E35B1", tagline: "📈 계란값은 롤러코스터, 안전벨트는 미리 매고 출발해요 🎢" },
  { page: "pbpm-diagnosis", name: "진단", icon: "🩺", color: "#2E7D32", tagline: "🩺 우리 닭이 왜 시무룩할까? 증상부터 차근차근 살펴봐요" },
  { page: "pbpm-study", name: "질문·학습·교육", icon: "📚", color: "#6A1B9A", tagline: "🎓 모르면 물어보고 알면 나누고! 꼬꼬 박사 되는 길" },
  { page: "pbpm-board", name: "게시판·기타", icon: "📌", color: "#D84315", tagline: "📌 현장 소식과 자료가 모이는 꼬꼬댁 사랑방" },
];

const PBPM_ITEMS = [
  { key: "ibteam", icon: "🧬", title: "IB 닭기침 잡는 교실 — 전염성기관지염(IB) 차단 8단계 코스", desc: "IB가 어떤 병인지부터 들어오는 길·우리나라 발생·확인 방법·백신·우리 농장 적용·예방 시스템까지 단계별로 배웁니다. 육계/산란계 비교, 현장 사례, 농장 점검표를 함께 드려요.", color: "#C62828", category: "최꼬 아카데미" },
  { key: "coliclass", icon: "🧫", title: "닭 대장균증 잡는 교실 — 발견부터 재발 방지까지 10차시", desc: "육계·산란계를 나누어 대장균증을 쉽게 배웁니다. 기초 → 현장 판단 → 치료·재발 방지·백신, 그림과 사례를 카드로 한눈에.", color: "#00897B", category: "최꼬 아카데미" },
  { key: "ventclass", icon: "🌬️", title: "환기 기초교실 — 정압·음압·입기구·1만수당 환기량", desc: "계사 환기를 7단계로 배웁니다. 정압·음압·양압, 자연·강제환기, 계사 구조, 입기구 크기로 환기량 계산, 육계 일령별·산란계 주령별 1만수당 환기량을 그림과 계산기로 쉽게 익혀요.", color: "#0277BD", category: "최꼬 아카데미" },
  { key: "avianphys", icon: "🫀", title: "조류생리 아카데미 — 닭 몸속 탐험", desc: "닭의 장기 10개 계통(소화·호흡·순환·배설·생식·신경·호르몬·면역·뼈근육)이 하는 일을 쉬운 비유와 그림으로 배우고, 농장에서 보는 문제와 연결해 봅니다.", color: "#AD1457", category: "최꼬 아카데미" },
  { key: "hpaizero", icon: "🦠", title: "AI 막는 농장 지킴이 교실 — HPAI ZERO FARM", desc: "조류인플루엔자(AI)가 우리 농장에 들어오지 못하게 오늘 할 일, 우리 농장 위험도, 농장 보고서, 매일 방역 점검표, 6단계 방역 수칙 만들기를 쉽게 알려 드립니다.", color: "#00695C", category: "최꼬 아카데미" },
  { key: "farmgame_broiler", icon: "🐥", title: "육계 키우기 — 33일 출하 경영 게임", desc: "병아리 1,000수를 입추해 33일 출하까지 키워 봅니다. 사료·물·온도·환기·깔짚을 관리하고 폭염·사료값 인상·질병 같은 돌발 상황에 대응해 출하체중·생존율·사료요구율·순이익 성적표를 받아요.", color: "#F9A825", category: "체험·게임" },
  { key: "farmgame_layer", icon: "🥚", title: "산란계 키우기 — 40주령 계란 경영 게임", desc: "병아리 1,000수를 육성해 40주령까지 계란을 팔아 봅니다. 사료·물·조명·환기·난각을 관리하고 돌발 상황에 대응해 산란율·정상란 비율·사료비·순이익 성적표를 받아요.", color: "#EF8F2A", category: "체험·게임" },
  { key: "drug", icon: "💊", title: "약품조회 및 휴약기간 검색", desc: "동물용의약품을 제품명·업체명·성분명·축종·증상으로 검색하고, 축종별 휴약기간을 QIA 공식 데이터로 바로 확인합니다.", color: "#00838F", category: "약품·투약·소독" },
  { key: "drugusage", icon: "📇", title: "약품별 사용요령 카드", desc: "약품마다 용법·휴약기간·효능을 한 장 카드로 정리했습니다. 공식 설명서(QIA) 기준이며 약품 정보 링크도 함께 볼 수 있습니다.", color: "#00838F", category: "약품·투약·소독" },
  { key: "treatment", icon: "💉", title: "상황별 처방(투약) 패키지", desc: "육계·산란계 농장 상황을 고르면 그에 맞는 투약(처방) 프로그램을 보여드립니다. 상황은 계속 추가됩니다.", color: "#C62828", category: "약품·투약·소독" },
  { key: "seasonal", icon: "🗓️", title: "계절별 사양관리,질병,투약(관리) 패키지", desc: "봄·여름·가을·겨울 시기별로 챙겨야 할 투약(백신)과 사양관리 주의사항을 안내합니다.", color: "#795548", category: "약품·투약·소독" },
  { key: "disinfect", icon: "🧴", title: "질병별 소독제 선택과 소독요령", desc: "질병을 고르면 그에 맞는 소독제 선택 기준과 소독요령을 단계별로 안내합니다.", color: "#00695C", category: "약품·투약·소독" },
  { key: "newproducts", icon: "🆕", title: "신제품 소식", desc: "항생제·영양제·백신·기타로 나눠 새로 나온 제품 정보를 카드 학습 형태로 보여드립니다.", color: "#C2185B", category: "약품·투약·소독" },
  { key: "drugnews", icon: "💊", title: "동물약품 주간 소식", desc: "국내외 동물용의약품 신제품·백신·항생제·허가·제약업계 동향 중 중요한 소식 3~5건을 매주 금요일 아침 7시에 골라 카드로 보여드립니다. 국내외 전문 사이트 모음도 함께 봅니다.", color: "#AD1457", category: "약품·투약·소독" },
  { key: "vaccine", icon: "🛡️", title: "백신관리 프로그램", desc: "육계·산란계 일령별 백신 접종 프로그램을 관리자가 만들어 단계별로 보여드립니다.", color: "#3949AB", category: "백신·약품관리" },
  { key: "supplement", icon: "🌿", title: "영양제 종류별 사용요령", desc: "영양제·전해질·대사촉진제·간기능개선제·면역증강제·기타로 나눠 각 제제의 기능과 적응증, 쓰는 요령과 주의점을 한눈에 정리했습니다.", color: "#2E7D32", category: "백신·약품관리" },
  { key: "ventfinder", icon: "💨", title: "내 농장에 맞는 환기량 찾기", desc: "오늘 날씨·계사 조건을 넣으면 최소환기량(습도 조절)과 최대환기량(터널·냉각)을 계산해 드립니다.", color: "#0288D1", category: "사양관리" },
  { key: "lightguide", icon: "💡", title: "점등 프로그램(산란계·육계, 육종회사별)", desc: "로만·하이라인·이사 공식 가이드의 점등 원칙과 입식일·지역별 자연 일장을 겹쳐, 계절에 맞는 점등시간과 조기 성성숙·산란 지연 위험을 보여드립니다.", color: "#F9A825", category: "사양관리" },
  { key: "moltguide", icon: "🪶", title: "산란계 환우 프로그램(육종회사별)", desc: "하이라인·로만 등 육종회사가 권장하는 품종별 인위환우(강제환우) 프로그램을 비교해 보여드립니다.", color: "#00695C", category: "사양관리" },
  { key: "feedstandard", icon: "🌾", title: "내 농장의 사료영양 관리", desc: "육계·산란계 사육단계별 국제 사료 영양 표준(에너지·단백질·칼슘 등)과 평균 사료 교체일령을 한눈에 보여드립니다.", color: "#F57F17", category: "사양관리" },
  { key: "feedgrain", icon: "🌽", title: "사료곡물 원료 품질평가", desc: "미국·브라질·아르헨티나·유럽 곡물 산지의 기상 흐름과 곰팡이 위험을 신호등·13주 흐름 띠로 보고, 옥수수·대두·밀의 영양·물리 품질을 나라별로 비교합니다.", color: "#F57F17", category: "사양관리" },
  { key: "grainprice", icon: "📈", title: "사료곡물 가격동향·전망", desc: "세계 곡물 선물시장(옥수수·대두박·대두·밀)의 가격 흐름을 카드로 보고, 환율·달러·유가·산지 기상 등 대내외 변수로 1~3개월 가격 전망을 확인합니다.", color: "#EF6C00", category: "시세 예측·분석" },
  { key: "priceforecast", icon: "🔮", title: "육계·계란 시세예측", desc: "배합사료 생산량으로 추정한 마릿수(생산잠재력)와 과거 소비 패턴(소비잠재력)을 견줘 육계·계란 산지 시세가 1·2·3개월 뒤 오를지·보합일지·내릴지 확률로 보여드립니다. 예측이 만들어지는 과정을 도식으로 함께 봅니다.", color: "#4527A0", category: "시세 예측·분석" },
  { key: "selfcheck", icon: "🐔", title: "온라인 자가진단", desc: "닭 해부도에서 장기를 클릭하면 그 장기의 기능과 흔히 나타나는 질병을 보여드립니다.", color: "#AD1457", category: "진단" },
  { key: "diagnosis", icon: "🔍", title: "온라인 진단", desc: "부검 사진(간/비장·소장·신장·기타)을 올리면 AI가 먼저 예비 진단을 내리고, 최동명 수의사가 확인해 최종 진단과 코멘트를 답니다. 사진·진단 내용은 작성자와 수의사만 볼 수 있습니다.", color: "#2E7D32", category: "진단" },
  { key: "specimen", icon: "🧪", title: "가검물 의뢰(유료)", desc: "혈청·부검·조직 등 가검물 검사를 의뢰서 양식 그대로 입력해 온라인으로 의뢰합니다. 접수 후 최동명 수의사가 확인해 안내합니다.", color: "#00695C", category: "진단" },
  { key: "faq", icon: "❓", title: "농장에서 많이 궁금해 하는 질문", desc: "농장에서 자주 묻는 질문과 답변을 카드로 모아뒀습니다. 카드를 누르면 답변이 펼쳐집니다.", color: "#5D4037", category: "질문·학습·교육" },
  { key: "study", icon: "🎓", title: "최수의사의 온라인 학습(카드 학습)", desc: "수의사가 올린 카드형 학습자료(앞면/뒷면)로 필요할 때마다 학습할 수 있습니다.", color: "#4527A0", category: "질문·학습·교육" },
  { key: "emerging", icon: "🔬", title: "최신 연구되는 질병", desc: "PubMed 최근 논문에서 요즘 많이 다뤄지는 양계질병을 편수 순으로 찾아 한글로 번역해 보여드리고, 관련 소식까지 검색합니다.", color: "#5E35B1", category: "질문·학습·교육" },
  { key: "research", icon: "📚", title: "최신 기술탐구", desc: "질병논문·사양관리기술·컨설팅도구 최신 국제논문 5편씩을 매주 한글로 번역·요약해 드립니다.", color: "#6A1B9A", category: "질문·학습·교육" },
  { key: "diseasebrief", icon: "🧬", title: "가금 질병·백신 주간 브리핑", desc: "최근 새로 공개된 가금 질병·백신 논문, 정부·국제기구 보고서, 전문 분석 중 현장 컨설팅에 도움이 되는 핵심 3건을 매주 월요일 아침 한국어로 정리합니다. 무엇이 새로운지·현장 중요성·적용 시 주의점과 한계·원문 링크, 이번 주 체크포인트까지.", color: "#00796B", category: "질문·학습·교육" },
  { key: "magazine", icon: "📰", title: "양계잡지 학습정보", desc: "양계 전문지 지면을 사진으로 올리면 사진과 글을 분리해 게시판처럼 보여드립니다.", color: "#455A64", category: "질문·학습·교육" },
  { key: "industrynews", icon: "🗞️", title: "양계 업계관련 핵심키워드 검색소식", desc: "계란·조류인플루엔자·AI·육계·방역·양계 질병 등 양계 핵심 키워드로 국내 기사를 매일 아침 검색해 요약과 함께 카드로 보여드립니다.", color: "#455A64", category: "게시판·기타" },
  { key: "tradestats", icon: "🌐", title: "계육·계란·종란 수출입 동향", desc: "관세청 통관 통계로 계육(닭고기)·계란·종란의 월별 수입·수출 물량, 금액, 수입 단가, 상대국 비중을 그래프와 표로 한눈에 보여드립니다. 매주 자동 갱신됩니다.", color: "#00695C", category: "게시판·기타" },
  { key: "kkoko", icon: "🐔", title: "최꼬박사랑 대화", desc: "무료 탭의 최꼬꼬가 유료회원님께는 더 똑똑해진 '최꼬박사'로 변신합니다 — 더 자세하고 깊이 있는 사양관리·질병 설명을 받아보세요. 텍스트는 물론 음성으로도 대화할 수 있습니다.", color: "#F57F17", category: "질문·학습·교육" },
  { key: "feature_board", icon: "💡", title: "기능 요청 게시판", desc: "필요한 기능을 자유롭게 제안해 주세요. 작성자는 다른 회원에게 익명으로 표시됩니다.", color: "#00838F", category: "게시판·기타" },
  { key: "consult", icon: "💬", title: "온라인 상담", desc: "농장 현안(사양·환기·질병 등)을 질문하면 최동명 수의사가 답변합니다. 사진 첨부 가능, 답변은 작성자만 볼 수 있습니다.", color: "#1565C0", category: "게시판·기타" },
  { key: "consulting", icon: "📈", title: "온라인 컨설팅", desc: "농장 운영·질병 현황을 바탕으로 맞춤 투약·백신 프로그램을 작성해 드립니다. 답변은 작성자만 볼 수 있습니다.", color: "#E65100", category: "게시판·기타" },
  { key: "smssub", icon: "📱", title: "자동 문자 발송 신청", desc: "시세·계란수급·곡물선물, 국내외 AI 발생현황, 이달의 질병, 계절별 패키지·기술탐구 등 15가지 중 원하는 정보를 정해진 주기로 문자 알림 신청합니다.", color: "#0277BD", category: "게시판·기타" },
];

const pbpmEsc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const pbpmCategoryOf = page => PBPM_CATEGORIES.find(c => c.page === page);

function renderPbPremiumPage(page) {
  const cat = pbpmCategoryOf(page);
  const el = document.getElementById("pbpm-body");
  if (!cat || !el) return;
  const items = PBPM_ITEMS.filter(it => it.category === cat.name);
  el.innerHTML = `
    <div class="pbpm-head" style="--c:${cat.color}">
      <div class="pbpm-cat">${cat.icon} ${pbpmEsc(cat.name)}</div>
      ${cat.tagline ? `<div class="pbpm-tag">${pbpmEsc(cat.tagline)}</div>` : ""}
      <div class="pbpm-hint">카드를 누르면 가금컨설팅(polcon.cc)의 <strong>유료서비스</strong> 화면이 열립니다. 회원 로그인 후 같은 카드를 눌러 이용하세요.</div>
    </div>
    <div class="pbpm-list">${items.map(it => `
      <button type="button" class="pbpm-item" style="--c:${it.color};--bg:${it.color}1f" onclick="openPbPremiumItem('${it.key}')">
        <span class="pbpm-icon">${it.icon}</span>
        <span class="pbpm-text"><span class="pbpm-title">${pbpmEsc(it.title)}</span><span class="pbpm-desc">${pbpmEsc(it.desc)}</span></span>
        <span class="pbpm-chev" aria-hidden="true">›</span>
      </button>`).join("")}
    </div>`;
}

// 카드 → 가금컨설팅 iframe을 유료서비스 탭으로. 최꼬박사랑 대화(kkoko)는 pb에서도 유료 하위화면이 아니라
// 별도 탭이라 그 탭으로 연다. iframe이 아직 안 열렸으면 주소 끝 #탭으로, 이미 열려 있으면 pb가 받는
// postMessage({ pbTab })로 탭만 바꾼다(페이지를 다시 읽지 않아 로그인 상태가 그대로 남는다).
function openPbPremiumItem(key) {
  const tab = key === "kkoko" ? "kkoko" : "premium";
  const frame = document.getElementById("pb-frame");
  if (!frame) return;
  // 아직 한 번도 안 열었으면 주소에 탭을 붙여 처음부터 그 탭으로 연다(showPbTab보다 먼저 src를 정해야
  // showPbTab이 탭 없는 주소로 덮어쓰지 않는다). 열려 있으면 화면만 바꾸고 탭 이동을 알린다.
  if (!frame.getAttribute("src")) {
    frame.src = PB_BASE_URL + "?_=" + Math.floor(Date.now() / 300000) + "#" + tab;
    showPage("pb-polcon");
    return;
  }
  showPage("pb-polcon");
  frame.contentWindow?.postMessage({ pbTab: tab }, "*");
}
