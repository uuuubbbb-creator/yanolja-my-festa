// ====== REGION + CARD GRID ======
let curRegion = 'ALL';
let curTopic = 'ALL';
let curSort = 'popular';
let curStyle = 'ALL';
let curPage = 1;
const PER_PAGE = 12;

function renderRegionFilter(){
  const counts = {};
  FESTIVALS.forEach(f=>{if(f.sido_clean){counts[f.sido_clean]=(counts[f.sido_clean]||0)+1;}});
  const sortedSidos = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const filterEl = document.getElementById('regionFilter');
  filterEl.innerHTML = `<button class="region-chip active" data-sido="ALL">전체 <span class="count">${FESTIVALS.length}</span></button>` +
    sortedSidos.map(([s,c])=>`<button class="region-chip" data-sido="${s}">${s} <span class="count">${c}</span></button>`).join('');
  filterEl.querySelectorAll('.region-chip').forEach(b=>{
    b.addEventListener('click',()=>{
      filterEl.querySelectorAll('.region-chip').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      curRegion = b.dataset.sido;
      curPage = 1;
      renderCardGrid();
    });
  });
}

function renderCardGrid(){
  let list = [...FESTIVALS];
  if(curRegion!=='ALL') list = list.filter(f=>f.sido_clean===curRegion);
  if(curTopic!=='ALL')  list = list.filter(f=>f.dominant_macro===curTopic);
  if(curStyle!=='ALL'){
    list = list.filter(f=>{
      const e = f.topic_entropy;
      if(e===undefined||e===null||isNaN(e)) return false;
      if(curStyle==='focused')  return e < 0.8;
      if(curStyle==='balanced') return e >= 0.8 && e < 1.5;
      if(curStyle==='diverse')  return e >= 1.5;
      return true;
    });
  }

  if(curSort==='popular') list.sort((a,b)=>b.visitors-a.visitors);
  else if(curSort==='dday'){
    list.sort((a,b)=>{
      const ca=computeStatus(a), cb=computeStatus(b);
      const aS = ca.status==='upcoming'?ca.d_start:(ca.status==='ongoing'?-1:9999);
      const bS = cb.status==='upcoming'?cb.d_start:(cb.status==='ongoing'?-1:9999);
      return aS-bS;
    });
  }
  else if(curSort==='rating') list.sort((a,b)=>b.visitors-a.visitors);
  else if(curSort==='recent') list.sort((a,b)=>b.id-a.id);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total/PER_PAGE));
  curPage = Math.min(curPage, totalPages);
  const start = (curPage-1)*PER_PAGE;
  const pageList = list.slice(start, start+PER_PAGE);

  const grid = document.getElementById('cardGrid');

  let regionTotal = FESTIVALS.length;
  if(curRegion !== 'ALL') regionTotal = FESTIVALS.filter(f=>f.sido_clean===curRegion).length;

  const parts = [];
  if(curTopic!=='ALL') parts.push(`'${TOPIC_LABEL[curTopic]||curTopic}'`);
  if(curRegion!=='ALL') parts.push(curRegion);

  let subTextRaw;
  if(parts.length === 0){
    subTextRaw = `전체 ${total}개`;
  } else {
    const rl = curRegion==='ALL' ? '전국' : `${curRegion} 전체`;
    subTextRaw = `${parts.join(' · ')} · ${total}개 / ${rl} ${regionTotal}개`;
  }

  const gridSubEl = document.getElementById('gridSub');
  if(gridSubEl) gridSubEl.textContent = subTextRaw;
  const gridTitleEl = document.getElementById('gridTitle');
  if(gridTitleEl){
    let titleText = '<span class="icon">📍</span>';
    if(curTopic!=='ALL') titleText += `${TOPIC_EMOJI[curTopic]||'🎪'} ${TOPIC_LABEL[curTopic]||curTopic}`;
    else titleText += '지역으로 찾아보기';
    if(curRegion!=='ALL') titleText += ` · ${curRegion}`;
    gridTitleEl.innerHTML = titleText;
  }

  if(pageList.length===0){
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="ico">🔍</div><div class="msg">선택한 조건에 맞는 축제가 없어요.<br>다른 필터를 시도해보세요.</div></div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = '';
  let _ci = 0;
  while(_ci < pageList.length){
    const _cf = pageList[_ci];
    if(_cf.card_type === 'mini'){
      const wrap = document.createElement('div');
      wrap.className = 'mini-list-wrap';
      wrap.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;background:#fff;border:1px solid var(--gray-100);border-radius:14px;overflow:hidden;';
      while(_ci < pageList.length && pageList[_ci].card_type === 'mini'){
        wrap.insertAdjacentHTML('beforeend', renderMiniCard(pageList[_ci]));
        _ci++;
      }
      grid.appendChild(wrap);
    } else {
      const tmp = document.createElement('div');
      tmp.innerHTML = _cf.card_type === 'full' ? renderFullCard(_cf) : renderTextCard(_cf);
      if(tmp.firstElementChild) grid.appendChild(tmp.firstElementChild);
      _ci++;
    }
  }

  renderPagination(totalPages);
}

function renderPagination(totalPages){
  const pg = document.getElementById('pagination');
  pg.innerHTML = '';
  if(totalPages<=1) return;

  const prev = document.createElement('button');
  prev.className = 'pg-btn';
  prev.disabled = curPage===1;
  prev.innerHTML = '‹';
  prev.onclick = ()=>{if(curPage>1){curPage--;renderCardGrid();window.scrollTo({top:document.getElementById('cardGrid').offsetTop-100,behavior:'smooth'});}};
  pg.appendChild(prev);

  let startP = Math.max(1, curPage-3);
  let endP = Math.min(totalPages, startP+6);
  startP = Math.max(1, endP-6);

  for(let i=startP; i<=endP; i++){
    const b = document.createElement('button');
    b.className = 'pg-btn' + (i===curPage?' active':'');
    b.textContent = i;
    b.onclick = ()=>{curPage=i;renderCardGrid();window.scrollTo({top:document.getElementById('cardGrid').offsetTop-100,behavior:'smooth'});};
    pg.appendChild(b);
  }

  const next = document.createElement('button');
  next.className = 'pg-btn';
  next.disabled = curPage===totalPages;
  next.innerHTML = '›';
  next.onclick = ()=>{if(curPage<totalPages){curPage++;renderCardGrid();window.scrollTo({top:document.getElementById('cardGrid').offsetTop-100,behavior:'smooth'});}};
  pg.appendChild(next);
}
