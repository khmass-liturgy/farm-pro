// ─── 한 장에 맞춰 인쇄 ───────────────────────────────────────────────────
// 인쇄 서식(.print-page)은 @media print 안에서만 스타일이 적용돼서 화면에서는 높이를 잴 수 없다.
// 그래서 보이지 않는 iframe에 같은 스타일을 "항상 적용"으로 바꿔 넣고 A4 인쇄 폭(190mm)으로
// 그려서 높이를 잰 뒤, A4 한 장(위아래 여백 10mm씩 빼고 277mm)보다 길면 그만큼 줄여서(zoom)
// 한 장에 들어가게 만든다. 줄인 만큼 가로를 넓혀(190mm ÷ 배율) 용지 폭은 그대로 채운다.
const PRINT_PAGE_HEIGHT_PX = 277 / 25.4 * 96 - 16; // 277mm를 96dpi 픽셀로, 반올림 오차 여유 16px
const PRINT_MIN_SCALE = 0.45;

async function fitPrintHtmlToOnePage(html) {
  try {
    const link = document.querySelector('link[rel="stylesheet"][href*="styles.css"]');
    const css = (await (await fetch(link.href)).text())
      .replace(/@page\s*\{[^}]*\}/g, '')
      .replace(/@media print/g, '@media all');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:190mm;height:1200px;border:0;visibility:hidden';
    document.body.appendChild(frame);
    // 주어진 html을 그려서 .print-page의 높이(px)를 잰다.
    const measure = async variant => {
      await new Promise(resolve => {
        frame.onload = resolve;
        frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>${css}</style><body style="margin:0"><div id="print-area">${variant}</div></body>`;
      });
      const page = frame.contentDocument.querySelector('.print-page');
      return page ? page.getBoundingClientRect().height : 0;
    };
    const withScale = scale => html.replace('<div class="print-page">', `<div class="print-page" style="zoom:${scale.toFixed(4)};width:${(190 / scale).toFixed(2)}mm">`);
    let height = await measure(html);
    if (!height || height <= PRINT_PAGE_HEIGHT_PX) { frame.remove(); return html; }
    // 줄이면 줄바꿈이 달라져 높이가 정확히 비례하지 않으므로, 실제로 들어갈 때까지 다시 재며 조금씩 더 줄인다.
    let scale = Math.max(PRINT_MIN_SCALE, PRINT_PAGE_HEIGHT_PX / height);
    for (let i = 0; i < 5 && scale > PRINT_MIN_SCALE; i++) {
      height = await measure(withScale(scale));
      if (height <= PRINT_PAGE_HEIGHT_PX) break;
      scale = Math.max(PRINT_MIN_SCALE, scale * PRINT_PAGE_HEIGHT_PX / height * 0.99);
    }
    frame.remove();
    return withScale(scale);
  } catch (e) {
    console.warn('[farm-pro] 한 장 맞춤 계산 실패(원래 크기로 인쇄합니다):', e);
    return html;
  }
}

async function printProgram(id) {
  const prog = load('programs').find(p => p.id === id);
  if (!prog) return;
  const farm = load('farms').find(f => f.id === prog.farmId);
  const today = new Date().toLocaleDateString('ko-KR');

  // 품종이 지정된 프로그램만 목표 온·습도 열을 함께 인쇄한다(편집 화면과 같은 기준).
  const showEnv = programHasEnv(prog);

  // 약품투약이나 백신사항이 있는 날짜만 출력한다(빈 날짜는 생략).
  let tableRows = '';
  for (let i = 1; i <= prog.duration; i++) {
    const d = prog.days.find(x => x.day === i);
    const hasPlan = d && ((d.drugs && d.drugs.length) || d.vaccine);
    if (!hasPlan) continue;
    const env = showEnv ? programEnvFor(prog, i) : null;
    tableRows += `<tr>
      <td class="day-no">${i}</td>
      <td class="day-date">${programDayDateShort(prog.placementDate, i)}</td>
      <td class="drug-cell">${dayDrugLabel(d)}</td>
      <td class="vacc-cell">${dayVaccineLabel(d)}</td>
      ${showEnv ? `<td class="env-cell">${env ? `${env.tRange}<br>${env.rhRange}` : '-'}</td>` : ''}
      <td>${d?.note || ''}</td>
    </tr>`;
  }
  if (!tableRows) {
    tableRows = `<tr><td colspan="${showEnv ? 6 : 5}" style="text-align:center;color:#999;padding:10pt">약품투약/백신사항이 등록된 날짜가 없습니다.</td></tr>`;
  }

  const feedItems = prog.feedItems || [];
  let feedTableHTML = '';
  if (feedItems.length) {
    const fRows = feedItems.map(it => `<tr><td>${it.name}</td><td>${it.dose||'-'}</td><td>${it.period||'-'}</td></tr>`).join('');
    feedTableHTML = `<table class="print-feed-table">
      <thead><tr><th>제품명</th><th>첨가량</th><th>첨가 시기</th></tr></thead>
      <tbody>${fRows}</tbody>
    </table>`;
  } else if (prog.feedMemo) {
    feedTableHTML = `<p>${prog.feedMemo}</p>`;
  } else {
    feedTableHTML = '<p style="color:#999">-</p>';
  }

  const html = `
  <div class="print-page">
    <div class="print-header">
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <h1>🐔 투약관리 프로그램</h1>
        <div style="font-size:7.5pt;color:#666">출력일: ${today}</div>
      </div>
      <div class="ph-meta">
        <span>프로그램명: <strong>${prog.name}</strong></span>
        <span>농장: <strong>${prog.farmName}</strong></span>
        ${farm ? `<span>농장주: <strong>${farm.owner}</strong></span>` : ''}
        ${farm?.phone ? `<span>연락처: <strong>${farm.phone}</strong></span>` : ''}
      </div>
    </div>

    <div class="print-info-grid">
      <div class="print-info-cell"><div class="lbl">주소</div><div class="val">${farm?.address||'-'}</div></div>
      <div class="print-info-cell"><div class="lbl">축종</div><div class="val">${farm?.type||'-'}</div></div>
      <div class="print-info-cell"><div class="lbl">입추수수</div><div class="val">${prog.birdCount ? Number(prog.birdCount).toLocaleString()+'수' : (farm?.count ? Number(farm.count).toLocaleString()+'수' : '-')}</div></div>
      <div class="print-info-cell"><div class="lbl">사육기간</div><div class="val">${prog.duration}일령</div></div>
      <div class="print-info-cell"><div class="lbl">동수</div><div class="val">${prog.houses ? prog.houses+'동' : (farm?.houses ? farm.houses+'동' : '-')}</div></div>
      <div class="print-info-cell"><div class="lbl">담당수의사</div><div class="val">${farm?.vet || DEFAULT_VET_NAME}</div></div>
      <div class="print-info-cell"><div class="lbl">수의사 연락처</div><div class="val">${farm?.vet_phone || DEFAULT_VET_PHONE}</div></div>
      <div class="print-info-cell"><div class="lbl">입추예정일</div><div class="val" ${prog.placementDate ? '' : 'style="color:#aaa"'}>${prog.placementDate || '　'}</div></div>
    </div>

    ${prog.focus ? `<div class="print-focus">⚠️ 중점관리사항: ${prog.focus}</div>` : ''}

    <div class="print-section-title">일령별 투약 계획 <span style="font-weight:400;font-size:7pt">(약품투약/백신사항이 있는 날짜만 표시)</span></div>
    <table class="print-table">
      <colgroup><col style="width:22pt"><col style="width:30pt"><col style="width:${showEnv ? 24 : 28}%"><col style="width:${showEnv ? 18 : 20}%">${showEnv ? '<col style="width:46pt">' : ''}<col></colgroup>
      <thead>
        <tr>
          <th>일령</th><th>날짜</th><th>약품투약</th><th>백신사항</th>${showEnv ? '<th>목표 온·습도</th>' : ''}<th>중요사항 / 비고</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${showEnv ? `<div style="font-size:6.5pt;color:#666;margin-top:3pt">
      목표 온·습도는 ${programBreedName(prog)} 사양매뉴얼 기준의 계사 내부 값입니다. 온도계 수치보다 계군의 행동(헐떡임·웅크림·분산)을 우선 판단 기준으로 삼으세요.
    </div>` : ''}

    <div class="print-bottom">
      <div class="print-box">
        <div class="print-box-title">💊 투약 관리 포인트</div>
        <p>${prog.notes || '-'}</p>
      </div>
      <div class="print-box">
        <div class="print-box-title">🌾 사료 첨가제</div>
        ${feedTableHTML}
        ${prog.feedMemo ? `<p style="margin-top:4pt;font-size:7.5pt;color:#555">📝 ${prog.feedMemo}</p>` : ''}
      </div>
    </div>

    <div style="margin-top:6pt;font-size:7pt;color:#aaa;text-align:center">
      ※ 본 프로그램은 기본 프로그램으로 질병 상황에 따라 수의사와 상의 후 조정될 수 있습니다.
    </div>
  </div>`;

  document.getElementById('print-area').innerHTML = await fitPrintHtmlToOnePage(html);
  closeModal('modal-prog-view');
  setTimeout(() => window.print(), 200);
}
