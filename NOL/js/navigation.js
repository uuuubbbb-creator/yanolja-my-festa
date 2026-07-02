// ====== PAGE NAVIGATION ======
function showToast(msg){
  let t = document.getElementById('nolToast');
  if(!t){
    t = document.createElement('div');
    t.id = 'nolToast';
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);background:#1f2937;color:#fff;font-size:13px;font-weight:600;padding:10px 22px;border-radius:100px;z-index:9999;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2200);
}

async function loadPageContent(el){
  const src = el.getAttribute('data-src');
  if(!src || el._loaded) return;
  try {
    const res = await fetch(src);
    if(!res.ok) throw new Error(res.status);
    el.innerHTML = await res.text();
    el._loaded = true;
  } catch(e) {
    console.error('페이지 로드 실패:', src, e);
  }
}

async function goPage(name){
  const targetEl = document.getElementById('page-'+name);
  if(!targetEl){
    if(name==='survey'){
      alert('🎯 설문 페이지를 찾을 수 없습니다.');
    }
    return;
  }

  // Lazy-load HTML fragment on first visit
  await loadPageContent(targetEl);

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  targetEl.classList.add('active');
  history.pushState({page: name}, '', '#' + name);
  window.scrollTo({top: 0, behavior: 'smooth'});
  const bc = document.getElementById('breadcrumbCurrent');
  if(name==='survey'){
    if(bc) bc.textContent = 'MY FESTA › 나와 닮은 축제 찾기';
    document.getElementById('floatCta').style.display = 'none';
  } else if(name==='type-result'){
    if(bc) bc.textContent = 'MY FESTA › 유형 결과';
    document.getElementById('floatCta').style.display = 'none';
  } else if(name==='integrated'){
    if(bc) bc.textContent = 'MY FESTA › 원스톱 축제 여행';
    document.getElementById('floatCta').style.display = 'none';
  } else if(name==='pkg-landing'){
    if(bc) bc.textContent = 'MY FESTA › 올인원 패키지';
    document.getElementById('floatCta').style.display = 'none';
    initPkgIfNeeded();
  } else if(name==='result'){
    if(bc) bc.textContent = 'MY FESTA › 패키지 추천 결과';
    document.getElementById('floatCta').style.display = 'none';
  } else if(name==='explore'){
    if(bc) bc.textContent = '맞춤 축제 찾기';
    document.getElementById('floatCta').style.display = 'none';
    showExploreSection();
    renderThemeCounts();
  } else if(name==='quiz'){
    if(bc) bc.textContent = 'MY FESTA › 유형 진단';
    document.getElementById('floatCta').style.display = 'none';
    startQuiz();
  } else {
    if(bc) bc.textContent = 'MY FESTA';
    document.getElementById('floatCta').style.display = 'flex';
    closeAllPops();
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

// 브라우저 뒤로가기 지원
window.addEventListener('popstate', async function(e){
  const page = (e.state && e.state.page) || 'discover';
  const targetEl = document.getElementById('page-' + page);
  if(targetEl){
    await loadPageContent(targetEl);
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    targetEl.classList.add('active');
    window.scrollTo(0,0);
  }
});
