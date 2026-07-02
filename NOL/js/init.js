// ====== SCRIPT BLOCK 1: Data Note ======
(function(){
  const total   = (typeof FESTIVALS !== 'undefined') ? FESTIVALS.length : 1873;
  const full    = (typeof FESTIVALS_FULL !== 'undefined') ? FESTIVALS_FULL.length : 531;
  const withImg = (typeof FESTIVALS_FULL !== 'undefined') ? FESTIVALS_FULL.filter(f=>f.img).length : 94;
  const t = new Date();
  const dateStr = t.getFullYear() + '.' + String(t.getMonth()+1).padStart(2,'0') + '.' + String(t.getDate()).padStart(2,'0');
  const el = document.getElementById('dataNoteEl');
  if(el) el.innerHTML = `📊 <strong>전체 ${total.toLocaleString()}개 축제 데이터</strong> (상세 정보 ${full}개 · 이미지 보유 ${withImg}개 · 요약 ${total - full}개 · 한국관광공사 국문관광정보 API 기반 · 마지막 갱신 기준일(${dateStr}) 기준으로 자동 갱신됩니다)`;
})();

// ====== SCRIPT BLOCK 2: DOMContentLoaded - Ranking Tabs ======
document.addEventListener('DOMContentLoaded', function(){
  var rankTabs = document.querySelectorAll('.rank-tabs .rank-tab');
  var rankNotice = document.getElementById('rankNotice');
  if(!rankTabs.length || !rankNotice) return;

  rankTabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      rankTabs.forEach(function(t){ t.classList.remove('active'); });
      this.classList.add('active');
      curRankTab = this.dataset.rank;
      renderRanking();
    });
  });

  var cntClosingBadge = document.getElementById('cntClosing');
  var closingTrack = document.getElementById('closingTrack');
  function updateClosingCount(){
    try{
      var cnt = 0;
      if(closingTrack){
        cnt = closingTrack.querySelectorAll('.closing-card').length;
      }
      if(cntClosingBadge) cntClosingBadge.textContent = cnt;
    }catch(e){ console.error(e); }
  }
  updateClosingCount();
  if(closingTrack && window.MutationObserver){
    var mo = new MutationObserver(function(){ updateClosingCount(); });
    mo.observe(closingTrack, {childList:true,subtree:true});
  }
});

// ====== SCRIPT BLOCK 4: Init Popup ======
(function(){
  var KEY = 'nol_init_no_show';
  var popup = document.getElementById('initPopupBg');
  function closeInitPopup(e) {
    if (!e || e.target === popup) {
      if (popup) popup.classList.remove('show');
      var cb = document.getElementById('initPopupNoShow');
      if (cb && cb.checked) {
        sessionStorage.setItem(KEY, '1');
      }
    }
  }
  window.closeInitPopup = closeInitPopup;
  if (sessionStorage.getItem(KEY) === '1') return;
  if (popup) popup.classList.add('show');
  setTimeout(function(){ closeInitPopup(); }, 3000);
})();

// ====== SCRIPT BLOCK 4: Find Mode ======
(function(){
  let curFindMode = 'taste';
  const TOPIC_BY_QUIZ = ['M1_자연계절','M4_예술공연창작','M5_가족체험','M4_예술공연창작','M3_먹거리특산물','M2_역사문화','M7_과학레저'];

  window.selectFindMode = function(mode){
    curFindMode = mode;
    ['taste','region','style'].forEach(m=>{
      const card = document.getElementById('fmc-'+m);
      const panel = document.getElementById('findPanel'+m.charAt(0).toUpperCase()+m.slice(1));
      if(card) card.classList.toggle('active', m===mode);
      if(panel) panel.style.display = (m===mode)?'':'none';
    });
    curRegion='ALL'; curTopic='ALL'; curStyle='ALL'; curPage=1;
    document.getElementById('exploreStatusSection').style.display='none';
    if(mode==='taste')  initTastePanel();
    if(mode==='region') initRegionPanel();
  };

  window.initTastePanel = function(){
    const hasResult = window.quizTop1 !== null && window.quizTop1 !== undefined;
    document.getElementById('tasteHasResult').style.display = hasResult ? '' : 'none';
    const nb = document.getElementById('tasteNoBanner'); if(nb) nb.style.display = hasResult ? 'none' : '';
    if(hasResult){
      const label = (TOPIC_LABELS||[])[window.quizTop1] || '';
      document.getElementById('tasteResultTypeName').textContent = label + ' 유형 기반 추천';
      renderTasteResultCards(window.quizTop1);
    }
  };

  window.renderTasteResultCards = function(top1){
    const pref = (typeof TYPE_ENTROPY_PREF!=='undefined' ? TYPE_ENTROPY_PREF : [])[top1] || 'balanced';
    const RANGES = {focused:{min:0,max:0.8}, balanced:{min:0.8,max:1.5}, diverse:{min:1.5,max:999}};
    const si = RANGES[pref];
    const topicKey = TOPIC_BY_QUIZ[top1] || null;
    const matched = [...FESTIVALS_FULL]
      .filter(f=>{
        const e = f.topic_entropy;
        const eOk = e!==undefined && !isNaN(e) && e>=si.min && e<si.max;
        const tOk = topicKey && f.dominant_macro === topicKey;
        return eOk || tOk;
      })
      .sort((a,b)=>b.visitors-a.visitors).slice(0,6);
    const container = document.getElementById('tasteResultCards');
    if(!container) return;
    container.innerHTML = '';
    matched.forEach(f=>{ const tmp=document.createElement('div'); tmp.innerHTML=renderFullCard(f); container.appendChild(tmp.firstElementChild); });
    document.getElementById('exploreStatusSection').style.display='none';
  };

  window.showAllThemesInTaste = function(){
    document.getElementById('tasteThemeMode').style.display='';
  };

  window.clearQuizResult = function(){
    window.quizTop1 = null; window.quizStylePref = null;
    document.getElementById('tasteHasResult').style.display='none';
    const nb2 = document.getElementById('tasteNoBanner'); if(nb2) nb2.style.display='';
    document.getElementById('tasteThemeMode').style.display='';
  };

  window.initRegionPanel = function(){
    renderRegionFilter2();
    document.getElementById('regionStep2').style.display='none';
    document.getElementById('exploreStatusSection').style.display='none';
  };

  window.renderRegionFilter2 = function(){
    const counts={};
    FESTIVALS.forEach(f=>{if(f.sido_clean) counts[f.sido_clean]=(counts[f.sido_clean]||0)+1;});
    const sortedSidos=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    const el=document.getElementById('regionFilter');
    el.innerHTML=`<button class="region-chip active" data-sido="ALL">전체 <span class="count">${FESTIVALS.length}</span></button>`+
      sortedSidos.map(([s,c])=>`<button class="region-chip" data-sido="${s}">${s} <span class="count">${c}</span></button>`).join('');
    el.querySelectorAll('.region-chip').forEach(b=>{
      b.addEventListener('click',()=>{
        el.querySelectorAll('.region-chip').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        curRegion=b.dataset.sido; curTopic='ALL'; curPage=1;
        renderCardGrid();
        document.getElementById('exploreStatusSection').style.display='';
        if(curRegion!=='ALL'){ renderRegionSubTheme(); document.getElementById('regionStep2').style.display=''; }
        else { document.getElementById('regionStep2').style.display='none'; }
      });
    });
  };

  window.renderRegionSubTheme = function(){
    const THEMES=[
      {topic:'ALL',label:'전체',emoji:'📋'},
      {topic:'M1_자연계절',label:'자연·계절',emoji:'🌿'},
      {topic:'M2_역사문화',label:'역사·문화',emoji:'🏯'},
      {topic:'M3_먹거리특산물',label:'먹거리',emoji:'🍜'},
      {topic:'M4_예술공연창작',label:'예술·공연',emoji:'🎭'},
      {topic:'M5_가족체험',label:'가족·체험',emoji:'👨‍👩‍👧'},
      {topic:'M6_청년마켓',label:'청년·마켓',emoji:'🎪'},
      {topic:'M7_과학레저',label:'레저',emoji:'🏄'},
    ];
    const container=document.getElementById('regionSubTheme');
    container.innerHTML=THEMES.map(t=>`<button class="style-chip ${t.topic==='ALL'?'active':''}" data-subtopic="${t.topic}">${t.emoji} ${t.label}</button>`).join('');
    container.querySelectorAll('.style-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        container.querySelectorAll('.style-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        curTopic=chip.dataset.subtopic; curPage=1; renderCardGrid();
      });
    });
  };

  window.selectStyleCard = function(style){
    ['focused','balanced','diverse'].forEach(s=>document.getElementById('ssc-'+s).classList.toggle('active',s===style));
    curStyle=style; curPage=1;
    document.getElementById('exploreStatusSection').style.display='';
    renderCardGrid();
  };

  

  const sortSel=document.getElementById('sortSelect');
  if(sortSel) sortSel.addEventListener('change',()=>{ curSort=sortSel.value; curPage=1; renderCardGrid(); });
})();

// ====== INIT: 초기화 및 이벤트 등록 ======
document.querySelectorAll('.rank-tab').forEach(tab=>{
  tab.onclick = ()=>{
    document.querySelectorAll('.rank-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    curRankTab = tab.dataset.rank;
    renderRanking();
  };
});


const sortSelectEl = document.getElementById('sortSelect');
if(sortSelectEl) sortSelectEl.onchange = e=>{
  curSort = e.target.value;
  curPage = 1;
  renderCardGrid();
};

document.addEventListener('keydown', e=>{
  if(e.key==='Escape') closeModal();
});

// 검색 버튼 초기 비활성화
const pkgSearchBtnEl = document.getElementById('pkgSearchBtn');
if(pkgSearchBtnEl) pkgSearchBtnEl.disabled = true;

// 시작
renderStats();
renderHero();
resetSlideTimer();
renderRanking();
renderThemeCounts();
renderSeasonRecs();
