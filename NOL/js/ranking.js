// ====== RANKING ======
let curRankTab = 'popular';
const STATUS_PER_PAGE = 12;
let curStatusPage = 1;
let statusFullList = [];

function renderRanking(){
  const ongoingList  = FESTIVALS.filter(f=>computeStatus(f).status==='ongoing');
  const upcomingList = FESTIVALS.filter(f=>computeStatus(f).status==='upcoming');
  const closingList  = FESTIVALS.filter(f=>{
    const cs = computeStatus(f);
    if(cs.status==='upcoming' && cs.d_start<=14) return true;
    if(cs.status==='ongoing'  && cs.d_end<=7)    return true;
    return false;
  });

  ['cntPop','cntOng','cntSoon','cntClosing'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.visibility='visible';});
  document.getElementById('cntPop').textContent = ongoingList.length;
  document.getElementById('cntOng').textContent = ongoingList.length;
  document.getElementById('cntSoon').textContent = upcomingList.length;
  try{ document.getElementById('cntClosing').textContent = closingList.length; }catch(e){}

  const notice = document.getElementById('rankNotice');
  if(notice) notice.style.display = (curRankTab==='popular') ? 'flex' : 'none';

  const rankGrid    = document.getElementById('rankGrid');
  const statusSec   = document.getElementById('statusSection');

  if(curRankTab === 'popular'){
    rankGrid.parentElement.style.display = '';
    rankGrid.style.display = '';
    statusSec.classList.add('hidden');

    const list = [...ongoingList].sort((a,b)=>b.visitors-a.visitors);
    rankGrid.innerHTML = '';
    if(!list.length){
      rankGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="ico">📭</div><div class="msg">현재 진행중인 축제가 없어요</div></div>';
      return;
    }
    list.forEach((f,i)=>{
      const card = document.createElement('div');
      card.className = 'rank-card' + (i<3?' top3':'');
      card.onclick = ()=>openModal(f.id);
      const thumbContent = f.img
        ? `<div class="rank-thumb" style="background-image:url('${f.img}')"></div>`
        : `<div class="rank-thumb"><div class="rank-thumb-fallback">${TOPIC_EMOJI[f.dominant_macro]||'🎪'}</div></div>`;
      card.innerHTML = `
        <span class="rank-num">${i+1}</span>
        ${thumbContent}
        <div class="rank-info">
          <p class="rank-region">${regionLabel(f)}</p>
          <p class="rank-name">${f.name}</p>
          <p class="rank-meta">👥 ${(f.visitors||0).toLocaleString()}명 · ${getDDay(f)||fmtDate(f.start)+' 시작'}</p>
        </div>`;
      rankGrid.appendChild(card);
    });

  } else {
    rankGrid.style.display = 'none';
    statusSec.classList.remove('hidden');
    curStatusPage = 1;

    if(curRankTab === 'ongoing'){
      statusFullList = [...ongoingList].sort((a,b)=>computeStatus(a).d_end - computeStatus(b).d_end);
    } else if(curRankTab === 'soon'){
      statusFullList = [...upcomingList].sort((a,b)=>computeStatus(a).d_start - computeStatus(b).d_start);
    } else if(curRankTab === 'closing'){
      statusFullList = [...closingList].sort((a,b)=>{
        const ca = computeStatus(a); const cb = computeStatus(b);
        const aD = ca.status==='upcoming' ? ca.d_start : ca.d_end;
        const bD = cb.status==='upcoming' ? cb.d_start : cb.d_end;
        return aD-bD;
      });
    }
    renderStatusPage();
  }
}

function renderStatusPage(){
  const grid = document.getElementById('statusGrid');
  const pag  = document.getElementById('statusPagination');
  const total = statusFullList.length;
  const totalPages = Math.max(1, Math.ceil(total/STATUS_PER_PAGE));
  curStatusPage = Math.min(curStatusPage, totalPages);
  const slice = statusFullList.slice((curStatusPage-1)*STATUS_PER_PAGE, curStatusPage*STATUS_PER_PAGE);

  grid.innerHTML = '';
  if(!slice.length){
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="ico">📭</div><div class="msg">현재 해당하는 축제가 없어요</div></div>';
    pag.innerHTML = '';
    return;
  }
  slice.forEach(f=>{
    const card = document.createElement('div');
    card.className = 'closing-card';
    card.onclick = ()=>openModal(f.id);
    const cs = computeStatus(f);
    const dday = cs.status==='upcoming'
      ? (cs.d_start===0 ? 'D-DAY' : `D-${cs.d_start}`)
      : `종료 D-${cs.d_end}`;
    const showDday = (curRankTab==='closing');
    const imgHtml = f.img
      ? `<div class="closing-img" style="background-image:url('${f.img}')">${showDday?`<span class="closing-dday">${dday}</span>`:''}</div>`
      : `<div class="closing-img"><div class="closing-img-fallback">${TOPIC_EMOJI[f.dominant_macro]||'🎪'}</div>${showDday?`<span class="closing-dday">${dday}</span>`:''}</div>`;
    card.innerHTML = `
      ${imgHtml}
      <div class="closing-info">
        <p class="closing-region">${regionLabel(f)}</p>
        <p class="closing-name">${f.name}</p>
        <p class="closing-period">${fmtPeriod(f)}</p>
      </div>`;
    grid.appendChild(card);
  });

  pag.innerHTML = '';
  if(totalPages <= 1) return;
  const prevBtn = document.createElement('button');
  prevBtn.className = 'status-page-arrow';
  prevBtn.innerHTML = '‹';
  prevBtn.disabled = (curStatusPage===1);
  prevBtn.onclick = ()=>{ curStatusPage--; renderStatusPage(); };
  pag.appendChild(prevBtn);

  const maxShow = 5;
  let start = Math.max(1, curStatusPage-2);
  let end   = Math.min(totalPages, start+maxShow-1);
  if(end-start < maxShow-1) start = Math.max(1, end-maxShow+1);
  for(let p=start; p<=end; p++){
    const btn = document.createElement('button');
    btn.className = 'status-page-btn' + (p===curStatusPage?' active':'');
    btn.textContent = p;
    btn.onclick = (()=>{ const pg=p; return ()=>{ curStatusPage=pg; renderStatusPage(); }; })();
    pag.appendChild(btn);
  }
  const nextBtn = document.createElement('button');
  nextBtn.className = 'status-page-arrow';
  nextBtn.innerHTML = '›';
  nextBtn.disabled = (curStatusPage===totalPages);
  nextBtn.onclick = ()=>{ curStatusPage++; renderStatusPage(); };
  pag.appendChild(nextBtn);
}

// ====== THEME COUNTS ======
function renderThemeCounts(){
  const topics = ['M1_자연계절','M2_역사문화','M3_먹거리특산물','M4_예술공연창작','M5_가족체험','M6_청년마켓','M7_과학레저'];
  topics.forEach((t,i)=>{
    const c = FESTIVALS.filter(f=>f.dominant_macro===t).length;
    const el = document.getElementById('cntT'+(i+1));
    if(el) el.textContent = c+'개 축제';
  });
}
