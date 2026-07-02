// ====== PACKAGE FORM STATE ======
const pkgState = {
  festival:     null,
  originRegion: null,
  originName:   null,
  startDate:    null,
  endDate:      null,
  adult:        1,
  companion:    null,
  keywords:     [],
  includeItems: [],
  stage1Result: null,
};
let pkgInited = false;

// API에서 불러온 축제 목록 (패키지 폼 전용)
let PKG_FESTIVALS = [];

// /metadata 로드 후 채워짐
let REGION_OPTIONS       = [];
let KEYWORDS_LIST        = [];
let COMPANION_TYPES_LIST = [];

// ====== 축제 목록 API 로드 ======
async function fetchPkgFestivals(){
  try {
    const res = await fetch('/festivals');
    if(!res.ok) throw new Error(res.status);
    const data = await res.json();
    if(!data.success || !Array.isArray(data.festivals)) throw new Error('format error');
    PKG_FESTIVALS = data.festivals.map((f, idx) => {
      const startStr = f.start_date || '';
      const endStr   = f.end_date   || '';
      const start = startStr ? new Date(startStr) : null;
      const end   = endStr   ? new Date(endStr)   : null;
      const d_start = start ? Math.round((start - TODAY) / 86400000) : 9999;
      const d_end   = end   ? Math.round((end   - TODAY) / 86400000) : 9999;
      let status = 'unknown';
      if(start && end){
        if(d_end < 0)       status = 'ended';
        else if(d_start<=0) status = 'ongoing';
        else                status = 'upcoming';
      }
      return { id: idx+1, title: f.festival_name||'', start: startStr, end: endStr,
               sido: f.province||'', sigungu: f.city||'', img: f.first_image||'',
               detail_url: f.detail_url||'', d_start, d_end, status };
    });
  } catch(e){
    console.warn('fetchPkgFestivals 실패, FESTIVALS 대체:', e);
    if(typeof FESTIVALS !== 'undefined' && FESTIVALS.length > 0){
      PKG_FESTIVALS = FESTIVALS.map(f => ({
        id: f.id, title: f.name||'', start: f.start||'', end: f.end||'',
        sido: f.sido_clean||f.sido||'', sigungu: f.sigungu||'',
        img: f.img||'', detail_url: f.detail_url||'',
        d_start: f.d_start, d_end: f.d_end, status: f.status,
      }));
    }
  }
}

// ====== METADATA FETCH ======
async function fetchMetadata(){
  const res = await fetch('/metadata');
  if(!res.ok) throw new Error('metadata load fail');
  const data = await res.json();
  if(!data.success) throw new Error('metadata load fail');
  REGION_OPTIONS       = data.regions;
  KEYWORDS_LIST        = data.keywords;
  COMPANION_TYPES_LIST = data.companion_types;
}

// ====== PKG FORM INIT ======
function initPkgIfNeeded(){
  if(pkgInited) return;
  pkgInited = true;

  _expandChips['companion']    = document.getElementById('chipCompanion');
  _expandContents['companion'] = document.getElementById('expandCompanion');

  fetchPkgFestivals().then(()=>renderFestList(''));

  document.getElementById('festSearchInput').addEventListener('input', e=>{
    e.stopPropagation();
    renderFestList(e.target.value.trim());
  });
  document.getElementById('festSearchInput').addEventListener('click', e=>e.stopPropagation());

  const t = new Date();
  calCurrent = new Date(t.getFullYear(), t.getMonth(), 1);
  renderCal();

  fetchMetadata()
    .then(()=>{
      renderOriginRegionGrid();
      renderCompanionGrid();
      renderKeywordsGrid();
      renderIncludeItemsGrid();
    })
    .catch(err=>console.error('metadata fetch 실패:', err));
}

// ====== 출발지 지역 그리드 ======
function renderOriginRegionGrid(){
  const og = document.getElementById('originGrid');
  og.className = 'region-pop-grid';
  og.innerHTML = REGION_OPTIONS.map(r=>`
    <div class="region-pop-item" data-region="${r}"
         onclick="event.stopPropagation();selectOriginRegion('${r}')">${r}</div>
  `).join('');
}

// ====== 동행 그리드 ======
const COMPANION_EMOJI_MAP = {
  '나홀로 여행':     '🚶',
  '연인과 여행':     '💕',
  '친구와 여행':     '🧑‍🤝‍🧑',
  '아이와 여행':     '👨‍👩‍👧',
  '반려동물과 함께': '🐾',
  '부모님과 여행':   '👴👵',
  '단체/모임 여행':  '🎉',
  '출장':            '💼',
};

function renderCompanionGrid(){
  const wrap = document.getElementById('expandCompanion');
  const existing = wrap.querySelector('.companion-grid-inline');
  if(existing) existing.remove();

  const grid = document.createElement('div');
  grid.className = 'companion-grid-inline';
  grid.id = 'companionGridDynamic';
  COMPANION_TYPES_LIST.forEach(ct=>{
    const emoji = COMPANION_EMOJI_MAP[ct] || '👥';
    const item = document.createElement('div');
    item.className = 'companion-item';
    item.dataset.companionKey = ct;
    item.innerHTML = `<span class="companion-emoji">${emoji}</span><span class="companion-label">${ct}</span>`;
    item.onclick = ()=>selectCompanion(item, ct, ct);
    grid.appendChild(item);
  });
  wrap.appendChild(grid);
}

// ====== 키워드 그리드 ======
function renderKeywordsGrid(){
  if(document.getElementById('chipKeywords')) return;

  const optionalRow = document.querySelector('.pkg-optional-row');
  const chipKw = document.createElement('button');
  chipKw.className = 'pkg-chip';
  chipKw.id = 'chipKeywords';
  chipKw.onclick = ()=>toggleExpand('keywords');
  chipKw.innerHTML = `
    <svg class="svg-icon icon-sm" viewBox="0 0 24 24"><path d="M7 7h10M7 12h6M7 17h4"/></svg>
    <span>키워드</span>
    <span id="chipKeywordsValue" style="display:none;margin-left:4px;font-weight:700;color:var(--accent-blue)"></span>
  `;
  optionalRow.appendChild(chipKw);

  const pkgExpand = document.getElementById('pkgExpand');
  const kwContent = document.createElement('div');
  kwContent.className = 'pkg-expand-content';
  kwContent.id = 'expandKeywords';
  kwContent.style.display = 'none';
  kwContent.innerHTML = `<div class="pkg-expand-title">🏷 여행 키워드를 선택하세요 <span style="font-size:12px;color:var(--gray-400);font-weight:400">(최대 3개)</span></div>`;

  const kwGrid = document.createElement('div');
  kwGrid.className = 'companion-grid-inline';
  kwGrid.id = 'keywordsGridDynamic';
  KEYWORDS_LIST.forEach(kw=>{
    const item = document.createElement('div');
    item.className = 'companion-item';
    item.dataset.kwKey = kw;
    item.innerHTML = `<span class="companion-label">${kw}</span>`;
    item.onclick = ()=>toggleKeyword(item, kw);
    kwGrid.appendChild(item);
  });
  kwContent.appendChild(kwGrid);
  pkgExpand.appendChild(kwContent);

  _expandContents['keywords'] = kwContent;
  _expandChips['keywords']    = chipKw;
}

// ====== 포함 항목 그리드 ======
const INCLUDE_ITEMS_EMOJI = { '교통':'🚄', '숙박':'🏨', '렌터카':'🚗', '레저':'🎿' };

function renderIncludeItemsGrid(){
  if(document.getElementById('chipIncludeItems')) return;

  const optionalRow = document.querySelector('.pkg-optional-row');
  const chipInc = document.createElement('button');
  chipInc.className = 'pkg-chip';
  chipInc.id = 'chipIncludeItems';
  chipInc.onclick = ()=>toggleExpand('includeItems');
  chipInc.innerHTML = `
    <svg class="svg-icon icon-sm" viewBox="0 0 24 24">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
    <span>포함 항목</span>
    <span id="chipIncludeItemsValue" style="display:none;margin-left:4px;font-weight:700;color:var(--accent-blue)"></span>
  `;
  optionalRow.appendChild(chipInc);

  const pkgExpand = document.getElementById('pkgExpand');
  const incContent = document.createElement('div');
  incContent.className = 'pkg-expand-content';
  incContent.id = 'expandIncludeItems';
  incContent.style.display = 'none';
  incContent.innerHTML = `<div class="pkg-expand-title">📦 패키지에 포함할 항목을 선택하세요</div>`;

  const incGrid = document.createElement('div');
  incGrid.className = 'companion-grid-inline';
  incGrid.id = 'includeItemsGridDynamic';
  ['교통','숙박','렌터카','레저'].forEach(item=>{
    const el = document.createElement('div');
    el.className = 'companion-item';
    el.dataset.itemKey = item;
    el.innerHTML = `<span class="companion-emoji">${INCLUDE_ITEMS_EMOJI[item]||'📌'}</span><span class="companion-label">${item}</span>`;
    el.onclick = ()=>toggleIncludeItem(el, item);
    incGrid.appendChild(el);
  });
  incContent.appendChild(incGrid);
  pkgExpand.appendChild(incContent);

  _expandContents['includeItems'] = incContent;
  _expandChips['includeItems']    = chipInc;
}

function syncLodgingItemDisabledState(){
  const grid = document.getElementById('includeItemsGridDynamic');
  if(!grid) return;
  const lodgingEl = grid.querySelector('.companion-item[data-item-key="숙박"]');
  if(!lodgingEl) return;
  if(isDayTrip()){
    lodgingEl.classList.add('disabled-item');
    lodgingEl.title = '당일치기 일정에는 숙박을 추가할 수 없어요';
  } else {
    lodgingEl.classList.remove('disabled-item');
    lodgingEl.title = '';
  }
}

// ====== 키워드 토글 ======
function toggleKeyword(el, kw){
  const idx = pkgState.keywords.indexOf(kw);
  if(idx === -1){
    if(pkgState.keywords.length >= 3) return;
    pkgState.keywords.push(kw);
    el.classList.add('selected');
  } else {
    pkgState.keywords.splice(idx, 1);
    el.classList.remove('selected');
  }
  const valEl = document.getElementById('chipKeywordsValue');
  if(pkgState.keywords.length > 0){
    valEl.textContent = pkgState.keywords.join('·');
    valEl.style.display = 'inline';
    document.getElementById('chipKeywords').classList.add('has-value');
  } else {
    valEl.style.display = 'none';
    document.getElementById('chipKeywords').classList.remove('has-value');
  }
}

// ====== 포함 항목 토글 ======
function toggleIncludeItem(el, item){
  if(item === '숙박' && isDayTrip()){
    showDayTripLodgingNotice();
    return;
  }
  const idx = pkgState.includeItems.indexOf(item);
  if(idx === -1){
    pkgState.includeItems.push(item);
    el.classList.add('selected');
  } else {
    pkgState.includeItems.splice(idx, 1);
    el.classList.remove('selected');
  }
  const valEl = document.getElementById('chipIncludeItemsValue');
  if(pkgState.includeItems.length > 0){
    valEl.textContent = pkgState.includeItems.join('·');
    valEl.style.display = 'inline';
    document.getElementById('chipIncludeItems').classList.add('has-value');
  } else {
    valEl.style.display = 'none';
    document.getElementById('chipIncludeItems').classList.remove('has-value');
  }
}

function showDayTripLodgingNotice(){
  const existing = document.getElementById('dayTripLodgingNotice');
  if(existing){
    existing.classList.remove('fade-out');
    void existing.offsetWidth;
    existing.classList.add('fade-out');
    return;
  }
  const grid = document.getElementById('includeItemsGridDynamic');
  if(!grid) return;
  const notice = document.createElement('p');
  notice.id = 'dayTripLodgingNotice';
  notice.className = 'daytip-notice';
  notice.textContent = '🌙 당일치기 일정에는 숙박을 포함할 수 없어요. 종료일을 다르게 설정하면 숙박을 추가할 수 있습니다.';
  grid.insertAdjacentElement('afterend', notice);
  setTimeout(()=>{
    notice.classList.add('fade-out');
    notice.addEventListener('transitionend', ()=>notice.remove(), {once:true});
  }, 3000);
}

// ====== 팝오버 제어 ======
function openPop(name, cellEl){
  closeExpand();
  document.querySelectorAll('.pkg-popover.show').forEach(p=>{
    if(p.id!=='pop'+name.charAt(0).toUpperCase()+name.slice(1)) p.classList.remove('show');
  });
  document.querySelectorAll('.pkg-cell.open').forEach(c=>{
    if(c!==cellEl) c.classList.remove('open');
  });

  if(name==='origin'){
    const isStep2Active = !!pkgState.originRegion && !pkgState.originName;
    if(!isStep2Active){
      const popHead = document.querySelector('#popOrigin .origin-step2-head');
      if(popHead){
        popHead.className = 'pkg-popover-head';
        popHead.textContent = '어디에서 출발하시나요?';
      }
      const og = document.getElementById('originGrid');
      og.className = 'region-pop-grid';
      og.innerHTML = REGION_OPTIONS.map(r=>`
        <div class="region-pop-item${pkgState.originRegion===r?' selected':''}" data-region="${r}"
             onclick="event.stopPropagation();selectOriginRegion('${r}')">${r}</div>
      `).join('');
    }
  }

  const pop = cellEl.querySelector('.pkg-popover');
  const isOpen = pop.classList.contains('show');
  if(isOpen){
    pop.classList.remove('show');
    cellEl.classList.remove('open');
  } else {
    pop.classList.add('show');
    cellEl.classList.add('open');
    if(name==='festival') setTimeout(()=>document.getElementById('festSearchInput')?.focus(), 50);
    if(name==='dates' && !pkgState.startDate){
      calCurrent = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
      renderCal();
    }
    requestAnimationFrame(()=>{
      const rect = pop.getBoundingClientRect();
      const vw = window.innerWidth || document.documentElement.clientWidth;
      if(rect.right > vw - 8){
        const overflow = rect.right - (vw - 8);
        const curRight = parseFloat(pop.style.right) || 0;
        pop.style.right = (curRight + overflow) + 'px';
        pop.style.left = 'auto';
      } else if(rect.left < 8){
        pop.style.left = '0';
        pop.style.right = 'auto';
      }
    });
  }
}

function closeAllPops(){
  document.querySelectorAll('.pkg-popover.show').forEach(p=>p.classList.remove('show'));
  document.querySelectorAll('.pkg-cell.open').forEach(c=>c.classList.remove('open'));
}

document.addEventListener('click', e=>{
  if(!e.target.closest('.pkg-cell') && !e.target.closest('.pkg-popover')) closeAllPops();
  if(!e.target.closest('.pkg-chip') && !e.target.closest('.pkg-expand')) closeExpand();
});

// ====== 인라인 펼침 ======
let curExpand = null;
const _expandChips    = { companion: null };
const _expandContents = { companion: null };

// _expandChips / _expandContents are populated by initPkgIfNeeded after pkg-landing.html loads

function toggleExpand(name){
  const wrap = document.getElementById('pkgExpand');
  if(!wrap) return;
  closeAllPops();
  if(curExpand === name){
    wrap.classList.remove('show');
    if(_expandChips[name])    _expandChips[name].classList.remove('open');
    if(_expandContents[name]) _expandContents[name].style.display = 'none';
    curExpand = null;
  } else {
    Object.keys(_expandChips).forEach(k=>{ if(_expandChips[k]) _expandChips[k].classList.remove('open'); });
    Object.keys(_expandContents).forEach(k=>{ if(_expandContents[k]) _expandContents[k].style.display = 'none'; });
    if(_expandChips[name])    _expandChips[name].classList.add('open');
    if(_expandContents[name]) _expandContents[name].style.display = 'block';
    wrap.classList.add('show');
    curExpand = name;
    if(name === 'includeItems') syncLodgingItemDisabledState();
  }
}

function closeExpand(){
  const wrap = document.getElementById('pkgExpand');
  if(!wrap || !wrap.classList.contains('show')) return;
  wrap.classList.remove('show');
  Object.keys(_expandChips).forEach(k=>{ if(_expandChips[k]) _expandChips[k].classList.remove('open'); });
  setTimeout(()=>{
    Object.keys(_expandContents).forEach(k=>{ if(_expandContents[k]) _expandContents[k].style.display = 'none'; });
  }, 200);
  curExpand = null;
}

// ====== 동행 선택 ======
function selectCompanion(el, key, label){
  pkgState.companion = key;
  document.querySelectorAll('#companionGridDynamic .companion-item').forEach(i=>i.classList.remove('selected'));
  el.classList.add('selected');
  const chip  = document.getElementById('chipCompanion');
  const valEl = document.getElementById('chipCompanionValue');
  valEl.textContent = label;
  valEl.style.display = 'inline';
  chip.classList.add('has-value');
  setTimeout(()=>closeExpand(), 250);
}

// ====== 검색 버튼 활성화 ======
function updateSubmitState(){
  const missing = [];
  if(!pkgState.festival)                          missing.push('축제');
  if(!pkgState.originRegion || !pkgState.originName) missing.push('출발지');
  if(!pkgState.startDate || !pkgState.endDate)    missing.push('일정');

  const ok = missing.length === 0;
  document.getElementById('pkgSearchBtn').disabled = !ok;

  const hint = document.getElementById('submitHint');
  if(hint){
    if(ok){
      const opts = [];
      if(pkgState.companion)               opts.push('동행');
      if(pkgState.keywords.length > 0)    opts.push('키워드');
      if(pkgState.includeItems.length > 0) opts.push('포함항목');
      hint.innerHTML = opts.length > 0
        ? `<b>필수 정보 + ${opts.join('·')} 입력 완료</b> · 더 정확한 추천을 받을 수 있어요`
        : `<b>필수 정보 입력 완료</b> · 선택 옵션도 입력하면 더 정확해요`;
    } else {
      hint.innerHTML = `<b>${missing.join(', ')}</b>${missing.length>1?'을':'를'} 입력해주세요`;
    }
  }
}

// ====== STAGE 1 SUBMIT ======
async function submitPackage(){
  if(!pkgState.festival || !pkgState.originRegion || !pkgState.originName ||
     !pkgState.startDate || !pkgState.endDate){
    alert('필수 항목 누락');
    return;
  }

  const btn = document.getElementById('pkgSearchBtn');
  btn.disabled = true;
  btn.innerHTML = `<span style="opacity:.7">검색 중...</span>`;

  hideStage2Section();

  try{
    const payload = {
      festival_name:  pkgState.festival.title,
      origin_region:  pkgState.originRegion,
      origin_name:    pkgState.originName,
      people:         pkgState.adult,
      start_date:     formatApiDate(pkgState.startDate),
      end_date:       formatApiDate(pkgState.endDate),
      companion_type: pkgState.companion || COMPANION_TYPES_LIST[0] || '친구와 여행',
      keywords:       pkgState.keywords.length > 0 ? pkgState.keywords : [],
      include_items:  pkgState.includeItems.length > 0 ? pkgState.includeItems : (isDayTrip() ? ['교통'] : ['교통','숙박']),
    };

    const res  = await fetch('/stage1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if(!res.ok){ alert(data.detail || 'Stage1 실패'); return; }

    pkgState.stage1Result = data;
    showStage1Result(data);

  } catch(err){
    console.error(err);
    alert('서버 연결 실패');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M22 10H2M6 14h.01M10 14h4"/></svg>
      예산 설정
    `;
  }
}

// ====== STAGE 1 결과 표시 ======
function showStage1Result(stage1){
  let sec = document.getElementById('pkgStage1Result');
  if(!sec){
    sec = document.createElement('section');
    sec.id = 'pkgStage1Result';
    sec.className = 'pkg-stage1-result';
    const searchWrap = document.querySelector('#page-pkg-landing .pkg-search-wrap');
    searchWrap.insertAdjacentElement('afterend', sec);
  }

  const minBudget          = stage1.minimum_budget;
  const maxBudgetCandidate = stage1.candidate_price_range?.max ?? null;
  const people             = pkgState.adult;
  const minPerPerson       = Math.round(minBudget / people);
  const maxPerPerson       = maxBudgetCandidate !== null ? Math.round(maxBudgetCandidate / people) : null;

  sec.innerHTML = `
    <div class="stage1-step-eyebrow">
      <span class="stage1-step-dot"></span>
      STEP 2 · 예산 설정
    </div>
    <div class="stage1-result-inner">
      <div class="stage1-result-header">
        <div>
          <h2 class="stage1-result-title">패키지 후보를 찾았어요!</h2>
          <p class="stage1-result-desc">최소 예산을 확인하고, 최대 예산을 입력하면 맞춤 패키지를 추천해드려요.</p>
        </div>
      </div>
      <div class="stage1-info-row">
        <div class="stage1-info-card">
          <span class="stage1-info-icon">💰</span>
          <span class="stage1-info-label">최소 예산 (${people}인)</span>
          <span class="stage1-info-value">${minBudget.toLocaleString()}원</span>
          <span class="stage1-info-per">1인 ${minPerPerson.toLocaleString()}원</span>
        </div>
        <div class="stage1-info-card accent">
          <span class="stage1-info-icon">💎</span>
          <span class="stage1-info-label">최대 예산 (${people}인)</span>
          <span class="stage1-info-value">${maxBudgetCandidate !== null ? maxBudgetCandidate.toLocaleString()+'원' : '—'}</span>
          <span class="stage1-info-per">${maxPerPerson !== null ? '1인 '+maxPerPerson.toLocaleString()+'원' : ''}</span>
        </div>
      </div>
      <div class="stage1-divider"></div>
      <p class="stage1-guide">
        최소 예산은 후보 패키지 중 <b>가장 저렴한 조합</b> 기준입니다.<br>
        원하는 <b>최대 예산</b>을 입력하면 맞춤 패키지를 추천해드려요.
      </p>
      <div class="stage1-budget-row">
        <div class="stage1-budget-input-wrap">
          <input type="text" id="budgetMaxInput" class="stage1-budget-input"
                 placeholder="${minBudget.toLocaleString()}" inputmode="numeric"/>
          <span class="stage1-budget-unit">원</span>
        </div>
        <button class="stage1-submit-btn" id="stage2Btn" onclick="submitStage2()">
          결과 확인
          <svg class="svg-icon icon-sm" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
      <p id="stage2BudgetHint" class="stage1-budget-hint"></p>
    </div>
  `;

  const input = document.getElementById('budgetMaxInput');
  input.addEventListener('input', ()=>{
    const raw = input.value.replace(/[^0-9]/g, '');
    const cursor = input.selectionStart;
    const prevLen = input.value.length;
    input.value = raw ? parseInt(raw, 10).toLocaleString('ko-KR') : '';
    const diff = input.value.length - prevLen;
    input.setSelectionRange(cursor+diff, cursor+diff);

    const val  = parseInt(raw, 10);
    const hint = document.getElementById('stage2BudgetHint');
    if(!val || val < minBudget){
      hint.textContent = `최소 ${minBudget.toLocaleString()}원 이상 입력해주세요`;
      hint.style.color = 'var(--accent-pink, #f43f5e)';
      document.getElementById('stage2Btn').disabled = true;
    } else if(maxBudgetCandidate !== null && val > maxBudgetCandidate){
      hint.textContent = `최대 ${maxBudgetCandidate.toLocaleString()}원 이하로 입력해주세요`;
      hint.style.color = 'var(--accent-pink, #f43f5e)';
      document.getElementById('stage2Btn').disabled = true;
    } else {
      hint.textContent = `최소 예산 대비 +${(val - minBudget).toLocaleString()}원 여유`;
      hint.style.color = 'var(--accent-blue, #3b82f6)';
      document.getElementById('stage2Btn').disabled = false;
    }
  });
  document.getElementById('stage2Btn').disabled = true;

  sec.style.display = 'block';
  sec.scrollIntoView({behavior:'smooth', block:'start'});
}

function hideStage2Section(){
  const resultContent = document.getElementById('pkgResultContent');
  if(resultContent) resultContent.innerHTML = '';
}

// ====== STAGE 2 SUBMIT ======
async function submitStage2(){
  if(!pkgState.stage1Result){ alert('먼저 패키지 검색을 진행해주세요'); return; }

  const input     = document.getElementById('budgetMaxInput');
  const budgetMax = parseInt(input.value.replace(/[^0-9]/g,''), 10);
  const minB      = pkgState.stage1Result.minimum_budget;
  const maxB      = pkgState.stage1Result.candidate_price_range?.max ?? null;
  if(!budgetMax || budgetMax < minB){ alert(`최대 예산은 최소 ${minB.toLocaleString()}원 이상이어야 합니다`); return; }
  if(maxB !== null && budgetMax > maxB){ alert(`최대 예산은 ${maxB.toLocaleString()}원 이하로 입력해주세요`); return; }

  const btn = document.getElementById('stage2Btn');
  btn.disabled = true;
  btn.innerHTML = `<span style="opacity:.7">추천 중...</span>`;

  try{
    const res  = await fetch('/stage2/from-stage1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage1_result: pkgState.stage1Result, budget_max: budgetMax }),
    });
    const data = await res.json();
    if(!res.ok){ alert(data.detail || 'Stage2 실패'); return; }
    renderStage2Result(data, budgetMax);
  } catch(err){
    console.error(err);
    alert('서버 연결 실패');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `결과 확인 <svg class="svg-icon icon-sm" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
  }
}

// ====== STAGE 2 결과 렌더링 ======
function renderStage2Result(data, budgetMax){
  const withinBudget = data.within_budget || [];
  const specialPass  = data.special_pass  || [];
  let html = '';

  if(!withinBudget.length && !specialPass.length){
    html = `
      <div class="pkg-search-wrap" style="max-width:1280px;margin:0 auto;padding:16px 24px 32px">
        <div class="stage2-step-eyebrow">
          <span class="stage1-step-dot"></span>
          STEP 3 · 패키지 추천 결과
        </div>
        <div class="stage2-empty">
          <div class="ico">🔍</div>
          <p>해당 예산(${budgetMax.toLocaleString()}원)에 맞는 패키지가 없어요.<br>예산을 조금 높여서 다시 시도해보세요.</p>
        </div>
      </div>`;
  } else {
    html = `
      <div class="pkg-search-wrap" style="max-width:1280px;margin:0 auto;padding:16px 24px 32px">
        <div class="stage2-step-eyebrow">
          <span class="stage1-step-dot"></span>
          STEP 3 · 패키지 추천 결과
        </div>
        <div class="stage2-result-inner">`;

    if(withinBudget.length){
      html += `
        <div class="stage2-section-head">
          <h2 class="stage2-section-title">🎯 예산 내 추천 패키지</h2>
          <span class="stage2-section-sub">${budgetMax.toLocaleString()}원 이하 · ${withinBudget.length}개</span>
        </div>
        <div class="stage2-cards-grid">
          ${withinBudget.map((pkg,i)=>renderPackageCard(pkg,i+1,false)).join('')}
        </div>`;
    }

    if(specialPass.length){
      const upperBound = Math.round(budgetMax * 1.2);
      html += `
        <div class="stage2-section-head special" style="margin-top:40px">
          <h2 class="stage2-section-title">✨ 조금 더 쓰면 이런 패키지도</h2>
          <span class="stage2-section-sub">${budgetMax.toLocaleString()}원 초과 ~ ${upperBound.toLocaleString()}원 · ${specialPass.length}개</span>
        </div>
        <div class="stage2-cards-grid">
          ${specialPass.map((pkg,i)=>renderPackageCard(pkg,i+1,true)).join('')}
        </div>`;
    } else if(withinBudget.length){
      const candidatePriceMax = data.meta?.candidate_price_max ?? null;
      const upperBound = Math.round(budgetMax * 1.2);
      const msg = candidatePriceMax !== null && candidatePriceMax <= budgetMax
        ? '선택하신 조건의 패키지 추천 결과가 모두 예산 범위 안에 포함되어 있습니다.'
        : candidatePriceMax !== null && candidatePriceMax > upperBound
          ? '스페셜 패스 금액이 예산을 크게 초과합니다. 최대 예산을 높여 다시 시도해보세요.'
          : '현재 조건에서는 스페셜 패스를 찾을 수 없습니다.';
      html += `
        <div class="stage2-section-head special" style="margin-top:40px">
          <h2 class="stage2-section-title">✨ 조금 더 쓰면 이런 패키지도</h2>
          <span class="stage2-section-sub">${budgetMax.toLocaleString()}원 초과 ~ ${Math.round(budgetMax*1.2).toLocaleString()}원</span>
        </div>
        <div class="stage2-empty" style="margin-top:12px">
          <div class="ico">💡</div><p>${msg}</p>
        </div>`;
    }

    html += `</div></div>`;
  }

  const resultContent = document.getElementById('pkgResultContent');
  if(resultContent) resultContent.innerHTML = html;
  goPage('result');
}

// ====== 패키지 카드 HTML ======
function renderPackageCard(pkg, idx, isSpecial){
  const t  = pkg.transport;
  const lo = pkg.lodging;
  const rc = pkg.rentcar;
  const le = pkg.leisure;

  const modeLabel = { ktx:'KTX', srt:'SRT', bus:'버스', mugunghwa:'무궁화·누리로' };
  const transportBookingUrl = {
    ktx:       'https://www.korail.com/intro',
    srt:       'https://etk.srail.kr/main.do',
    bus:       'https://www.kobus.co.kr/main.do',
    mugunghwa: 'https://www.korail.com/intro',
  };

  function fmtDist(km){ return '약 '+Math.round(km)+'km'; }
  function regularHtml(regularPrice, salePrice){
    if(!regularPrice || regularPrice <= salePrice) return '';
    return `<span class="pkg-card-regular">${regularPrice.toLocaleString()}원</span>`;
  }

  const fest = pkgState.festival;
  function fmtFestDate(s){ if(!s) return ''; const d=new Date(s); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }
  const festPeriod = (fest&&fest.start&&fest.end)
    ? (fest.start===fest.end ? fmtFestDate(fest.start) : `${fmtFestDate(fest.start)} ~ ${fmtFestDate(fest.end)}`)
    : (fest&&fest.start ? fmtFestDate(fest.start) : '');
  const festRegion  = fest ? [fest.sido, fest.sigungu].filter(Boolean).join(' ') : '';
  const festUrl     = (fest && fest.detail_url) ? fest.detail_url : '';
  const festImgHtml = (fest && fest.img)
    ? `<img src="${fest.img}" alt="${fest.title}" class="pkg-card-fest-img">`
    : `<span class="pkg-card-icon">🎪</span>`;

  const festivalHtml = fest ? `
    <div class="pkg-card-row pkg-card-row--festival${festUrl?' pkg-card-row--link':''}"${festUrl?` onclick="window.open('${festUrl}','_blank')"`:''}>
      ${festImgHtml}
      <div class="pkg-card-detail">
        <div class="pkg-card-label-row">
          <span class="pkg-card-label">축제</span>
          ${festUrl?'<span class="pkg-card-link-badge">상세 ↗</span>':''}
        </div>
        <span class="pkg-card-text">${fest.title}</span>
        <span class="pkg-card-meta">${festRegion}${festPeriod?' · '+festPeriod:''}</span>
      </div>
    </div>` : '';

  const tUrl = t ? (transportBookingUrl[t.mode]||'') : '';
  const transportHtml = t ? `
    <div class="pkg-card-row pkg-card-row--link" onclick="window.open('${tUrl}','_blank')">
      <span class="pkg-card-icon">🚄</span>
      <div class="pkg-card-detail">
        <div class="pkg-card-label-row">
          <span class="pkg-card-label">${modeLabel[t.mode]||t.mode}</span>
          <span class="pkg-card-link-badge">예매 ↗</span>
        </div>
        <span class="pkg-card-text">${t.origin_name} → ${t.dest_name}</span>
        <span class="pkg-card-meta">도착지에서 축제장까지 ${fmtDist(t.distance_to_festival_km)}</span>
        <span class="pkg-card-price">${t.total_fare.toLocaleString()}원${pkgState.adult>=2?` <span class="pkg-card-per-person">1인당 ${t.unit_fare.toLocaleString()}원</span>`:''}</span>
      </div>
    </div>` : '';

  const loUrl = lo && lo.url && lo.url!=='nan' ? lo.url : '';
  const lodgingHtml = lo ? `
    <div class="pkg-card-row${loUrl?' pkg-card-row--link':''}"${loUrl?` onclick="window.open('${loUrl}','_blank')"`:''}>
      <span class="pkg-card-icon">🏨</span>
      <div class="pkg-card-detail">
        <div class="pkg-card-label-row">
          <span class="pkg-card-label">${lo.accommodation_type_text||lo.dataset_type}</span>
          ${loUrl?'<span class="pkg-card-link-badge">상세 ↗</span>':''}
        </div>
        <span class="pkg-card-text">${lo.name}${lo.room_name?' · '+lo.room_name:''}</span>
        <span class="pkg-card-meta">축제장까지 ${fmtDist(lo.distance_to_festival_km)}${lo.review_count!=null?' · 후기 '+lo.review_count.toLocaleString()+'개':''}${lo.rating?' · ★'+lo.rating:''}</span>
        <div class="pkg-card-price-row">
          ${regularHtml(lo.regular_price, lo.sale_price)}
          <span class="pkg-card-price">${lo.sale_price.toLocaleString()}원</span>
          ${lo.discount_rate>0?`<span class="pkg-card-discount">${Math.round(lo.discount_rate*100)}% 할인</span>`:''}
        </div>
      </div>
    </div>` : '';

  const rentcarHtml = rc ? `
    <div class="pkg-card-row">
      <span class="pkg-card-icon">🚗</span>
      <div class="pkg-card-detail">
        <span class="pkg-card-label">렌터카</span>
        <span class="pkg-card-text">${rc.car_name}${rc.candidate_count>1?' 중 1개 선택':(rc.capacity?' ('+rc.capacity+'인승)':'')}</span>
        <div class="pkg-card-price-row">
          ${regularHtml(rc.regular_price, rc.sale_price)}
          <span class="pkg-card-price">${rc.sale_price.toLocaleString()}원</span>
          ${rc.discount_rate>0?`<span class="pkg-card-discount">${Math.round(rc.discount_rate*100)}% 할인</span>`:''}
        </div>
      </div>
    </div>` : '';

  const leisureHtml = (le&&le.length) ? `
    <div class="pkg-card-row">
      <span class="pkg-card-icon">🎿</span>
      <div class="pkg-card-detail">
        <span class="pkg-card-label">레저</span>
        ${le.map(l=>{
          const lUrl = l.url&&l.url!=='nan' ? l.url : '';
          return `
          <div class="pkg-card-leisure-item${lUrl?' pkg-card-leisure-item--link':''}"${lUrl?` onclick="window.open('${lUrl}','_blank')"`:''}>
            <div class="pkg-card-label-row">
              <span class="pkg-card-text">${l.name}</span>
              ${lUrl?'<span class="pkg-card-link-badge">상세 ↗</span>':''}
            </div>
            <span class="pkg-card-meta">축제장까지 ${fmtDist(l.distance_to_festival_km)}</span>
            <div class="pkg-card-price-row">
              ${regularHtml(l.regular_price, l.sale_price)}
              <span class="pkg-card-price">${l.sale_price.toLocaleString()}원</span>
              ${l.discount_rate>0?`<span class="pkg-card-discount">${Math.round(l.discount_rate*100)}% 할인</span>`:''}
              ${pkgState.adult>=2?`<span class="pkg-card-per-person">1인당 ${l.unit_sale_price.toLocaleString()}원</span>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const totalRegularHtml = (pkg.total_regular_price&&pkg.total_regular_price>pkg.total_sale_price)
    ? `<span class="pkg-card-total-regular">${pkg.total_regular_price.toLocaleString()}원</span>` : '';
  const discountBadge = pkg.total_discount_rate > 0
    ? `<span class="pkg-card-badge-discount">${Math.round(pkg.total_discount_rate*100)}% 절감</span>` : '';

  const cardId = `pkg-card-${isSpecial?'sp':'wb'}-${idx}`;

  let reasonLodgingHtml = '';
  if(lo){
    const items = [];
    if(lo.distance_to_festival_km!=null) items.push(`<div class="pkg-reason-row">📍 축제장까지 ${lo.distance_to_festival_km.toFixed(1)}km</div>`);
    if(lo.max_people!=null) items.push(`<div class="pkg-reason-row">👥 최대 ${lo.max_people}인 객실 (입력 인원 ${pkgState.adult}명 수용 가능)</div>`);
    if(lo.type_matched_companion && lo.accommodation_type_text) items.push(`<div class="pkg-reason-row">🏷️ ${lo.accommodation_type_text}은 ${pkgState.companion}에 어울리는 숙소 유형입니다</div>`);
    if(lo.matched_tags?.length) items.push(`<div class="pkg-reason-tags">${lo.matched_tags.map(t=>`<span class="pkg-reason-tag">${t}</span>`).join('')}</div>`);
    if(items.length) reasonLodgingHtml = `<div class="pkg-reason-section"><div class="pkg-reason-section-title">🏨 숙소 추천 근거</div>${items.join('')}</div>`;
  }

  let reasonLeisureHtml = '';
  if(le&&le.length){
    const rows = le.map(l=>{
      const rowItems = [];
      if(l.distance_to_festival_km!=null) rowItems.push(`<span class="pkg-reason-leisure-dist">📍 축제장까지 ${l.distance_to_festival_km.toFixed(1)}km</span>`);
      if(l.category_matched&&l.category) rowItems.push(`<span class="pkg-reason-leisure-desc">선택한 대분류 '${l.category}'와 일치</span>`);
      else if(pkgState.keywords.length>0&&l.category) rowItems.push(`<span class="pkg-reason-leisure-desc pkg-reason-leisure-fallback">선택한 대분류와 거리를 만족하는 상품이 부족하여 '${l.category}' 항목 중 거리 조건으로 추천</span>`);
      else rowItems.push(`<span class="pkg-reason-leisure-desc">거리 조건 기준 추천</span>`);
      return `<div class="pkg-reason-leisure-row"><span class="pkg-reason-leisure-name">${l.name}</span><div class="pkg-reason-leisure-meta">${rowItems.join('')}</div></div>`;
    }).join('');
    reasonLeisureHtml = `<div class="pkg-reason-section"><div class="pkg-reason-section-title">🎿 레저 추천 근거</div>${rows}</div>`;
  }

  const reasonPanelHtml = (reasonLodgingHtml||reasonLeisureHtml) ? `
    <div class="pkg-reason-toggle" onclick="toggleReason('${cardId}')">
      추천 근거 보기 <span class="pkg-reason-arrow" id="${cardId}-arrow">▼</span>
    </div>
    <div class="pkg-reason-panel" id="${cardId}-panel">
      ${reasonLodgingHtml}${reasonLeisureHtml}
    </div>` : '';

  return `
    <div class="pkg-card${isSpecial?' special':''}">
      <div class="pkg-card-header">
        <span class="pkg-card-num">${isSpecial?'✨':'🎯'} ${idx}</span>
        <div class="pkg-card-total">
          <span class="pkg-card-total-label">총 금액</span>
          <div class="pkg-card-total-price-group">
            ${totalRegularHtml}
            <span class="pkg-card-total-price">${pkg.total_sale_price.toLocaleString()}원</span>
          </div>
          ${discountBadge}
        </div>
      </div>
      <div class="pkg-card-body">
        ${festivalHtml}${transportHtml}${lodgingHtml}${rentcarHtml}${leisureHtml}
      </div>
      ${reasonPanelHtml}
    </div>`;
}

function toggleReason(cardId){
  const panel = document.getElementById(cardId+'-panel');
  const arrow = document.getElementById(cardId+'-arrow');
  if(!panel) return;
  const isOpen = panel.classList.toggle('open');
  if(arrow) arrow.textContent = isOpen ? '▲' : '▼';
}

// ====== 인원 ======
function ppl(delta){
  pkgState.adult = Math.max(1, pkgState.adult + delta);
  document.getElementById('cntPeople').textContent = pkgState.adult;
  const cell = document.getElementById('cellPeople');
  cell.innerHTML = `<span>${pkgState.adult}명</span><svg class="svg-icon icon-sm arrow" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
  document.querySelector('[data-cell="people"]').classList.add('has-value');
}

// ====== 출발지 2단계 ======
async function selectOriginRegion(region){
  pkgState.originRegion = region;
  pkgState.originName   = null;

  const cell = document.getElementById('cellOrigin');
  cell.innerHTML = `<span>${region} 선택중...</span><svg class="svg-icon icon-sm arrow" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
  document.querySelectorAll('.region-pop-item').forEach(i=>i.classList.toggle('selected', i.dataset.region===region));

  const popHead = document.querySelector('#popOrigin .pkg-popover-head');
  if(popHead){
    popHead.innerHTML = `
      <button class="origin-back-btn" onclick="event.stopPropagation();goBackToRegionStep()" title="지역 다시 선택">
        <svg class="svg-icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="origin-step2-region-label">📍 ${region}</span>
      <span class="origin-step2-hint">역 · 터미널 선택</span>
    `;
    popHead.classList.add('origin-step2-head');
    popHead.classList.remove('pkg-popover-head');
  }

  await loadOriginCandidates(region);
}

function goBackToRegionStep(){
  pkgState.originRegion = null;
  pkgState.originName   = null;

  const cell = document.getElementById('cellOrigin');
  cell.innerHTML = `<span>출발지 선택</span><svg class="svg-icon icon-sm arrow" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
  document.querySelector('[data-cell="origin"]').classList.remove('has-value');

  const popHead = document.querySelector('#popOrigin .origin-step2-head');
  if(popHead){
    popHead.className = 'pkg-popover-head';
    popHead.textContent = '어디에서 출발하시나요?';
  }

  renderOriginRegionGrid();
  updateSubmitState();
}

async function loadOriginCandidates(region){
  const og = document.getElementById('originGrid');
  og.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--gray-400);font-size:13px;font-weight:600">불러오는 중...</div>`;
  try{
    const res  = await fetch(`/origins?region=${encodeURIComponent(region)}`);
    const data = await res.json();
    if(!data.success){ og.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--accent-pink);font-size:13px;font-weight:600">출발지 조회 실패</div>`; return; }
    if(data.grouped && Object.keys(data.grouped).length > 0) renderOriginCandidatesGrouped(data.grouped);
    else if(Array.isArray(data.origins)) renderOriginCandidatesFlat(data.origins);
    else og.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--accent-pink);font-size:13px;font-weight:600">데이터 형식 오류</div>`;
  } catch(err){
    console.error(err);
    og.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--accent-pink);font-size:13px;font-weight:600">서버 연결 오류</div>`;
  }
}

const TRANSPORT_MODE_EMOJI = { 'KTX':'🚄', 'SRT':'🚅', '고속버스':'🚌', '무궁화호·누리로':'🚂' };
const TRANSPORT_MODE_ORDER = ['KTX','SRT','고속버스','무궁화호·누리로'];

function renderOriginCandidatesGrouped(grouped){
  const og = document.getElementById('originGrid');
  const orderedKeys = TRANSPORT_MODE_ORDER.filter(k=>grouped[k]&&grouped[k].length>0);
  const groupsHtml = orderedKeys.map(mode=>{
    const emoji = TRANSPORT_MODE_EMOJI[mode] || '🚉';
    const items = grouped[mode].map(name=>`
      <div class="origin-name-item" onclick="event.stopPropagation();selectOriginName('${name}')">${name}</div>
    `).join('');
    return `<div class="origin-mode-group"><div class="origin-mode-label"><span class="origin-mode-label-emoji">${emoji}</span>${mode}</div><div class="origin-mode-items">${items}</div></div>`;
  }).join('');
  og.className = '';
  og.innerHTML = `<div class="origin-candidates-wrap">${groupsHtml}</div>`;
}

function renderOriginCandidatesFlat(origins){
  const og = document.getElementById('originGrid');
  const items = origins.map(o=>`<div class="origin-name-item" onclick="event.stopPropagation();selectOriginName('${o}')">${o}</div>`).join('');
  og.className = '';
  og.innerHTML = `<div class="origin-candidates-wrap"><div class="origin-mode-group"><div class="origin-mode-items" style="grid-template-columns:repeat(3,1fr)">${items}</div></div></div>`;
}

function selectOriginName(originName){
  pkgState.originName = originName;
  const cell = document.getElementById('cellOrigin');
  cell.innerHTML = `<span>${pkgState.originRegion} · ${originName}</span><svg class="svg-icon icon-sm arrow" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
  document.querySelector('[data-cell="origin"]').classList.add('has-value');
  setTimeout(()=>closeAllPops(), 150);
  updateSubmitState();
}

// ====== 캘린더 ======
let calCurrent = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

function renderCal(){
  const y = calCurrent.getFullYear();
  const m = calCurrent.getMonth();
  document.getElementById('calMonth').textContent = `${y}년 ${m+1}월`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  ['일','월','화','수','목','금','토'].forEach((d,i)=>{
    const div = document.createElement('div');
    div.className = 'cal-dow'+(i===0?' sun':i===6?' sat':'');
    div.textContent = d;
    grid.appendChild(div);
  });

  const firstDay = new Date(y, m, 1).getDay();
  for(let i=0; i<firstDay; i++){
    const d = document.createElement('div'); d.className='cal-day empty'; grid.appendChild(d);
  }

  let festStart = null, festEnd = null;
  if(pkgState.festival?.start && pkgState.festival?.end){
    const s = new Date(pkgState.festival.start);
    const e = new Date(pkgState.festival.end);
    festStart = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    festEnd   = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  }

  const lastDate = new Date(y, m+1, 0).getDate();
  const today = TODAY;
  for(let i=1; i<=lastDate; i++){
    const cur = new Date(y, m, i);
    const div = document.createElement('div');
    div.className = 'cal-day';
    div.textContent = i;
    if(y===today.getFullYear() && m===today.getMonth() && i===today.getDate()) div.classList.add('today');
    const isBeforeToday  = cur < today;
    const isOutsideFest  = festStart && festEnd && (cur < festStart || cur > festEnd);
    if(isBeforeToday || isOutsideFest){
      div.classList.add('disabled');
    } else {
      if(pkgState.startDate && pkgState.endDate){
        const s = new Date(pkgState.startDate), e = new Date(pkgState.endDate);
        if(cur.getTime()===s.getTime())      div.classList.add('selected','range-start');
        else if(cur.getTime()===e.getTime()) div.classList.add('selected','range-end');
        else if(cur>s && cur<e)              div.classList.add('in-range');
      } else if(pkgState.startDate){
        if(cur.getTime()===new Date(pkgState.startDate).getTime()) div.classList.add('selected');
      }
      div.onclick = ev=>{ ev.stopPropagation(); selectDate(cur); };
    }
    grid.appendChild(div);
  }
}

function calMove(d){
  calCurrent.setMonth(calCurrent.getMonth()+d);
  renderCal();
}

function isSameDayDate(a, b){
  return a&&b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function isDayTrip(){
  return !!(pkgState.startDate && pkgState.endDate && isSameDayDate(pkgState.startDate, pkgState.endDate));
}

function removeLodgingIfDayTrip(){
  if(!isDayTrip()) return;
  const idx = pkgState.includeItems.indexOf('숙박');
  if(idx === -1) return;
  pkgState.includeItems.splice(idx, 1);
  const grid = document.getElementById('includeItemsGridDynamic');
  if(grid) grid.querySelectorAll('.companion-item').forEach(el=>{ if(el.dataset.itemKey==='숙박') el.classList.remove('selected'); });
  const valEl = document.getElementById('chipIncludeItemsValue');
  if(valEl){
    if(pkgState.includeItems.length > 0){ valEl.textContent=pkgState.includeItems.join('·'); valEl.style.display='inline'; document.getElementById('chipIncludeItems')?.classList.add('has-value'); }
    else { valEl.style.display='none'; document.getElementById('chipIncludeItems')?.classList.remove('has-value'); }
  }
}

function selectDate(d){
  if(!pkgState.startDate || (pkgState.startDate && pkgState.endDate)){
    pkgState.startDate = d;
    pkgState.endDate   = null;
    document.getElementById('calInfo').innerHTML = `<b>${fmtCalDate(d)}</b> 부터 — 종료일을 선택하세요`;
  } else {
    if(d < pkgState.startDate){
      pkgState.startDate = d;
      pkgState.endDate   = null;
      document.getElementById('calInfo').innerHTML = `<b>${fmtCalDate(d)}</b> 부터 — 종료일을 선택하세요`;
    } else {
      pkgState.endDate = d;
      const days = Math.round((d - pkgState.startDate) / (1000*60*60*24)) + 1;
      if(isSameDayDate(pkgState.startDate, d)){
        document.getElementById('calInfo').innerHTML = `<b>${fmtCalDate(d)}</b> · 당일치기 (숙박 불포함)`;
      } else {
        document.getElementById('calInfo').innerHTML = `<b>${fmtCalDate(pkgState.startDate)} — ${fmtCalDate(d)}</b> · ${days}일`;
      }
      const cell = document.getElementById('cellDates');
      cell.innerHTML = `<span>${fmtCalShort(pkgState.startDate)} — ${fmtCalShort(d)}</span><svg class="svg-icon icon-sm arrow" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
      document.querySelector('[data-cell="dates"]').classList.add('has-value');
      removeLodgingIfDayTrip();
      setTimeout(()=>closeAllPops(), 200);
      updateSubmitState();
    }
  }
  renderCal();
}

function fmtCalDate(d){ return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`; }
function fmtCalShort(d){ return `${d.getMonth()+1}.${d.getDate()}`; }
function fmtPeriod(f){
  if(!f.start) return '';
  const s = new Date(f.start);
  const e = f.end ? new Date(f.end) : s;
  if(s.getTime() === e.getTime())
    return `${s.getFullYear()}.${s.getMonth()+1}.${s.getDate()}`;
  if(s.getFullYear() === e.getFullYear())
    return `${s.getFullYear()}.${s.getMonth()+1}.${s.getDate()} — ${e.getMonth()+1}.${e.getDate()}`;
  return `${s.getFullYear()}.${s.getMonth()+1}.${s.getDate()} — ${e.getFullYear()}.${e.getMonth()+1}.${e.getDate()}`;
}
function formatApiDate(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ====== 축제 리스트 ======
function renderFestList(query){
  let list = [...PKG_FESTIVALS].filter(f=>f.status!=='ended');
  if(query){
    const q = query.toLowerCase();
    list = list.filter(f=>
      f.title.toLowerCase().includes(q) ||
      f.sido.includes(query) ||
      (f.sigungu && f.sigungu.includes(query))
    );
  }
  list.sort((a,b)=>{
    const aP = a.status==='ongoing' ? -1000 : a.d_start;
    const bP = b.status==='ongoing' ? -1000 : b.d_start;
    return aP !== bP ? aP-bP : 0;
  });

  const el = document.getElementById('festList');
  if(list.length===0){
    el.innerHTML = '<div style="padding:32px 16px;text-align:center;color:var(--gray-500);font-size:13px">일치하는 축제가 없어요</div>';
    return;
  }
  el.innerHTML = list.map(f=>`
    <div class="fest-list-item ${pkgState.festival?.id===f.id?'selected':''}" onclick="event.stopPropagation();selectFestival(${f.id})">
      <div class="fest-list-thumb" style="${f.img?`background-image:url('${f.img}')`:'background:var(--gradient-festival)'}"></div>
      <div class="fest-list-info">
        <div class="fest-list-name">${f.title}</div>
        <div class="fest-list-meta">📍 ${f.sido} ${f.sigungu||''} · ${fmtPeriod(f)}</div>
      </div>
    </div>
  `).join('');
}

function selectFestival(id){
  const f = PKG_FESTIVALS.find(x=>x.id===id);
  if(!f) return;
  pkgState.festival = f;

  const cell = document.getElementById('cellFestival');
  cell.innerHTML = `<span>${f.title}</span><svg class="svg-icon icon-sm arrow" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
  document.querySelector('[data-cell="festival"]').classList.add('has-value');

  pkgState.startDate = null;
  pkgState.endDate   = null;
  const cellDates = document.getElementById('cellDates');
  if(cellDates){
    cellDates.innerHTML = `<span>일정 선택</span><svg class="svg-icon icon-sm arrow" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
    document.querySelector('[data-cell="dates"]')?.classList.remove('has-value');
  }
  const calInfo = document.getElementById('calInfo');
  if(calInfo) calInfo.innerHTML = '시작일을 선택하세요';

  if(f.start){
    const d = new Date(f.start);
    calCurrent = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  renderCal();
  closeAllPops();
  updateSubmitState();
}

// 버튼 초기 비활성화
const _pkgSearchBtn = document.getElementById('pkgSearchBtn');
if(_pkgSearchBtn) _pkgSearchBtn.disabled = true;
