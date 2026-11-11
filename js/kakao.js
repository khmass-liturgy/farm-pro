// ─── 카카오톡 발송 (카카오 공유 SDK — daehan 저장소 "카카오톡 공식 전송"과 같은 방식) ───────────
// 문자 발송(js/sms.js)과 같은 틀(사이드바 → 모달 → 내용 직접입력/투약 프로그램 내용 채우기 → 발송)이지만
// 보내는 길이 다르다. 카카오 공유 SDK는 받는 사람을 코드로 지정할 방법이 없어서, 등록된 농장 번호로
// 한꺼번에 보내는 문자와 달리 받는 사람은 카카오톡 창이 열리면 거기서 친구·채팅방을 골라 정한다.
// (번호로 보내는 카카오 알림톡·친구톡은 카카오 채널 개설과 템플릿 승인이 따로 필요한 별도 상품이다.)
//
// 흐름: 내용을 이미지로 만든다(canvas) → 카카오 서버에 올린다(Kakao.Share.uploadImage) →
//       Kakao.Share.sendDefault로 카카오톡 친구·채팅방 선택 창을 연다(링크 카드) →
//       받은 사람이 카드를 누르면 kakao-view.html이 그 이미지를 크게 보여준다.
// 내용을 글자가 아니라 이미지로 보내는 이유: 카카오 기본 템플릿의 글자 칸은 200자 안팎이라
// 투약 프로그램처럼 여러 줄인 내용이 들어가지 않는다.
// 카드 링크는 카카오 앱에 등록한 도메인(https://khmass-liturgy.github.io)만 허용돼서 카카오가 준 이미지
// 주소를 곧바로 못 쓰고 이 앱의 kakao-view.html 주소로 연결한다. 카카오가 돌려주는 이미지 주소는
// http:// 라서 https로 바꿔 넘긴다(https 페이지에서 http 이미지는 막힌다 — daehan에서 겪은 문제).
//
// 앱 키는 window.KAKAO_JS_KEY(js/config.js). 공개돼도 되는 JavaScript 키이며 등록된 도메인에서만 동작한다.
// 투약 프로그램 → 텍스트 변환(buildProgramSmsText)은 js/sms.js의 것을 그대로 쓴다.
// sms.js가 먼저 로드되지만 이 파일은 버튼을 누르는 시점에만 그 함수를 부르므로 순서 문제가 없다.

const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
const KAKAO_VIEW_PAGE = 'kakao-view.html';
const KAKAO_MAX_CHARS = 2000;      // 내용 글자수 상한 — 이미지가 한없이 길어지지 않게(문자 LMS 상한 2000byte와 비슷한 규모)
const KAKAO_MAX_IMAGE_H = 7000;    // 내용 이미지의 최대 높이(CSS px). 넘으면 canvas 한도(특히 iOS)를 넘을 수 있다
const KAKAO_FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

function openKakaoModal() {
  document.getElementById('kakao-content').value = '';
  populateKakaoProgramSelect();
  updateKakaoCount();
  openModal('modal-kakao');
}

// 최근 등록한 프로그램이 위로 오게 정렬한다(문자 발송과 같다).
function populateKakaoProgramSelect() {
  const sel = document.getElementById('kakao-program-select');
  if (!sel) return;
  const programs = load('programs').slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  sel.innerHTML = '<option value="">프로그램 선택...</option>' + programs.map(p =>
    `<option value="${p.id}">${p.farmName || '농장 미지정'} - ${p.name}</option>`).join('');
}

// "내용 채우기" 버튼 — 문자 발송과 같은 텍스트를 채운다. 채운 뒤에도 자유롭게 고쳐 보낼 수 있다.
// (문자는 프로그램의 농장도 수신자로 함께 체크해 주지만, 카카오는 받는 사람을 이 화면에서 정하지 않는다.)
function fillKakaoFromProgram() {
  const sel = document.getElementById('kakao-program-select');
  const prog = load('programs').find(p => p.id === sel.value);
  if (!prog) { alert('불러올 투약 프로그램을 선택해주세요.'); return; }
  document.getElementById('kakao-content').value = buildProgramSmsText(prog);
  updateKakaoCount();
}

// 줄바꿈을 \n으로 통일하고, 줄 끝 공백·연속 빈 줄(2줄 초과)·앞뒤 공백을 정리한다.
function kakaoNormalizeText(raw) {
  return String(raw || '').replace(/\r\n?/g, '\n').split('\n')
    .map(l => l.replace(/\s+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// 카드 제목 = 내용의 첫 줄(40자까지). 이모지 같은 2칸짜리 문자가 중간에 잘리지 않게 코드포인트 단위로 센다.
function kakaoCardTitle(text) {
  const first = (text.split('\n').find(l => l.trim()) || '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(first);
  return chars.length > 40 ? chars.slice(0, 39).join('') + '…' : first;
}

function kakaoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function updateKakaoCount() {
  const text = kakaoNormalizeText(document.getElementById('kakao-content').value);
  const chars = Array.from(text).length;
  const title = kakaoCardTitle(text);
  const el = document.getElementById('kakao-count');
  el.textContent = `${chars.toLocaleString()}자 (최대 ${KAKAO_MAX_CHARS.toLocaleString()}자)` +
    (chars > KAKAO_MAX_CHARS ? ' — 한도 초과!' : '') + (title ? ` · 카드 제목: ${title}` : '');
  el.style.color = chars > KAKAO_MAX_CHARS ? 'var(--red)' : '';
}

// ─── 카카오 SDK ─────────────────────────────────────────────────────────────
// 처음 보낼 때만 불러온다(앱을 켤 때마다 받지 않도록). 실패하면 다음 시도에서 다시 받는다.
let kakaoSdkPromise = null;
function loadKakaoSdk() {
  if (!kakaoSdkPromise) {
    kakaoSdkPromise = new Promise((resolve, reject) => {
      const ready = () => {
        try {
          if (!window.Kakao.isInitialized()) window.Kakao.init(window.KAKAO_JS_KEY);
          resolve(window.Kakao);
        } catch (e) { reject(e); }
      };
      if (window.Kakao) return ready();
      const s = document.createElement('script');
      s.src = KAKAO_SDK_URL; s.async = true;
      s.onload = ready;
      s.onerror = () => reject(new Error('카카오 SDK를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'));
      document.head.appendChild(s);
    }).catch(e => { kakaoSdkPromise = null; throw e; });
  }
  return kakaoSdkPromise;
}

// ─── 이미지 만들기 ──────────────────────────────────────────────────────────
// 표지 제목을 폭(720px)에 맞춘다. 한 줄로 40px 이상 크게 들어가면 한 줄, 아니면 두 줄로 나누고 글자 크기를 줄여 맞춘다.
// 두 줄은 가운데에 가장 가까운 공백에서 나눠 "채니농장" 같은 단어가 중간에서 끊기지 않게 한다(daehan 원본은 글자 수
// 가운데에서 잘라 단어가 끊겼다). 단어 단위로 나누면 글씨가 36px보다 작아지거나 공백이 없으면 글자 수 가운데에서 나눈다.
function kakaoCoverTitleLines(g, title) {
  const MAXW = 720;
  const font = size => `bold ${size}px ${KAKAO_FONT}`;
  const fits = (lines, size) => { g.font = font(size); return Math.max(...lines.map(l => g.measureText(l).width)) <= MAXW; };
  for (let size = 76; size >= 40; size -= 4) if (fits([title], size)) return { size, lines: [title] };

  const chars = Array.from(title), mid = chars.length / 2;
  let cut = -1;   // 가운데에 가장 가까운 공백 위치
  chars.forEach((ch, i) => { if (ch === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i; });
  if (cut > 0) {
    const byWord = [chars.slice(0, cut).join(''), chars.slice(cut + 1).join('')];
    for (let size = 56; size >= 36; size -= 4) if (fits(byWord, size)) return { size, lines: byWord };
  }
  const byChar = [chars.slice(0, Math.ceil(mid)).join(''), chars.slice(Math.ceil(mid)).join('')];
  for (let size = 56; size >= 28; size -= 4) if (fits(byChar, size)) return { size, lines: byChar };
  return { size: 28, lines: byChar };
}

// 카카오 카드용 표지 이미지(큰 글씨, 800x400). 긴 내용 이미지를 카드 썸네일로 쓰면 글씨가 작아 안 보여서,
// 카드에는 이 표지를 쓰고 누르면 전체 내용 이미지를 연다(daehan의 makeKakaoCover와 같다).
function makeKakaoCover(title, sub) {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 400;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 800, 400);
  grad.addColorStop(0, '#0e4a45'); grad.addColorStop(1, '#14b8a6');
  g.fillStyle = grad; g.fillRect(0, 0, 800, 400);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 30px ${KAKAO_FONT}`; g.globalAlpha = .85;
  g.fillText('대한동물병원', 400, 60);
  g.globalAlpha = 1;
  const { size, lines } = kakaoCoverTitleLines(g, title);
  g.font = `bold ${size}px ${KAKAO_FONT}`;
  if (lines.length === 1) g.fillText(lines[0], 400, 200);
  else {
    const gap = Math.round(size * 1.3);   // 두 줄 사이 간격(글씨 크기에 비례)
    g.fillText(lines[0], 400, 195 - gap / 2); g.fillText(lines[1], 400, 195 + gap / 2);
  }
  g.font = `500 44px ${KAKAO_FONT}`;
  g.fillText(sub, 400, 300);
  g.font = `500 28px ${KAKAO_FONT}`; g.globalAlpha = .85;
  g.fillText('아래 버튼을 눌러 내용을 크게 보세요', 400, 355);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

// 한 줄(문단)을 폭에 맞게 여러 줄로 나눈다. 공백이 있으면 단어 경계에서, 공백 없이 길면 글자 단위로 끊는다.
// 호출하기 전에 ctx.font를 실제로 그릴 글꼴로 맞춰 두어야 한다(폭을 그 글꼴로 재므로).
function kakaoWrapLine(ctx, line, maxW) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      const sp = cur.lastIndexOf(' ');
      if (sp > 0 && ch !== ' ') { out.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; }
      else { out.push(cur); cur = ch === ' ' ? '' : ch; }
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// 내용 전체를 한 장의 세로로 긴 이미지로 만든다. 위에 병원 이름·날짜 띠, 아래에 본문.
// 두 줄 이상이면 첫 줄을 굵은 제목으로 보여준다(카드 제목과 같은 줄).
function makeKakaoContentImage(text, dateLabel) {
  const W = 900, PAD = 56, HEADER_H = 120, TOP = 44, FOOT = 56;
  const BODY = { size: 34, lh: 54 }, HEAD = { size: 40, lh: 60 };
  const measure = document.createElement('canvas').getContext('2d');
  const paragraphs = text.split('\n');
  const multi = paragraphs.filter(l => l.trim()).length > 1;

  // 줄 배치를 먼저 정해야 이미지 높이를 안다.
  const layout = [];   // { text, size, lh, bold } 또는 { gap }
  let titleDone = false;
  for (const p of paragraphs) {
    if (!p.trim()) {
      if (layout.length && !layout[layout.length - 1].gap) layout.push({ gap: 28 });   // 연속 빈 줄은 한 번만
      continue;
    }
    const isTitle = multi && !titleDone;
    titleDone = true;
    const st = isTitle ? HEAD : BODY;
    measure.font = `${isTitle ? 'bold ' : ''}${st.size}px ${KAKAO_FONT}`;
    kakaoWrapLine(measure, p, W - PAD * 2).forEach(l => layout.push({ text: l, size: st.size, lh: st.lh, bold: isTitle }));
    if (isTitle) layout.push({ gap: 14 });   // 제목과 본문 사이
  }

  const bodyH = layout.reduce((h, it) => h + (it.gap || it.lh), 0);
  const H = HEADER_H + TOP + bodyH + FOOT;
  if (H > KAKAO_MAX_IMAGE_H) return Promise.reject(new Error('내용이 너무 길어 이미지로 만들 수 없습니다. 줄 수를 줄여주세요.'));
  const scale = H > 3500 ? 1.5 : 2;   // 길수록 해상도를 낮춰 canvas 면적(특히 iOS 한도)과 파일 크기를 지킨다

  const c = document.createElement('canvas');
  c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);

  const grad = g.createLinearGradient(0, 0, W, HEADER_H);
  grad.addColorStop(0, '#0e4a45'); grad.addColorStop(1, '#14b8a6');
  g.fillStyle = grad; g.fillRect(0, 0, W, HEADER_H);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.textAlign = 'left'; g.font = `bold 42px ${KAKAO_FONT}`; g.fillText('대한동물병원', PAD, HEADER_H / 2);
  g.textAlign = 'right'; g.font = `500 30px ${KAKAO_FONT}`; g.globalAlpha = .9; g.fillText(dateLabel, W - PAD, HEADER_H / 2);
  g.globalAlpha = 1;

  let y = HEADER_H + TOP;
  g.textAlign = 'left';
  for (const it of layout) {
    if (it.gap) { y += it.gap; continue; }
    g.font = `${it.bold ? 'bold ' : ''}${it.size}px ${KAKAO_FONT}`;
    g.fillStyle = it.bold ? '#115e59' : '#1f2937';
    g.fillText(it.text, PAD, y + it.lh / 2);
    y += it.lh;
  }
  return new Promise(res => c.toBlob(res, 'image/png'));
}

// ─── 발송 ───────────────────────────────────────────────────────────────────
// 카카오 SDK의 오류는 Error가 아니라 { code, msg } 같은 일반 객체인 경우가 많다.
function kakaoErrorMessage(e) {
  if (e && e.message) return e.message;
  if (e && e.msg) return e.msg;
  try { return JSON.stringify(e); } catch (_) { return String(e); }
}

// PNG 한 장을 카카오 서버에 올리고 { url, width, height, … }를 돌려준다.
async function kakaoUploadPng(Kakao, blob, name) {
  const res = await Kakao.Share.uploadImage({ file: [new File([blob], name, { type: 'image/png' })] });
  return res.infos.original;
}

// 카드 링크 = 이 앱의 보기 페이지(kakao-view.html) + 카카오 서버 이미지 주소(여러 장이면 img를 반복).
// 카카오가 돌려주는 http:// 주소는 https로 바꿔 넘긴다.
function kakaoViewUrl(imageUrls) {
  const query = imageUrls.map(u => 'img=' + encodeURIComponent(String(u).replace(/^http:\/\//i, 'https://'))).join('&');
  return new URL(KAKAO_VIEW_PAGE, location.href).href + '?' + query;
}

// 카카오 "feed" 링크 카드: 표지 이미지 + 제목·설명 + 보기 페이지로 가는 버튼.
function kakaoFeedPayload({ title, description, cover, viewUrl, buttonTitle }) {
  const link = { mobileWebUrl: viewUrl, webUrl: viewUrl };
  return {
    objectType: 'feed',
    content: { title, description, imageUrl: cover.url, imageWidth: cover.width, imageHeight: cover.height, link },
    buttons: [{ title: buttonTitle, link }],
  };
}

async function sendKakao() {
  const text = kakaoNormalizeText(document.getElementById('kakao-content').value);
  if (!text) { alert('내용을 입력해주세요.'); return; }
  const chars = Array.from(text).length;
  if (chars > KAKAO_MAX_CHARS) {
    alert(`내용이 너무 깁니다 (${chars}자, 최대 ${KAKAO_MAX_CHARS}자).`);
    return;
  }
  if (!window.KAKAO_JS_KEY) { alert('카카오 앱 키가 설정되지 않았습니다. js/config.js의 KAKAO_JS_KEY를 확인하세요.'); return; }

  const btn = document.getElementById('kakao-send-btn');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '준비 중...';
  try {
    const title = kakaoCardTitle(text);
    const today = kakaoToday();
    const [body, cover] = await Promise.all([makeKakaoContentImage(text, today), makeKakaoCover(title, today)]);
    const Kakao = await loadKakaoSdk();
    const [img, cv] = await Promise.all([kakaoUploadPng(Kakao, body, 'notice.png'), kakaoUploadPng(Kakao, cover, 'cover.png')]);
    // 카카오톡 친구·채팅방 선택 창이 열린다. 실제로 보냈는지는 알 수 없어서(창에서 취소할 수 있다)
    // 모달은 닫지 않는다 — 내용을 고쳐 다시 보낼 수 있게.
    Kakao.Share.sendDefault(kakaoFeedPayload({
      title, description: `${today} · 대한동물병원`, cover: cv, viewUrl: kakaoViewUrl([img.url]), buttonTitle: '내용 크게 보기',
    }));
  } catch (e) {
    alert('카카오톡 전송에 실패했습니다: ' + kakaoErrorMessage(e));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ─── 서식(출력 화면)을 이미지로 만들어 카카오톡으로 보내기 ───────────────────────────
// 출하전검사·산란성계 출하대장 목록에서 체크한 건을 "출력모드"(인쇄 서식) 그대로 이미지로 만들어 보낸다.
// 서식 HTML은 인쇄 때 쓰는 buildXxxHtml()을 그대로 쓰고, 이미지로 만드는 방법은 js/movePermitBulk.js의
// PDF 저장과 같다: 서식 CSS는 전부 css/styles.css의 @media print 안에 있어서 화면에는 적용되지 않으므로
// "@media print"를 "@media all"로 바꾼 CSS를 넣은 보이지 않는 iframe에서 서식을 그리고 html2canvas로 캡처한다.
// 여러 건이면 건마다 한 장씩 이미지로 만들어 올리고, 카드 링크(kakao-view.html)가 그 이미지들을 이어서
// 보여준다(daehan 원본은 카드 하나에 이미지 한 장만 걸어서 "첫 장만 보낼까요?"로 물었다).
//
// 이미지를 만들고 올리는 데 몇 초가 걸리는 동안 클릭의 "사용자 동작" 효력(브라우저가 팝업·앱 전환을 허용하는
// 시간 — 크롬은 5초 안팎, 사파리는 1초 안팎)이 지나서 카카오톡 창이 조용히 막힐 수 있다. 그래서 준비가
// 끝나면 이미지 미리보기와 함께 "카카오톡 창 열기" 버튼을 한 번 더 보여주고, 그 버튼을 누르는 순간 공유창을
// 연다. 서식이 제대로 나왔는지 보내기 전에 눈으로 확인하는 효과도 있다.
const KAKAO_HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
// daehan 저장소가 같은 파일에 쓰는 SRI 해시 — 파일 내용이 다르면 브라우저가 실행하지 않는다.
const KAKAO_HTML2CANVAS_SRI = 'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA==';
const KAKAO_MAX_DOC_PAGES = 10;       // 한 번에 보낼 수 있는 서식 건수 — 이미지 업로드 수와 카드 링크 길이를 지킨다
const KAKAO_MAX_LINK_LENGTH = 1900;   // 카드 링크 길이 상한(너무 긴 링크가 거부되지 않게 2,000자 아래로)

// html2canvas는 필요할 때만 불러온다. 이동승인서 PDF 저장이 먼저 불러놨으면 그것을 그대로 쓴다.
let kakaoH2cPromise = null;
function loadHtml2canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!kakaoH2cPromise) {
    kakaoH2cPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = KAKAO_HTML2CANVAS_URL; s.integrity = KAKAO_HTML2CANVAS_SRI;
      s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
      s.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error('이미지 모듈을 불러오지 못했습니다.'));
      s.onerror = () => reject(new Error('이미지 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'));
      document.head.appendChild(s);
    }).catch(e => { kakaoH2cPromise = null; throw e; });
  }
  return kakaoH2cPromise;
}

// 인쇄용 규칙을 화면에서도 적용되게 바꾼 CSS(앱 화면 자체에는 새지 않게 iframe 안에서만 쓴다).
let kakaoPrintCssPromise = null;
function kakaoPrintCss() {
  if (!kakaoPrintCssPromise) {
    const href = document.querySelector('link[rel="stylesheet"][href*="styles.css"]')?.href;
    kakaoPrintCssPromise = fetch(href)
      .then(r => { if (!r.ok) throw new Error('서식 스타일을 불러오지 못했습니다.'); return r.text(); })
      .then(t => t.replace(/@media print/g, '@media all'))
      .catch(e => { kakaoPrintCssPromise = null; throw e; });
  }
  return kakaoPrintCssPromise;
}

// 서식 HTML(.print-page 한 개짜리 문자열)들을 한 건당 PNG 한 장으로 만든다. onProgress(지금 몇 번째, 전체).
async function kakaoRenderPrintPages(htmlList, onProgress) {
  const [html2canvas, css] = await Promise.all([loadHtml2canvas(), kakaoPrintCss()]);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:830px;height:1200px;border:0;';
  document.body.appendChild(frame);
  const blobs = [];
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><base href="${document.baseURI}"><style>${css}</style></head><body><div id="print-area"></div></body></html>`);
    doc.close();
    const area = doc.getElementById('print-area');
    // 인쇄 용지처럼: A4 폭(210mm) 안에 인쇄 여백(10mm)을 두고 서식(190mm)을 앉힌다. 맨 아래는 도장·서명이
    // 서식 밖으로 조금 삐져나올 수 있어 여백을 더 둔다.
    area.style.cssText = 'width:210mm;max-width:none;margin:0;padding:10mm 10mm 14mm;background:#fff;box-sizing:border-box';
    for (let i = 0; i < htmlList.length; i++) {
      if (onProgress) onProgress(i + 1, htmlList.length);
      area.innerHTML = htmlList[i];
      await Promise.all([...area.querySelectorAll('img')].map(img => img.complete ? null : new Promise(res => { img.onload = img.onerror = res; })));
      const canvas = await html2canvas(area, { scale: 2, backgroundColor: '#fff', useCORS: true });
      blobs.push(await new Promise(res => canvas.toBlob(res, 'image/png')));
    }
  } finally { frame.remove(); }
  return blobs;
}

let kakaoReady = null;   // 준비를 마치고 "카카오톡 창 열기"를 기다리는 전송: { payload, thumbUrls }

function showKakaoReady({ title, count, thumbUrls, payload }) {
  closeKakaoReady();   // 앞에 열려 있던 것이 있으면 정리
  kakaoReady = { payload, thumbUrls };
  document.getElementById('kakao-ready-title').textContent = title;
  document.getElementById('kakao-ready-desc').textContent =
    `서식 ${count}장을 인쇄 모양 그대로 이미지로 만들어 카카오 서버에 올렸습니다. 아래 "카카오톡 창 열기"를 누르면 카카오톡 창이 열리니 ` +
    '거기서 받을 친구·채팅방을 고르세요. 이미지를 누르면 크게 볼 수 있습니다.';
  document.getElementById('kakao-ready-thumbs').innerHTML = thumbUrls.map((u, i) =>
    `<a href="${u}" target="_blank" rel="noopener" title="${i + 1}번째 서식 크게 보기"><img src="${u}" alt="${i + 1}번째 서식" style="height:220px;width:auto;display:block;border:1px solid var(--border);border-radius:4px;box-shadow:var(--shadow)"></a>`).join('');
  openModal('modal-kakao-ready');
}

// 반드시 버튼 클릭 처리 안에서 바로 불러야 한다(브라우저는 사용자 동작 직후의 팝업·앱 전환만 허용한다).
// 열고 나서도 모달은 닫지 않는다 — 카카오톡 창에서 취소했을 때 다시 누를 수 있게.
function openKakaoShare() {
  if (!kakaoReady) return;
  try { window.Kakao.Share.sendDefault(kakaoReady.payload); }
  catch (e) { alert('카카오톡 창을 열지 못했습니다: ' + kakaoErrorMessage(e)); }
}

function closeKakaoReady() {
  closeModal('modal-kakao-ready');
  if (kakaoReady) kakaoReady.thumbUrls.forEach(u => URL.revokeObjectURL(u));
  kakaoReady = null;
  const thumbs = document.getElementById('kakao-ready-thumbs');
  if (thumbs) thumbs.innerHTML = '';
}

let kakaoDocBusy = false;

// htmls: 서식 한 건당 .print-page HTML 하나(인쇄 때 쓰는 buildXxxHtml의 결과). title: 카드 제목.
// btn: 누른 버튼(진행 상황을 그 글자로 보여준다). isEnabled: 끝난 뒤 버튼을 다시 켤지(체크한 건이 남아 있는지).
async function kakaoSendPrintPages({ htmls, title, btn, isEnabled }) {
  if (kakaoDocBusy) return;
  if (htmls.length > KAKAO_MAX_DOC_PAGES) {
    alert(`한 번에 최대 ${KAKAO_MAX_DOC_PAGES}건까지 보낼 수 있습니다. (현재 ${htmls.length}건)`);
    return;
  }
  if (!window.KAKAO_JS_KEY) { alert('카카오 앱 키가 설정되지 않았습니다. js/config.js의 KAKAO_JS_KEY를 확인하세요.'); return; }
  kakaoDocBusy = true;
  const label = btn.textContent;
  btn.disabled = true;
  try {
    title = kakaoCardTitle(title);
    btn.textContent = '이미지 만드는 중...';
    // 이미지 만들기와 SDK 불러오기를 동시에 시작해 기다리는 시간을 줄인다.
    const [pages, Kakao] = await Promise.all([
      kakaoRenderPrintPages(htmls, (i, n) => { btn.textContent = `이미지 만드는 중 ${i}/${n}`; }),
      loadKakaoSdk(),
    ]);
    const today = kakaoToday();
    const cover = await makeKakaoCover(title, `${htmls.length}건 · ${today}`);
    btn.textContent = '카카오에 올리는 중...';
    const [imgs, cv] = await Promise.all([
      Promise.all(pages.map((b, i) => kakaoUploadPng(Kakao, b, `page${i + 1}.png`))),
      kakaoUploadPng(Kakao, cover, 'cover.png'),
    ]);
    const viewUrl = kakaoViewUrl(imgs.map(x => x.url));
    if (viewUrl.length > KAKAO_MAX_LINK_LENGTH) throw new Error('보낼 서식이 많아 카드 링크가 너무 길어졌습니다. 건수를 줄여 보내주세요.');
    showKakaoReady({
      title, count: pages.length,
      thumbUrls: pages.map(b => URL.createObjectURL(b)),
      payload: kakaoFeedPayload({ title, description: `서식 ${pages.length}장 · ${today} · 대한동물병원`, cover: cv, viewUrl, buttonTitle: '서식 크게 보기' }),
    });
  } catch (e) {
    alert('카카오톡 전송 준비에 실패했습니다: ' + kakaoErrorMessage(e));
  } finally {
    kakaoDocBusy = false;
    btn.textContent = label;
    btn.disabled = !isEnabled();
  }
}

// ─── 농장 정보를 카카오톡으로 보내기 (농장 등록/관리 목록의 💛 카톡) ──────────────────────
// 담당 수의사는 농장 등록/관리에서 뺀 항목이라 보내지 않는다. 농장 정보는 짧아서 이미지가 아니라 카카오 "text" 템플릿(글자 그대로)으로 보낸다 — 받는 사람이
// 주소·전화번호를 길게 눌러 복사하거나 바로 걸 수 있게. text 칸은 200자까지라 넘으면 줄여 끝에 …를 붙인다.
// 카카오 카드에는 링크가 꼭 있어야 하고 등록 도메인만 허용돼서, 이 앱의 farm-map.html(주소로 카카오맵 검색을
// 여는 작은 페이지)을 "지도 보기" 버튼으로 건다.
const KAKAO_TEXT_LIMIT = 200;

function kakaoFarmText(f) {
  const lines = [`[농장 정보] ${f.name || ''}`];
  const add = (label, v) => { if (v != null && String(v).trim() !== '') lines.push(`${label}: ${String(v).trim()}`); };
  add('농장주', f.owner);
  add('연락처', f.phone);
  add('주소', f.address);
  const scale = [f.type, f.count ? `${Number(f.count).toLocaleString()}수` : '', f.houses ? `${f.houses}동` : ''].filter(Boolean).join(' · ');
  add('사육', scale);
  const chars = Array.from(lines.join('\n'));
  return chars.length > KAKAO_TEXT_LIMIT ? chars.slice(0, KAKAO_TEXT_LIMIT - 1).join('') + '…' : chars.join('');
}

async function kakaoSendFarm(farmId) {
  const f = load('farms').find(x => x.id === farmId);
  if (!f) { alert('농장을 찾을 수 없습니다.'); return; }
  if (!window.KAKAO_JS_KEY) { alert('카카오 앱 키가 설정되지 않았습니다. js/config.js의 KAKAO_JS_KEY를 확인하세요.'); return; }
  try {
    const Kakao = await loadKakaoSdk();
    const mapUrl = new URL('farm-map.html', location.href).href + '?q=' + encodeURIComponent(f.address || f.name || '');
    Kakao.Share.sendDefault({
      objectType: 'text',
      text: kakaoFarmText(f),
      link: { mobileWebUrl: mapUrl, webUrl: mapUrl },
      buttonTitle: f.address ? '지도 보기' : '농장 찾기',
    });
  } catch (e) {
    alert('카카오톡 전송에 실패했습니다: ' + kakaoErrorMessage(e));
  }
}
