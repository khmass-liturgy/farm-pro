// ─── 동물약품 검색 (농림축산검역본부 QIA 동물용의약품통합정보시스템 실시간 조회) ──
// pb 저장소(khmass-liturgy/pb)의 "약품조회 및 휴약기간 검색" 모듈을 이식한 것이다.
// 제품명·업체명·성분명 검색에 더해 축종별·증상별 검색, 제형 필터, 상세 정보에서 읽은
// 휴약기간·포장단위 표시, 수출용 제품 제외를 지원한다. pb는 앱 전체를 render()로 다시
// 그리지만 여기서는 이 화면(#dsearch-root)만 renderDsearch()로 그린다.
// 아래 약품/백신/사료첨가제 등록 모달의 QIA 검색(qiaSearchForRegister)도 같은 parseQiaHtml을 쓴다.
const QIA_BASE = 'https://medi.qia.go.kr';

function dsEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let drugState = {
  mode: "name",   // name | entp | ingr | species | symptom — 제품명/업체명/성분명/축종별/증상별 검색
  species: "chicken", // 축종별·증상별 검색의 축종(DRUG_SPECIES key, ""면 전체)
  symptom: "",        // 축종별·증상별 검색의 증상·질병 키워드(QIA 효능효과 본문 검색어)
  use: null,          // 축종별·증상별 검색 진행 상황 { term, sp, qiaPage, qiaTotal, scanned }
  rawCount: 0,        // QIA에서 받아 온 건수(수출용을 빼기 전) — "더 보기" 판단용
  excluded: 0,        // 결과에서 뺀 수출용 제품 수
  kind: "",       // indutyClassCode 필터 ("" 전체 | "A0" 의약품)
  formFilter: null,  // 제형 필터(drugFormCategory()가 돌려주는 값, 예: "산제"·"액제"·"첨가제") — null이면 전체
  query: "",
  page: 1,
  total: 0,
  rows: [],
  fuzzy: false,       // 정확검색 실패로 유사검색 결과를 보여주는 중인지
  status: "idle",     // idle | loading | fuzzy-loading | done | error
  error: "",
  loadingMore: false,
};

function isDrugUseMode(mode){ return mode === "species" || mode === "symptom"; }
function setDrugMode(mode){
  // 이름 검색(제품·업체·성분)과 쓰임새 검색(축종·증상)은 결과를 불러오는 방식이 달라
  // 둘 사이를 오갈 때는 결과를 비운다.
  if(isDrugUseMode(mode) !== isDrugUseMode(drugState.mode)){
    drugState.rows = []; drugState.total = 0; drugState.status = "idle"; drugState.error = "";
    drugState.use = null; drugState.query = ""; drugState.fuzzy = false;
  }
  drugState.mode = mode;
  if(mode === "species" && !drugState.species) drugState.species = "chicken";
  renderDsearch();
}

function drugModePlaceholder(){
  return drugState.mode === "name" ? "제품명을 입력하세요 (예: 이보멕)"
    : drugState.mode === "entp" ? "업체명을 입력하세요 (예: 베링거)"
    : "성분명을 입력하세요 (예: 이버멕틴)";
}

// ── 축종별·증상별 검색 ─────────────────────────────────────────────────────
// QIA 상세검색에는 축종 칸이 없고, 효능효과 본문 검색(eeDocData)은 한 번에 문구
// 하나만 받는다("닭 호흡기"는 붙은 문구로만 찾아 0건). 그래서 증상·질병(없으면 축종
// 이름)으로 효능효과를 검색한 뒤, 결과마다 상세 페이지의 효능효과에서 대상동물을
// 읽어 축종으로 거른다. 상세 페이지는 빠르고(15건 동시 0.3초 안팎) 같은 페이지에서
// 휴약기간도 읽을 수 있어 "조회" 버튼 없이 바로 채운다. 효능효과 검색 자체는 QIA
// 서버에서 한 페이지(15건)에 7초 안팎 걸려 3페이지씩 동시에 불러온다.
// re: 효능효과 본문에서 그 축종이 대상인지 판단하는 규칙. 한 글자 이름(소·개·말)은
// "소독·감소·1개·분말"처럼 다른 낱말 속에 흔히 섞여 앞뒤가 한글이 아닐 때만 인정한다.
// term: 증상 없이 축종만으로 찾을 때 QIA에 넘기는 효능효과 검색어.
const DRUG_SPECIES = [
  { key:"chicken", label:"닭",   term:"닭",   re:/닭|가금|산란계|육계|종계|병아리|초생추|브로일러/ },
  { key:"duck",    label:"오리", term:"오리", re:/오리|가금/ },
  { key:"pig",     label:"돼지", term:"돼지", re:/돼지|자돈|모돈|비육돈|양돈|육성돈/ },
  { key:"cattle",  label:"소",   term:"소",   re:/(?:^|[^가-힣0-9])소(?:의|와)?(?![가-힣])|송아지|젖소|한우|육우|착유우|반추/ },
  { key:"dog",     label:"개",   term:"개",   re:/(?:^|[^가-힣0-9])개(?:의|와)?(?![가-힣])|애완견|반려견|강아지|자견|(?:^|[^가-힣0-9])견(?![가-힣])/ },
  { key:"cat",     label:"고양이", term:"고양이", re:/고양이|애완묘|반려묘/ },
];
// 증상·질병 사전 — 초성으로 고를 수 있게(ㅎㅎㄱ → 호흡기) 효능효과에 자주 쓰이는 말을 모았다.
// 사전에 없는 말도 글자로 입력하면 그대로 검색한다.
const DRUG_SYMPTOM_TERMS = [
  "호흡기","호흡기병","만성호흡기병","마이코플라즈마","마이코플라스마","기관지염","기낭염","폐렴","흉막폐렴","위축성비염","비염",
  "코라이자","전염성코라이자","설사","세균성 설사","장염","괴사성 장염","대장균","대장균증","살모넬라","추백리","가금티푸스","콕시듐",
  "클로스트리디움","포도상구균","연쇄상구균","파스튜렐라","가금콜레라","패혈증","장독혈증","렙토스피라","회장염","돼지적리","부종병","유행성설사",
  "유방염","자궁내막염","부제병","관절염","활막염","피부염","결막염","창상","화농","농양","기생충","내부기생충",
  "외부기생충","회충","조충","진드기","와구모","옴","구충","곰팡이","진균","곰팡이독소","스트레스","항스트레스",
  "열스트레스","산란율","산란저하","난각","난질","성장촉진","사료효율","증체","육질","면역","소화","비타민","결핍증","전해질","탈수",
  "식욕","식욕부진","간기능","간염","통풍","골연증","구루병","해열","진통","소염","빈혈","뉴캣슬병","조류인플루엔자","전염성기관지염",
  "전염성후두기관염","마렉병","감보로","전염성F낭병","계두","뇌척수염","흑두병","류코싸이토준","소독",
];
// 사람이 흔히 쓰는 표기와 QIA 효능효과에 실제로 쓰인 표기가 다른 말 — 검색할 때는 오른쪽으로 찾는다.
// (가금 대상 제품 395개 효능효과 표본에서 "마이코플라스마" 2건 대 "마이코플라즈마" 58건,
// "괴사성 장염" 1건 대 "괴사성장염" 3건 — 띄어쓰기가 섞여 "괴사성"으로 찾는다.)
const DRUG_SYMPTOM_ALIAS = {
  "마이코플라스마": "마이코플라즈마",
  "괴사성 장염": "괴사성",
  "전염성코라이자": "코라이자",
};
// 입력칸이 비었을 때 보여 주는 "자주 찾는 증상" — QIA 효능효과(적응증) 표본(닭·돼지·오리·가금
// 대상 499개, 수출용 제외, 2026-09)에서 가금 대상 제품에 많이 나온 말을 분야별·빈도순으로 묶었다.
const DRUG_SYMPTOM_QUICK_GROUPS = [
  { label:"호흡기",       terms:["호흡기","폐렴","마이코플라즈마","기관지염","코라이자","만성호흡기병","기낭염"] },
  { label:"소화기·장",    terms:["설사","대장균","콕시듐","살모넬라","장염","괴사성 장염","소화"] },
  { label:"세균·바이러스", terms:["파스튜렐라","뉴캣슬병","연쇄상구균","전염성기관지염","포도상구균","조류인플루엔자"] },
  { label:"생산성·영양",  terms:["사료효율","성장촉진","산란율","면역","스트레스","비타민","증체","산란저하","난각","전해질","탈수","간기능"] },
  { label:"기생충·기타",  terms:["기생충","해열","회충","관절염","진드기"] },
];
const DRUG_SYMPTOM_QUICK = DRUG_SYMPTOM_QUICK_GROUPS.flatMap(g => g.terms);

// 한 글자씩 비교 — 입력 글자가 초성(ㄱ~ㅎ)이면 대상 글자의 초성과, 아니면 글자 그대로 비교.
// 그래서 "ㅎㅎㄱ", "호ㅎ기", "호흡" 모두 "호흡기"에 맞는다. 맞는 위치(없으면 -1)를 돌려준다.
function choseongMatchIndex(term, input){
  const t = String(term).replace(/\s+/g, ""), q = String(input).replace(/\s+/g, "");
  if(!q || q.length > t.length) return -1;
  const same = (tc, qc) => tc === qc || (/[ㄱ-ㅎ]/.test(qc) && toChoseong(tc) === qc);
  for(let i = 0; i + q.length <= t.length; i++){
    let ok = true;
    for(let k = 0; k < q.length; k++){ if(!same(t[i+k], q[k])){ ok = false; break; } }
    if(ok) return i;
  }
  return -1;
}
// 입력에 맞는 증상 후보 — 앞에서 맞는 것, 짧은 것부터. 입력이 없으면 자주 찾는 증상.
function drugSymptomSuggestions(input, max){
  const q = String(input || "").trim();
  if(!q) return DRUG_SYMPTOM_QUICK.slice(0, max || 12);
  return DRUG_SYMPTOM_TERMS
    .map(t => ({ t, i: choseongMatchIndex(t, q) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i || a.t.length - b.t.length)
    .slice(0, max || 12)
    .map(x => x.t);
}

// 동시에 n개씩만 실행하는 map — QIA에 한꺼번에 수십 건을 보내지 않으려고.
async function qiaMapLimit(items, n, fn){
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while(next < items.length){ const k = next++; await fn(items[k], k); }
  }));
}

// 수출 전용 품목(국내 유통 안 됨)은 결과에서 뺀다 — 제품명의 "수출용"이나 영문명의 "export only".
function isExportOnlyDrug(r){
  return /수출용/.test(r.제품명 || "") || /export\s*only/i.test(r.제품영문명 || "");
}
function dropExportOnly(rows){
  const kept = rows.filter(r => !isExportOnlyDrug(r));
  drugState.excluded += rows.length - kept.length;
  return kept;
}

// 상세 페이지에서 효능효과 본문·대상동물·휴약기간·포장단위를 읽는다(링크별로 한 번만).
const qiaDetailCache = new Map();
// QIA 상세 페이지의 "성상" 항목에서 제형을 읽는다. 검색 화면에 제형을 직접
// 고를 수 있는 항목이 없어(품목구분은 의약품/의약외품 구분일 뿐 제형이 아니다)
// 상세 페이지 본문에서 뽑아내야 한다. 표기 방식이 제품마다 셋으로 갈린다:
//   ① "1) 제형 : 산제 2) 성상 : ..." — 라벨이 붙은 경우(가장 흔함)
//   ② "1) 액제 2) 백색 또는 미황색의 현탁액" — 라벨 없이 첫 항목이 제형인 경우
//   ③ "백색내지 미황색 과립"처럼 성상에 제형 언급이 아예 없는 경우 —
//      이때는 그 아래 "제조방법" 문구("OO제 제법에 준하여/따라 제조한다")에서 찾는다
// 대한약전 표준 제형만 화이트리스트로 인정한다 — 아니면 "첨가제"·"방부제"처럼
// 제형이 아닌 다른 "~제" 낱말을 잘못 집어낼 수 있어서다.
const DRUG_FORM_WHITELIST = [
  "산제","액제","주사제","정제","캅셀제","과립제","시럽제","연고제","유제","현탁제",
  "점안제","점이제","좌제","첩부제","도포제","분무제","훈증제","훈연제","크림제","겔제",
];
function parseDrugForm(formText, fullText){
  formText = formText || ""; fullText = fullText || "";
  let m = formText.match(/제\s*형\s*[:：]\s*([가-힣]{1,6}제)/); // "제 형"처럼 글자 사이 공백이 끼는 표기(예: 원클린액)도 잡는다
  if(!m) m = formText.match(/^(?:\d\)|가\.)\s*([가-힣]{1,6}제)(?=\s|\d\)|가\.|$)/);
  if(m && DRUG_FORM_WHITELIST.includes(m[1])) return m[1];
  // "준하여"가 "준하 여"처럼 태그 경계 때문에 중간에 공백이 끼어 나오는 페이지가
  // 있어(예: 파워믹스 플러스) 뒤에 붙는 동사는 요구하지 않는다 — "OO제 제법에"라는
  // 어구 자체가 이미 제조방법 문단에서만 나오는 고정 표현이라 이것만으로 충분하다.
  m = fullText.match(/([가-힣]{1,6}제)\s*(?:의\s*)?제법에/);
  if(m && DRUG_FORM_WHITELIST.includes(m[1])) return m[1];
  return null;
}
// QIA에는 "사료첨가제·프리믹스"를 담는 별도 제형이 없다(공식 제형은 보통 "산제"로
// 등록된다) — 실무에서 쓰는 "첨가제" 구분은 제품명으로 판단한다.
function drugFormCategory(r){
  if(/프리믹스|배합사료첨가제|사료첨가제/.test(r.제품명 || "")) return "첨가제";
  return r._제형 || null;
}

function qiaDetailInfo(link){
  if(qiaDetailCache.has(link)) return qiaDetailCache.get(link);
  const job = (async () => {
    const res = await fetch(link);
    if(!res.ok) throw new Error("상세 조회 실패 (" + res.status + ")");
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = ((doc.body && doc.body.textContent) || "").replace(/\s+/g, " ");
    // 상세 페이지 본문은 "효능효과 효능효과 폴딩 버튼 …(본문)… 용법용량 용법 용량 폴딩 버튼" 순서다.
    const m = text.match(/효능\s*효과(?:\s*효능\s*효과)?(?:\s*폴딩\s*버튼)?\s*(.*?)\s*용법\s*용량/);
    const efficacy = m ? m[1].slice(0, 1500) : "";
    // 포장단위·성상(제형)은 상세 정보 표의 제목칸(th) 바로 옆 칸에 있다.
    const packTh = [...doc.querySelectorAll("th, dt")].find(el => el.textContent.replace(/\s+/g, "").startsWith("포장단위"));
    const pack = packTh && packTh.nextElementSibling ? packTh.nextElementSibling.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const formTh = [...doc.querySelectorAll("th, dt")].find(el => el.textContent.replace(/\s+/g, "").startsWith("성상"));
    const formText = formTh && formTh.nextElementSibling ? formTh.nextElementSibling.textContent.replace(/\s+/g, " ").trim() : "";
    const form = parseDrugForm(formText, text);
    return { efficacy, species: DRUG_SPECIES.filter(sp => sp.re.test(efficacy)).map(sp => sp.key), wd: wdExtractPeriod(html), pack, form };
  })();
  qiaDetailCache.set(link, job);
  job.catch(() => qiaDetailCache.delete(link));
  return job;
}

// ── 결과 표 표시용 거르기 — 휴약기간은 축종을 골라 검색했으면 그 축종 것만, 아니면
// 양계 농장용이라 소·돼지 항목을 뺀다. 포장단위는 500g·1kg·1L만 보여 준다.
// 저장된 원문(r._휴약기간·r._포장)은 그대로 둔다.
const WD_SPECIES = "소|돼지|닭|알|계란|산란계|육계|종계|병아리|오리|가금|착유우|우유|송아지|젖소|한우|육우|비육우|개|고양이|말|양|염소|메추리|칠면조|꿀벌|어류";
const WD_DROP_SPECIES = /^(?:소|돼지|착유우|우유|송아지|젖소|한우|육우|비육우)$/;
// 휴약기간 항목 이름 → 축종(DRUG_SPECIES key). 닭·오리는 알(식용란) 휴약기간도 같이 본다.
const WD_SPECIES_GROUPS = {
  chicken: /^(?:닭|알|계란|산란계|육계|종계|병아리|가금)$/,
  duck:    /^(?:오리|알|가금)$/,
  pig:     /^돼지$/,
  cattle:  /^(?:소|착유우|우유|송아지|젖소|한우|육우|비육우)$/,
  dog:     /^개$/,
  cat:     /^고양이$/,
};
// 조각 맨 앞의 축종 이름들("돼지, 닭 :", "돼지.소 -", "3) 알")과 나머지를 나눈다.
const WD_HEAD_RE = new RegExp(`^((?:${WD_SPECIES})(?:\\s*[,·.및와]\\s*(?:${WD_SPECIES}))*)(?=[\\s,·.:：\\-–(]|$)(.*)$`);
// onlySp(축종 key)를 주면 그 축종 항목만 남기고, 없으면 소·돼지 항목만 뺀다.
// 축종 이름이 안 붙은 줄("5일", "배합사료 첨가시 7일")은 앞 항목을 따라가고, 맨 앞이면 남긴다.
function drugWithdrawalForPoultry(text, onlySp){
  if(!text) return { text: "", onlyDropped: false };
  const keepName = onlySp && WD_SPECIES_GROUPS[onlySp]
    ? (n => WD_SPECIES_GROUPS[onlySp].test(n))
    : (n => !WD_DROP_SPECIES.test(n));
  // 한 단락 안에 "닭 - 5일, 돼지.소 - 없음"이나 "…28일 2) 닭 : 7일"처럼 이어 붙은 경우도 조각낸다.
  const sp = `(?:${WD_SPECIES})(?:\\s*[,·.]\\s*(?:${WD_SPECIES}))*\\s*[:：\\-–]`;
  // 단, "돼지, 닭 : 5일"처럼 쉼표 앞이 축종 이름뿐이면 한 항목이므로 다시 붙인다.
  const namesOnly = new RegExp(`^(?:${WD_SPECIES})(?:\\s*[,·.및와]\\s*(?:${WD_SPECIES}))*$`);
  const splitRe = new RegExp(`,\\s*(?=${sp})|\\s(?=\\(?\\d+\\)\\s*${sp})`);
  const pieces = String(text)
    .split(/\s+\/\s+|\s+·\s+/)
    .flatMap(seg => seg.split(splitRe).reduce((out, part) => {
      const prev = out[out.length - 1];
      if(prev !== undefined && namesOnly.test(prev.replace(/^[-–·•※\s]*(?:\(?\d+\)|\d+\.|[가-힣]\))?\s*/, "").trim())) out[out.length - 1] = prev + ", " + part;
      else out.push(part);
      return out;
    }, []))
    .map(x => x.trim()).filter(Boolean);
  let dropping = false, dropped = 0;
  const kept = [];
  for(const piece of pieces){
    const body = piece.replace(/^[-–·•※\s]*(?:\(?\d+\)|\d+\.|[가-힣]\))?\s*/, "");
    const m = body.match(WD_HEAD_RE);
    if(m){
      const names = m[1].split(/\s*[,·.및와]\s*/).filter(Boolean);
      const stay = names.filter(keepName);
      if(!stay.length){ dropping = true; dropped++; continue; }   // 뺄 축종만 → 뺀다(딸린 "가) …"도)
      dropping = false;
      kept.push(stay.length === names.length ? body : stay.join(", ") + m[2]);
      continue;
    }
    if(dropping){ dropped++; continue; }                          // 앞의 뺀 축종 항목에 딸린 줄
    kept.push(piece.replace(/^[-–·•\s]+/, "") || piece);           // "가) 3일" 같은 하위 번호는 살린다
  }
  // 원문이 "닭 / : / 2일"처럼 쪼개져 있으면 "닭 : 2일"로 붙인다.
  const joined = kept.join(" / ").replace(/\s*\/\s*[:：]\s*\/\s*/g, " : ");
  return { text: joined, onlyDropped: !kept.length && dropped > 0 };
}
// 포장단위에서 500g·1kg·1L만 골라 낸다("1,000g"·"1 리터/병"·"1000mL"·"lkg" 같은 표기도 맞춘다).
function drugStandardPacks(text){
  const t = String(text || "")
    .replace(/(\d),(\d{3})(?!\d)/g, "$1$2")          // 1,000g → 1000g
    .replace(/(^|[^0-9A-Za-z])[lI]\s*(kg|L)\b/g, "$11$2");  // lkg(1kg 오타) → 1kg
  const found = new Set();
  const re = /(\d+(?:\.\d+)?)\s*(kg|㎏|킬로그램|킬로|g|그램|mL|ml|㎖|밀리리터|L|ℓ|리터)(?![a-zA-Z])/g;
  let m;
  while((m = re.exec(t))){
    const n = parseFloat(m[1]), u = m[2];
    const grams = /^(kg|㎏|킬로그램|킬로)$/.test(u) ? n * 1000 : /^(g|그램)$/.test(u) ? n : null;
    const ml = /^(L|ℓ|리터)$/.test(u) ? n * 1000 : /^(mL|ml|㎖|밀리리터)$/.test(u) ? n : null;
    if(grams === 500) found.add("500g");
    if(grams === 1000) found.add("1kg");
    if(ml === 1000) found.add("1L");
  }
  return ["500g", "1kg", "1L"].filter(x => found.has(x));
}

// 효능효과에서 검색어 주변만 잘라 보여 준다(검색어는 강조).
function drugEfficacySnippet(text, term){
  if(!text) return "";
  const i = term ? text.indexOf(term) : -1;
  const start = i < 0 ? 0 : Math.max(0, i - 30);
  const end = i < 0 ? 90 : i + term.length + 60;
  const cut = text.slice(start, end);
  const body = i < 0 ? dsEsc(cut)
    : dsEsc(cut.slice(0, i - start)) + `<b style="color:#00838F">${dsEsc(term)}</b>` + dsEsc(cut.slice(i - start + term.length));
  return (start > 0 ? "…" : "") + body + (end < text.length ? "…" : "");
}

// 축종별·증상별 검색 시작 — 초성만 입력했으면 사전에서 첫 후보로 바꿔 검색한다.
async function searchDrugUse(){
  const sp = DRUG_SPECIES.find(x => x.key === drugState.species) || null;
  let sym = String(drugState.symptom || "").trim();
  if(sym && /[ㄱ-ㅎㅏ-ㅣ]/.test(sym)){
    const pick = drugSymptomSuggestions(sym, 1)[0];
    if(!pick){
      drugState.status = "error";
      drugState.error = `"${sym}"에 맞는 증상을 찾지 못했어요 — 아래 목록에서 고르거나 글자로 입력해 주세요`;
      renderDsearch(); return;
    }
    sym = pick; drugState.symptom = pick;
  }
  if(drugState.mode === "symptom" && !sym){
    drugState.status = "error"; drugState.error = "증상·질병을 입력하거나 아래 목록에서 골라 주세요"; renderDsearch(); return;
  }
  if(drugState.mode === "species" && !sp){
    drugState.status = "error"; drugState.error = "축종을 골라 주세요"; renderDsearch(); return;
  }
  const term = (sym && DRUG_SYMPTOM_ALIAS[sym]) || sym || sp.term;
  drugState.query = term; drugState.page = 1; drugState.fuzzy = false;
  drugState.rows = []; drugState.total = 0; drugState.rawCount = 0; drugState.excluded = 0; drugState.formFilter = null;
  drugState.use = { term, sp: sp ? sp.key : "", qiaPage: 0, qiaTotal: 0, scanned: 0 };
  drugState.status = "loading"; drugState.error = "";
  renderDsearch();
  try {
    // 축종으로 거르면 첫 묶음에 남는 게 없을 수 있어, 결과가 나올 때까지 최대 3묶음(45건×3)을 본다.
    for(let round = 0; round < 3; round++){
      await loadDrugUsePages();
      if(drugState.rows.length || drugState.use.scanned >= drugState.use.qiaTotal) break;
      renderDsearch();
    }
    drugState.status = "done";
  } catch(e){
    drugState.status = "error";
    drugState.error = "조회 실패: " + e.message + " — 농림축산검역본부(QIA) 서버 연결에 문제가 있을 수 있습니다";
    console.error(e);
  }
  renderDsearch();
}

// 효능효과 검색 결과 3페이지를 동시에 받아, 상세 정보를 붙이고 축종으로 거른다.
async function loadDrugUsePages(){
  const u = drugState.use;
  const lastPage = u.qiaTotal ? Math.ceil(u.qiaTotal / 15) : Infinity;
  const pages = [1, 2, 3].map(k => u.qiaPage + k).filter(pg => pg <= lastPage);
  if(!pages.length) return;
  const results = await Promise.all(pages.map(pg => fetchQiaSearch(u.term, pg, "ee").catch(err => ({ rows: [], total: 0, err }))));
  if(results.every(r => r.err)) throw results[0].err;
  u.qiaTotal = Math.max(u.qiaTotal, ...results.map(r => r.total || 0));
  u.qiaPage += pages.length;
  const all = results.flatMap(r => r.rows);
  u.scanned += all.length;
  const rows = dropExportOnly(all);
  await attachDrugDetails(rows);
  const keep = u.sp ? rows.filter(r => r._대상 && r._대상.includes(u.sp)) : rows;
  const seen = new Set(drugState.rows.map(r => r.링크));
  keep.forEach(r => { if(!r.링크 || !seen.has(r.링크)){ seen.add(r.링크); drugState.rows.push(r); } });
  drugState.total = drugState.rows.length;
}

// 결과 행에 상세 정보(휴약기간·포장단위, 축종·증상 검색이면 효능효과·대상동물)를 붙인다.
// 실패한 행은 "조회" 버튼으로 다시 시도할 수 있게 상태를 비워 둔다.
async function attachDrugDetails(rows){
  await qiaMapLimit(rows.filter(r => r.링크), 6, async r => {
    try {
      const info = await qiaDetailInfo(r.링크);
      r._효능 = info.efficacy; r._대상 = info.species; r._포장 = info.pack; r._제형 = info.form;
      r._휴약기간 = info.wd; r._wdStatus = "done"; r._wdErr = false;
    } catch(e){ r._detailErr = true; r._wdStatus = undefined; }
  });
}

async function loadMoreDrugUse(){
  if(drugState.loadingMore || !drugState.use) return;
  drugState.loadingMore = true; renderDsearch();
  try { await loadDrugUsePages(); }
  catch(e){ alert("추가 조회 실패: " + e.message); }
  drugState.loadingMore = false; renderDsearch();
}

// QIA 검색결과 HTML 표를 파싱한다 — QIA는 API가 아니라 검색결과 페이지를
// 그대로 내려주므로 <table><tbody> 행 구조를 직접 읽어야 한다.
function parseQiaHtml(html){
  const doc = new DOMParser().parseFromString(html, "text/html");
  const getVal = td => {
    const spans = td.querySelectorAll("span");
    return spans.length >= 2 ? spans[1].textContent.trim() : td.textContent.trim();
  };
  const rows = [...doc.querySelectorAll("table tbody tr")].map(tr => {
    const tds = [...tr.querySelectorAll("td")];
    if(tds.length < 13) return null;
    const link = tds[1].querySelector("a");
    return {
      제품명: getVal(tds[1]),
      링크: link ? (QIA_BASE + link.getAttribute("href")) : "",
      제품영문명: getVal(tds[2]),
      업체명: getVal(tds[3]),
      허가일: getVal(tds[6]),
      품목구분: getVal(tds[7]),
      주성분: getVal(tds[8]),
      제조수입: getVal(tds[11]),
    };
  }).filter(Boolean);
  const m = doc.body.textContent.match(/총\s*([\d,]+)\s*건/);
  const total = m ? +m[1].replace(/,/g, "") : rows.length;
  return { rows, total };
}

// field: name | entp | ingr | ee(효능효과 본문) — 생략하면 지금 검색 방식(drugState.mode)을 따른다.
async function fetchQiaSearch(term, page, field){
  field = field || drugState.mode;
  const params = new URLSearchParams({ page: String(page), searchDivision: "detail" });
  if(field === "name") params.set("itemName", term);
  else if(field === "entp") params.set("entpName", term);
  else if(field === "ee") params.set("eeDocData", term); // 효능효과 본문 — 축종별·증상별 검색
  else params.set("ingrMainName", term); // 성분명 — QIA 폼에는 노출 안 되는 비공식 파라미터
  if(drugState.kind) params.set("indutyClassCode", drugState.kind);
  const res = await fetch(QIA_BASE + "/searchMedicine?" + params.toString());
  if(!res.ok) throw new Error("QIA 서버 오류 (" + res.status + ")");
  return parseQiaHtml(await res.text());
}

// ── 오타/유사 키워드 허용 검색 ───────────────────────────────────────────────
// 편집거리(레벤슈타인) 기반 유사도: 0(완전 다름) ~ 1(완전 일치)
function levenshtein(a, b){
  const m = a.length, n = b.length;
  if(!m) return n; if(!n) return m;
  const dp = new Array(n+1);
  for(let j=0;j<=n;j++) dp[j] = j;
  for(let i=1;i<=m;i++){
    let prev = dp[0];
    dp[0] = i;
    for(let j=1;j<=n;j++){
      const tmp = dp[j];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[j] = Math.min(dp[j]+1, dp[j-1]+1, prev+cost);
      prev = tmp;
    }
  }
  return dp[n];
}
// 한글 초성 추출 (완성형 음절 → 초성, 이미 자모/영문/숫자는 그대로 유지)
const CHOSEONG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function toChoseong(str){
  let out = "";
  for(const ch of str){
    const code = ch.charCodeAt(0) - 0xAC00;
    out += (code >= 0 && code <= 11171) ? CHOSEONG[Math.floor(code / 588)] : ch;
  }
  return out;
}
// 입력이 초성(자음)으로만 이루어졌는지 (예: 'ㅇㅂㅁㅌ')
function isChoseongOnly(str){
  const s = (str||"").replace(/\s+/g, "");
  return s.length > 0 && /^[ㄱ-ㅎ]+$/.test(s);
}
// 일반 편집거리 유사도와 초성 편집거리 유사도 중 더 높은 쪽을 채택
// → 오타(음절이 살짝 다름)와 초성 검색(자음만 일치) 둘 다 자연스럽게 커버됨
function qiaSimilarity(a, b){
  a = (a||"").toLowerCase().replace(/\s+/g, "");
  b = (b||"").toLowerCase().replace(/\s+/g, "");
  if(!a || !b) return 0;
  const litSim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const choSim = 1 - levenshtein(toChoseong(a), toChoseong(b)) / Math.max(a.length, b.length);
  return Math.max(litSim, choSim);
}
// 정확검색 실패시 시도할 후보어 생성: 공백 토큰(긴 것부터) + 뒤에서부터 한 글자씩 줄인 접두사
function qiaFuzzyCandidates(q){
  const seen = new Set([q]);
  const list = [];
  q.split(/\s+/).filter(t => t.length >= 2).sort((a,b) => b.length-a.length).forEach(t => {
    if(!seen.has(t)){ seen.add(t); list.push(t); }
  });
  for(let len = q.length - 1; len >= 2; len--){
    const p = q.slice(0, len);
    if(!seen.has(p)){ seen.add(p); list.push(p); }
  }
  return list;
}
// 후보어들로 QIA를 순차 조회, 결과를 모아 원래 검색어와의 유사도순으로 정렬
async function fuzzySearchDrug(q){
  const candidates = qiaFuzzyCandidates(q);
  const collected = new Map();
  let tries = 0;
  for(const cand of candidates){
    if(tries >= 6 || collected.size >= 60) break;
    tries++;
    try {
      const { rows } = await fetchQiaSearch(cand, 1);
      rows.forEach(r => {
        const key = r.링크 || (r.제품명 + "|" + r.업체명);
        if(!collected.has(key)) collected.set(key, r);
      });
    } catch(e){ /* 후보 하나 실패해도 계속 진행 */ }
    if(collected.size >= 15) break;
  }
  const field = drugState.mode === "name" ? "제품명" : drugState.mode === "entp" ? "업체명" : "주성분";
  const scored = [...collected.values()]
    .map(r => ({ ...r, _sim: qiaSimilarity(q, r[field]) }))
    .filter(r => r._sim >= 0.3)
    .sort((a,b) => b._sim - a._sim);
  return scored.slice(0, 30);
}

// QIA 상세페이지 HTML에서 "OO. 휴약기간" 섹션들을 찾아 텍스트로 합친다
function wdExtractPeriod(html){
  const doc = new DOMParser().parseFromString(html, "text/html");
  // 문서마다 단락 클래스가 다르다(indent0 / title 등 혼용) → 전체 <p> 를 훑는다
  const paras = [...doc.querySelectorAll("p")];
  // 소제목 줄 맨 앞의 번호만 뽑는다. "4) 휴약기간"처럼 소제목 자체가 번호를 달고
  // 있는 문서와, "1) 돼지 : 7일"처럼 그 아래 축종별 항목이 번호를 다는 문서가
  // 섞여 있어 숫자 하나만 보고는 "새 소제목"인지 "하위 항목"인지 구분이 안 된다.
  const numberOf = t => {
    const m = t.match(/^\(?(\d+)\)|^(\d+)\s*\./);
    return m ? parseInt(m[1] || m[2], 10) : null;
  };
  // 문자로 된 소제목("가./나./바./사." 등)은 축종별 하위 항목과 표기가 겹칠 일이 없어
  // 그대로 "새 소제목"의 확실한 신호로 쓴다.
  const isLetteredHeading = t => /^[가-힣]\s*\.\s*\S/.test(t);
  // 휴약기간 다음에 흔히 오는 단락 제목들 — 여기서부터는 휴약기간이 아니다.
  const WD_NEXT_SECTION = /^(?:※\s*)?(?:저장상의?\s*주의|저장\s*방법|보관\s*방법|기타\s*주의|권고\s*사항|사용상의?\s*주의|일반적\s*주의|포장\s*단위|유효\s*기간)/;
  // "바. 휴약기간" 처럼 소제목 한 줄로 끝나기도 하고, "1) 휴약기간 : 없음" / "바. 휴약기간 - 돼지 : 14일"
  // 처럼 소제목 뒤에 값이 바로 붙어 한 줄에 나오기도 한다 → 접두어만 매치해 나머지를 분리
  // "...휴약기간을 준수하지..." 같은 [권고사항] 속 문장은 조사가 바로 붙으므로
  // "휴약기간" 뒤에 한글이 곧장 이어지면(=소제목이 아니라 문장 일부) 제외한다
  const WD_PREFIX = /^(?:[가-힣]\s*\.\s*|\(?\d+\)\s*|\d+\s*\.\s*)?휴약기간(?![가-힣])\s*[:：\-－—]?\s*/;
  const sections = [];
  for(let i = 0; i < paras.length; i++){
    const t = paras[i].textContent.replace(/\s+/g, " ").trim();
    const m = t.match(WD_PREFIX);
    if(!m) continue;
    const inline = t.slice(m[0].length).trim();
    const lines = inline ? [inline] : [];
    // 소제목 자체에 번호가 있으면("6) 휴약기간") 다음 소제목도 그 다음 번호("7)")로
    // 이어진다고 보고 그 번호가 나올 때만 멈춘다 — 그래야 "1)"부터 다시 시작하는
    // 축종별 하위 항목("1) 돼지 : 7일")을 새 소제목으로 착각해 곧장 멈추지 않는다.
    // 소제목이 문자 형식("바. 휴약기간")이면 그 아래 숫자로 시작하는 줄은 전부
    // 하위 항목으로 보고 문자 소제목이 나올 때만 멈춘다. 두 경우 다 번호 하나만으로는
    // 소제목·하위항목을 구분할 수 없어서 나온 판단 기준이다.
    const headingNum = numberOf(t);
    const nextText = from => {
      for(let k = from; k < paras.length; k++){
        const v = paras[k].textContent.replace(/\s+/g, " ").trim();
        if(v) return v;
      }
      return "";
    };
    for(let j = i + 1; j < paras.length; j++){
      const u = paras[j].textContent.replace(/\s+/g, " ").trim();
      if(!u) continue;
      if(u.startsWith("[")) break;
      if(isLetteredHeading(u)) break;
      if(headingNum != null && numberOf(u) === headingNum + 1) break;
      // 다음 단락 제목("저장상의 주의사항"·"권고사항" 등)이 번호 없이 나오면 멈춘다.
      if(WD_NEXT_SECTION.test(u)) break;
      // "바." 처럼 글자 번호만 한 줄에 따로 있고 그다음 줄이 단락 제목인 문서도 있다
      // (골든암피실린·오레오100 등) — 이걸 못 잡으면 주의사항 전체가 휴약기간에 섞인다.
      if(/^[가-힣]\s*\.$/.test(u) && WD_NEXT_SECTION.test(nextText(j + 1))) break;
      if(u === "※") continue; // 권고사항 앞에 홀로 붙는 기호
      lines.push(u);
    }
    if(lines.length) sections.push(lines.join(" / "));
  }
  return sections.length ? [...new Set(sections)].join("  ·  ") : "";
}

async function searchDrug(q){
  q = (q||"").trim();
  if(!q){
    drugState.status = "error"; drugState.error = "검색어를 입력하세요";
    renderDsearch();
    return;
  }
  if(isChoseongOnly(q)){
    drugState.status = "error";
    drugState.error = "초성만으로는 QIA 전체 데이터를 검색할 수 없어요 — 글자를 한 자 이상 입력해주세요 (예: 'ㅇㅂㅁㅌ' 대신 '이버' 또는 '이버멕틴')";
    renderDsearch();
    return;
  }
  drugState.query = q;
  drugState.page = 1;
  drugState.fuzzy = false;
  drugState.rawCount = 0; drugState.excluded = 0; drugState.formFilter = null;
  drugState.status = "loading";
  drugState.error = "";
  renderDsearch();
  try {
    const { rows, total } = await fetchQiaSearch(q, 1);
    if(rows.length){
      drugState.rawCount = rows.length;
      drugState.rows = dropExportOnly(rows);
      drugState.total = total;
      drugState.fuzzy = false;
    } else {
      // 정확히 일치하는 결과가 없음 → 비슷한 키워드로 재조회
      drugState.status = "fuzzy-loading";
      renderDsearch();
      const fuzzyRows = dropExportOnly(await fuzzySearchDrug(q));
      drugState.rows = fuzzyRows;
      drugState.total = fuzzyRows.length;
      drugState.fuzzy = true;
    }
    // 결과를 먼저 보여 주고, 휴약기간·포장단위는 상세 정보에서 이어서 채운다.
    drugState.rows.forEach(r => { if(r.링크) r._wdStatus = "loading"; });
    drugState.status = "done";
    renderDsearch();
    await attachDrugDetails(drugState.rows);
  } catch(e){
    drugState.status = "error";
    drugState.error = "조회 실패: " + e.message + " — 농림축산검역본부(QIA) 서버 연결에 문제가 있을 수 있습니다";
    console.error(e);
  }
  renderDsearch();
}

async function loadMoreDrug(){
  if(drugState.fuzzy || drugState.loadingMore) return; // 유사검색 결과는 이미 유사도순 상위 결과라 페이지네이션 없음
  drugState.page += 1;
  drugState.loadingMore = true;
  renderDsearch();
  try {
    const { rows } = await fetchQiaSearch(drugState.query, drugState.page);
    drugState.rawCount += rows.length;
    const kept = dropExportOnly(rows);
    drugState.rows = drugState.rows.concat(kept);
    kept.forEach(r => { if(r.링크) r._wdStatus = "loading"; });
    drugState.loadingMore = false;
    renderDsearch();
    await attachDrugDetails(kept);
  } catch(e){
    drugState.page -= 1;
    alert("추가 조회 실패: " + e.message);
  }
  drugState.loadingMore = false;
  renderDsearch();
}

// 검색결과 한 건의 휴약기간을 클릭시 개별 조회 (모든 QIA 등록 품목에 대해 동작)
async function loadDrugWithdrawal(i){
  const r = drugState.rows[i];
  if(!r || !r.링크 || r._wdStatus) return;
  r._wdStatus = "loading";
  renderDsearch();
  try {
    const info = await qiaDetailInfo(r.링크);
    r._휴약기간 = info.wd; r._포장 = info.pack; r._제형 = info.form; r._wdErr = false;
  } catch(e){
    r._휴약기간 = "";
    r._wdErr = true;
  }
  r._wdStatus = "done";
  renderDsearch();
}

function renderDrugKindSelect(){
  return `<select id="drug-kind" style="border:1px solid #ddd;border-radius:9px;padding:10px 10px;font-size:12px;color:#555">
        <option value="" ${drugState.kind===""?"selected":""}>전체</option>
        <option value="A0" ${drugState.kind==="A0"?"selected":""}>의약품</option>
      </select>`;
}

// 축종별·증상별 검색 입력 — 축종 칩 + 증상 입력(초성 가능) + 증상 후보 칩.
// 축종별은 축종이 필수·증상은 선택, 증상별은 증상이 필수·축종은 선택(전체 가능).
function renderDrugUseForm(){
  const speciesMode = drugState.mode === "species";
  const chip = (key, label) => {
    const on = drugState.species === key;
    return `<button class="drug-species-chip" data-sp="${key}" style="border:2px solid ${on?"#00838F":"#e5e5e5"};background:${on?"#00838F":"#fff"};color:${on?"#fff":"#444"};border-radius:16px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer">${dsEsc(label)}</button>`;
  };
  const speciesRow = `
    <div style="font-size:11px;font-weight:700;color:#555;margin-bottom:5px">축종 ${speciesMode?"":"<span style=\"font-weight:400;color:#aaa\">(선택 — 고르면 그 축종 대상 제품만)</span>"}</div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:11px">
      ${speciesMode ? "" : chip("", "전체")}${DRUG_SPECIES.map(sp => chip(sp.key, sp.label)).join("")}
    </div>`;
  const symptomRow = `
    <div style="font-size:11px;font-weight:700;color:#555;margin-bottom:5px">증상·질병 ${speciesMode?"<span style=\"font-weight:400;color:#aaa\">(선택)</span>":""} <span style="font-weight:400;color:#aaa">— 초성으로도 찾아요 (예: ㅎㅎㄱ → 호흡기, ㅋㅅㄷ → 콕시듐)</span></div>
    <div style="display:flex;gap:8px;margin-bottom:7px;flex-wrap:wrap">
      <input id="drug-sym" type="search" value="${dsEsc(drugState.symptom)}" placeholder="예: 호흡기, 설사, ㄷㅈㄱ" autocomplete="off"
        style="flex:1;min-width:160px;padding:10px 12px;border:1px solid #ddd;border-radius:9px;font-size:13px" />
      ${renderDrugKindSelect()}
      <button id="drug-use-search-btn" style="border:none;border-radius:9px;background:#00838F;color:#fff;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer">검색</button>
    </div>
    <div id="drug-sugg" style="margin-bottom:10px">${renderDrugSuggestions()}</div>`;
  return (speciesMode ? speciesRow + symptomRow : symptomRow + speciesRow) + `
    <div style="font-size:11px;color:#aaa;margin-bottom:14px;line-height:1.6">QIA 효능효과(적응증) 본문에서 찾습니다 · QIA 서버 검색에 10초 안팎 걸립니다 · 대상동물·휴약기간·포장단위는 각 제품 상세 정보에서 자동으로 읽어옵니다 · 수출용 제품은 제외합니다</div>`;
}

// 증상 후보 칩 — 입력할 때마다 이 부분만 다시 그린다(입력칸이 포커스를 잃지 않게).
function renderDrugSuggestions(){
  const typed = String(drugState.symptom || "").trim();
  const chipOf = t => `<button class="drug-sugg-chip" data-term="${dsEsc(t)}" style="border:1px solid ${t===typed?"#00838F":"#B2DFDB"};background:${t===typed?"#00838F":"#E0F2F1"};color:${t===typed?"#fff":"#00695C"};border-radius:14px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer">${dsEsc(t)}</button>`;
  // 자주 찾는 증상(분야별 묶음)은 입력 중에도 늘 보여 준다 — 입력한 글자에 맞는 후보는 그 위에 따로.
  const quick = `<div style="font-size:10.5px;color:#888;margin-bottom:5px">자주 찾는 증상 <span style="color:#bbb">— QIA 효능효과(적응증)에 많이 나오는 순</span></div>
    ${DRUG_SYMPTOM_QUICK_GROUPS.map(g => `
    <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:5px">
      <span style="font-size:10px;color:#999;min-width:66px">${dsEsc(g.label)}</span>
      ${g.terms.map(chipOf).join("")}
    </div>`).join("")}`;
  if(!typed || DRUG_SYMPTOM_QUICK.includes(typed)) return quick;
  const list = drugSymptomSuggestions(drugState.symptom, 12);
  const matched = list.length
    ? `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
    <span style="font-size:10.5px;color:#888">추천</span>
    ${list.map(chipOf).join("")}
  </div>`
    : `<div style="font-size:11px;color:#aaa">맞는 증상이 사전에 없습니다 — 글자로 입력하면 그대로 검색합니다</div>`;
  return matched + `<div style="margin-top:9px;padding-top:8px;border-top:1px dashed #e5e5e5">${quick}</div>`;
}

function renderDrugSearchPanel(){
  const useMode = isDrugUseMode(drugState.mode);
  const modeBtn = (m, label) => `<button class="drug-mode-btn" data-mode="${m}"
    style="flex:1 1 56px;border:2px solid ${drugState.mode===m?"#00838F":"#eee"};background:${drugState.mode===m?"#00838F":"#fff"};color:${drugState.mode===m?"#fff":"#333"};border-radius:9px;padding:8px 6px;font-size:12px;font-weight:700;cursor:pointer">${label}</button>`;

  // 축종을 골라 검색했으면 휴약기간은 그 축종 것만 보여 준다(고르지 않았으면 소·돼지만 뺀다).
  const wdOnlySp = (useMode && drugState.use && drugState.use.sp) ? DRUG_SPECIES.find(x => x.key === drugState.use.sp) : null;

  // 제형 필터 — QIA 검색화면 자체에는 제형 항목이 없어 상세 정보에서 읽은 값(r._제형)과
  // 제품명 기반의 "첨가제" 판정(drugFormCategory)으로 화면에서만 거른다. 아직 상세
  // 정보를 못 읽은 행(_제형이 undefined, 조회중)은 셈에서 빼서 로딩 중에 칩이 깜빡이지
  // 않게 하고, 상세 조회가 아예 안 되는 행(_제형이 null 확정)은 "전체"에서만 보인다.
  const formCounts = new Map();
  drugState.rows.forEach(r => {
    const cat = drugFormCategory(r);
    if(cat) formCounts.set(cat, (formCounts.get(cat) || 0) + 1);
  });
  const formChips = [...formCounts.entries()].sort((a, b) => b[1] - a[1]);
  if(drugState.formFilter && !formCounts.has(drugState.formFilter)) drugState.formFilter = null;
  const formFilterBar = formChips.length ? `
  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
    <span style="font-size:10.5px;color:#888">제형별 보기</span>
    <button class="drug-form-btn" data-form="" style="border:1px solid ${!drugState.formFilter?"#00838F":"#ddd"};background:${!drugState.formFilter?"#00838F":"#fff"};color:${!drugState.formFilter?"#fff":"#555"};border-radius:14px;padding:4px 11px;font-size:11px;font-weight:700;cursor:pointer">전체 ${drugState.rows.length}</button>
    ${formChips.map(([cat, n]) => `<button class="drug-form-btn" data-form="${dsEsc(cat)}" style="border:1px solid ${drugState.formFilter===cat?"#00838F":"#ddd"};background:${drugState.formFilter===cat?"#00838F":"#fff"};color:${drugState.formFilter===cat?"#fff":"#555"};border-radius:14px;padding:4px 11px;font-size:11px;font-weight:700;cursor:pointer">${dsEsc(cat)} ${n}</button>`).join("")}
  </div>` : "";
  const shownRows = drugState.formFilter ? drugState.rows.filter(r => drugFormCategory(r) === drugState.formFilter) : drugState.rows;

  const rowsHtml = shownRows.map((r) => {
    const i = drugState.rows.indexOf(r); // "조회" 버튼은 필터 여부와 무관하게 원래 배열의 자리를 가리켜야 한다
    let wdCell;
    if(r.품목구분 && r.품목구분.includes("외품")){
      wdCell = `<span style="color:#aaa;font-size:11px">해당없음</span>`;
    } else if(r._wdStatus === "loading"){
      wdCell = `<span style="font-size:11px;color:#888">조회중...</span>`;
    } else if(r._wdStatus === "done"){
      const pw = drugWithdrawalForPoultry(r._휴약기간, wdOnlySp ? wdOnlySp.key : "");
      wdCell = r._wdErr
        ? `<span style="color:#C62828;font-size:11px">조회 오류</span>`
        : (pw.text
            ? `<span style="font-size:12px;font-weight:700;color:#00695C">${dsEsc(pw.text)}</span>`
            : pw.onlyDropped
              ? `<span style="color:#aaa;font-size:11px">${wdOnlySp ? dsEsc(wdOnlySp.label) + " 휴약기간 표기 없음(다른 축종만 표기)" : "소·돼지 휴약기간만 표기됨"}</span>`
              : `<span style="color:#E65100;font-size:11px">표기 확인 필요</span>`);
    } else if(r.링크){
      wdCell = `<button class="drug-wd-btn" data-idx="${i}" style="border:1px solid #00838F;border-radius:7px;background:#fff;color:#00838F;padding:3px 9px;font-size:10px;font-weight:700;cursor:pointer">조회</button>`;
    } else {
      wdCell = `<span style="color:#ccc">-</span>`;
    }
    // 축종별·증상별 검색 결과는 상세 정보에서 읽은 효능효과(검색어 주변)와 대상동물을 제품명 밑에 보여 준다.
    const useInfo = (useMode && (r._효능 || (r._대상 && r._대상.length))) ? `
        ${r._효능 ? `<div style="font-size:10.5px;color:#777;margin-top:3px;line-height:1.5;max-width:260px">${drugEfficacySnippet(r._효능, drugState.use && drugState.use.term)}</div>` : ""}
        ${r._대상 && r._대상.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px">${r._대상.map(k => { const sp = DRUG_SPECIES.find(x=>x.key===k); const on = drugState.use && drugState.use.sp === k; return `<span style="font-size:9.5px;padding:1px 6px;border-radius:8px;background:${on?"#00838F":"#ECEFF1"};color:${on?"#fff":"#546E7A"}">${dsEsc(sp ? sp.label : k)}</span>`; }).join("")}</div>` : ""}` : "";
    return `<tr style="border-bottom:1px solid #f2f2f2">
      <td style="padding:7px 8px">${r.링크
        ? `<a href="${dsEsc(r.링크)}" target="_blank" rel="noopener" style="color:#1565C0;font-weight:700;text-decoration:none">${dsEsc(r.제품명||"")} ↗</a>`
        : `<strong>${dsEsc(r.제품명||"")}</strong>`}${useInfo}</td>
      <td style="padding:7px 8px">${dsEsc(r.업체명||"")}</td>
      <td style="padding:7px 8px;color:#666">${r.주성분 ? dsEsc(r.주성분) : `<span style="color:#ccc;font-size:11px">정보 없음</span>`}</td>
      <td style="padding:7px 8px;color:#444;font-size:11.5px">${(() => {
        if(r._wdStatus === "loading" && !r._포장) return `<span style="font-size:11px;color:#888">조회중...</span>`;
        const packs = drugStandardPacks(r._포장);
        // 500g·1kg·1L 규격이 없으면 "-"(전체 규격은 마우스를 올리면 보인다)
        return packs.length ? `<b>${packs.join(", ")}</b>` : `<span style="color:#ccc;font-size:11px" title="${dsEsc(r._포장 || "")}">-</span>`;
      })()}</td>
      <td style="padding:7px 8px">${wdCell}</td>
    </tr>`;
  }).join("");

  const u = drugState.use;
  const hasMore = useMode
    ? !!(u && u.scanned < u.qiaTotal)
    : (!drugState.fuzzy && drugState.rawCount < drugState.total);
  const moreLabel = useMode && u
    ? `더 찾아보기 (QIA ${u.qiaTotal.toLocaleString()}건 중 ${u.scanned.toLocaleString()}건 확인)`
    : `더 보기 (${drugState.rawCount} / ${drugState.total})`;
  const moreBtn = hasMore
    ? `<button id="drug-more-btn" ${drugState.loadingMore?"disabled":""} style="width:100%;margin-top:10px;border:1px solid #ddd;border-radius:9px;background:#fff;color:#555;padding:10px;font-size:12px;font-weight:600;cursor:pointer">${drugState.loadingMore?"불러오는 중... (10초 안팎)":moreLabel}</button>`
    : "";

  const fuzzyBanner = drugState.fuzzy
    ? `<div style="margin-bottom:10px;padding:10px 13px;background:#FFF8E1;border:1px solid #F9A825;border-radius:9px;font-size:12px;color:#8D6E00">
        "${dsEsc(drugState.query)}"의 정확한 일치 결과가 없어, 비슷한 이름의 결과 ${drugState.rows.length}건을 유사도순으로 보여드립니다
      </div>`
    : "";

  const useSp = u && u.sp ? DRUG_SPECIES.find(x => x.key === u.sp) : null;
  const exclNote = drugState.excluded ? ` · 수출용 ${drugState.excluded}건 제외` : "";
  const formNote = drugState.formFilter ? ` · 제형 필터 "${dsEsc(drugState.formFilter)}" 적용 중(${shownRows.length}건 표시)` : "";
  const infoLine = drugState.rows.length === 0 ? "" : ((useMode && u)
    ? `효능효과에 "${dsEsc(u.term)}"이(가) 들어간 QIA 제품 ${u.qiaTotal.toLocaleString()}건 중 ${u.scanned.toLocaleString()}건 확인${useSp?` → ${dsEsc(useSp.label)} 대상 ${drugState.rows.length}건`:""} · 대상동물·휴약기간은 각 제품 상세 정보에서 자동으로 읽었습니다`
    : drugState.fuzzy
    ? `유사 검색 결과 ${drugState.rows.length}건 · 제품명 클릭시 공식 상세정보(새창)`
    : `QIA 공식 데이터 · 총 ${drugState.total.toLocaleString()}건 중 ${drugState.rawCount}건 불러옴 · 제품명 클릭시 공식 상세정보(새창)`) + exclNote + formNote;

  let resultBody;
  if(drugState.status === "idle"){
    resultBody = `<div style="text-align:center;padding:24px;color:#aaa;font-size:12px">${useMode?(drugState.mode==="species"?"축종을 고르면 그 축종에 쓰는 약품을 찾아드려요 — 증상을 함께 넣으면 더 좁혀집니다":"증상·질병을 입력하거나 골라 보세요 — 축종을 고르면 그 축종 대상 제품만 보여드려요"):"제품명·업체명·성분명으로 검색해보세요"}</div>`;
  } else if(drugState.status === "loading"){
    resultBody = `<div style="text-align:center;padding:24px;color:#aaa;font-size:12px">${useMode?`⏳ QIA 효능효과에서 "${dsEsc(drugState.query)}" 검색 중... (10초 안팎)${u && u.scanned ? ` · ${u.scanned}건 확인` : ""}`:"⏳ 조회 중..."}</div>`;
  } else if(drugState.status === "fuzzy-loading"){
    resultBody = `<div style="text-align:center;padding:24px;color:#aaa;font-size:12px">⏳ 정확한 일치 결과가 없어 비슷한 이름을 찾는 중...</div>`;
  } else if(drugState.status === "error"){
    resultBody = `<div style="text-align:center;padding:24px;color:#C62828;font-size:12px">${dsEsc(drugState.error)}</div>`;
  } else if(!drugState.rows.length){
    resultBody = `<div style="text-align:center;padding:24px;color:#aaa;font-size:12px">${(useMode && u)
      ? (u.qiaTotal ? `효능효과에 "${dsEsc(u.term)}"이(가) 들어간 제품 ${u.qiaTotal.toLocaleString()}건 중 ${u.scanned.toLocaleString()}건을 확인했지만 ${useSp?dsEsc(useSp.label)+" 대상 제품이 없습니다":"결과가 없습니다"}` : `효능효과에 "${dsEsc(u.term)}"이(가) 들어간 제품이 없습니다`)
      : (drugState.excluded ? `수출용 제품 ${drugState.excluded}건만 있어 제외했습니다` : "검색 결과가 없습니다")}</div>${moreBtn}`;
  } else {
    resultBody = `
      ${fuzzyBanner}
      ${formFilterBar}
      <div style="font-size:11px;color:#aaa;margin-bottom:8px">${infoLine}</div>
      ${!shownRows.length ? `<div style="text-align:center;padding:20px;color:#aaa;font-size:12px">제형 필터 "${dsEsc(drugState.formFilter)}"에 맞는 제품이 없습니다</div>` : `
      <div style="overflow-x:auto"><table class="drug-result-table" style="width:100%;border-collapse:collapse;min-width:640px;font-size:12px;table-layout:fixed">
        <colgroup>
          <!-- 제품명 22%·업체명 10.5%(이전 17%·8%에서 30% 넓힘), 나머지는 주성분·포장단위·휴약기간 -->
          <col style="width:22%"><col style="width:10.5%"><col style="width:13%"><col style="width:10.5%"><col style="width:44%">
        </colgroup>
        <thead><tr style="border-bottom:2px solid #eee">
          <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:600">제품명</th>
          <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:600">업체명</th>
          <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:600">주성분</th>
          <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:600">포장단위<br><span style="font-weight:400">(500g·1kg·1L)</span></th>
          <th style="padding:7px 8px;text-align:left;font-size:10px;color:#00838F;font-weight:600">휴약기간 <span style="font-weight:400;color:#888">(${wdOnlySp ? dsEsc(wdOnlySp.label) + "만" : "소·돼지 제외"})</span></th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>`}
      ${moreBtn}`;
  }

  return `
  <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
    <div>
      <div class="display" style="font-size:16px;margin-bottom:3px">💊 약품조회 및 휴약기간 검색</div>
      <div style="font-size:11px;color:#aaa">농림축산검역본부(QIA) 동물용의약품통합정보시스템 공식 데이터를 실시간으로 조회합니다</div>
    </div>
  </div>

  <div class="card" style="border-top:6px solid #00838F">
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">${modeBtn("name","제품명")}${modeBtn("entp","업체명")}${modeBtn("ingr","성분명")}${modeBtn("species","축종별")}${modeBtn("symptom","증상별")}</div>
    ${useMode ? renderDrugUseForm() : `
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <input id="drug-q" type="search" value="${dsEsc(drugState.query)}" placeholder="${drugModePlaceholder()}"
        style="flex:1;min-width:160px;padding:10px 12px;border:1px solid #ddd;border-radius:9px;font-size:13px" />
      ${renderDrugKindSelect()}
      <button id="drug-search-btn" style="border:none;border-radius:9px;background:#00838F;color:#fff;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer">검색</button>
    </div>
    <div style="font-size:11px;color:#aaa;margin-bottom:14px">오타나 초성이 섞여도 비슷한 이름을 찾아드려요 (예: '이버ㅁㅌ') · 휴약기간·포장단위는 각 제품 상세 정보에서 자동으로 읽어옵니다 · 수출용 제품은 제외합니다</div>`}
    <div id="drug-result">${resultBody}</div>
  </div>

  <div style="font-size:9px;color:#aaa;margin-top:10px;line-height:1.6">
    ※ 이 검색은 농림축산검역본부(QIA) 동물용의약품통합정보시스템(medi.qia.go.kr) 데이터를 그때그때 실시간으로 가져와 보여줍니다.
    휴약기간은 각 품목 상세페이지의 "휴약기간" 항목을 그대로 옮긴 것이며, 실제 처방·투약 시에는 반드시 제품 라벨과 QIA 원문을 함께 확인하세요.
  </div>`;
}

// ─── 화면 그리기/이벤트 연결 (pb의 render() 안 이벤트 연결부를 이 화면용으로 옮김) ───
function renderDsearch() {
  const root = document.getElementById('dsearch-root');
  if (!root) return;
  // 통째로 다시 그리면 높이가 순간적으로 줄어 .content 스크롤이 맨 위로 튀고 표의 좌우
  // 스크롤도 초기화된다. 위치를 보존한다.
  const content = document.getElementById('content');
  const prevTop = content ? content.scrollTop : 0;
  const prevLeft = root.querySelector('.drug-result-table')?.parentElement.scrollLeft || 0;
  root.innerHTML = renderDrugSearchPanel();
  bindDsearch();
  if (content) content.scrollTop = prevTop;
  const wrap = root.querySelector('.drug-result-table')?.parentElement;
  if (wrap) wrap.scrollLeft = prevLeft;
}

function bindDsearch() {
  document.querySelectorAll('.drug-mode-btn').forEach(b => b.onclick = () => setDrugMode(b.dataset.mode));
  document.querySelectorAll('.drug-form-btn').forEach(b => b.onclick = () => {
    drugState.formFilter = b.dataset.form || null; // "전체" 칩은 data-form=""
    renderDsearch();
  });
  const qInput = document.getElementById('drug-q');
  if (qInput) qInput.onkeydown = e => { if (e.key === 'Enter') searchDrug(qInput.value); };
  const kindSel = document.getElementById('drug-kind');
  if (kindSel) {
    kindSel.onchange = () => {
      drugState.kind = kindSel.value;
      if (isDrugUseMode(drugState.mode)) { if (drugState.use) searchDrugUse(); }
      else if (drugState.query) searchDrug(drugState.query);
    };
  }
  const searchBtn = document.getElementById('drug-search-btn');
  if (searchBtn) searchBtn.onclick = () => searchDrug(document.getElementById('drug-q').value);
  const moreBtn = document.getElementById('drug-more-btn');
  if (moreBtn) moreBtn.onclick = isDrugUseMode(drugState.mode) ? loadMoreDrugUse : loadMoreDrug;
  // 축종별·증상별 검색
  const bindSuggestions = () => {
    document.querySelectorAll('.drug-sugg-chip').forEach(b => b.onclick = () => {
      drugState.symptom = b.dataset.term;
      searchDrugUse();
    });
  };
  bindSuggestions();
  const symInput = document.getElementById('drug-sym');
  if (symInput) {
    symInput.oninput = () => {
      drugState.symptom = symInput.value;
      const box = document.getElementById('drug-sugg');
      if (box) { box.innerHTML = renderDrugSuggestions(); bindSuggestions(); }
    };
    symInput.onkeydown = e => { if (e.key === 'Enter') { drugState.symptom = symInput.value; searchDrugUse(); } };
  }
  const useSearchBtn = document.getElementById('drug-use-search-btn');
  if (useSearchBtn) useSearchBtn.onclick = () => {
    const inp = document.getElementById('drug-sym');
    if (inp) drugState.symptom = inp.value;
    searchDrugUse();
  };
  document.querySelectorAll('.drug-species-chip').forEach(b => b.onclick = () => {
    const inp = document.getElementById('drug-sym');
    if (inp) drugState.symptom = inp.value;
    drugState.species = b.dataset.sp;
    // 축종별은 축종만으로 바로 찾고, 증상별은 증상이 있을 때만 다시 찾는다.
    if (drugState.mode === 'species' || String(drugState.symptom || '').trim()) searchDrugUse();
    else renderDsearch();
  });
  document.querySelectorAll('.drug-wd-btn').forEach(b => b.onclick = () => loadDrugWithdrawal(parseInt(b.dataset.idx, 10)));
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
// 사료첨가제도 같은 흐름을 쓴다. 다만 QIA는 동물용의약품·의약외품 DB라 사료첨가제로만
// 유통되는 제품은 검색되지 않을 수 있다(그때는 제품명을 직접 입력하면 된다).
function searchFeedForRegister() {
  return qiaSearchForRegister({ name: 'fd-name', results: 'fd-name-search-results', ingredient: 'fd-ingredient', maker: 'fd-maker' });
}
