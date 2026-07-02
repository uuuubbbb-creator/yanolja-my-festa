// ====== HERO SLIDER ======
let curSlide = 0;
let slideTimer = null;
const heroFestivals = [...FESTIVALS_FULL]
  .filter(f=>{const cs=computeStatus(f);return f.img&&(cs.status==='upcoming'&&cs.d_start<=60||cs.status==='ongoing');})
  .sort((a,b)=>b.visitors-a.visitors)
  .slice(0,5);

function renderHero(){
  const slidesEl = document.getElementById('slides');
  const dotsEl = document.getElementById('dots');
  slidesEl.innerHTML = '';
  dotsEl.innerHTML = '';

  // ── Slide 0: 브랜드 히어로 (항상 첫 슬라이드) ──
  const brandSlide = document.createElement('div');
  brandSlide.className = 'slide active';
  brandSlide.innerHTML = `
    <div class="slide-bg no-overlay" style="background-image:url('images/23.jpeg')"></div>`;
  slidesEl.appendChild(brandSlide);
  const brandDot = document.createElement('span');
  brandDot.className = 'dot active';
  brandDot.onclick = ()=>slideGo(0);
  dotsEl.appendChild(brandDot);

  heroFestivals.forEach((f,i)=>{
    const idx = i + 1;
    const div = document.createElement('div');
    div.className = 'slide';
    const _hcs = computeStatus(f);
    const dday = getDDay(f);
    const ddayHtml = dday ? `<span class="slide-badge ${_hcs.status==='ongoing'?'live':'dday'}">${dday}</span>` : '';
    div.innerHTML = `
      <div class="slide-bg" style="${imgStyle(f)}"></div>
      <div class="slide-content">
        <div class="slide-badges">
          ${ddayHtml}
          <span class="slide-badge topic">${TOPIC_EMOJI[f.dominant_macro]||'🎪'} ${TOPIC_LABEL[f.dominant_macro]||f.dominant_macro}</span>
        </div>
        <h1 class="slide-title">${f.name}</h1>
        <div class="slide-meta">
          <span class="slide-meta-item">📍 ${regionLabel(f)}</span>
          <span class="slide-meta-item">📅 ${fmtPeriod(f)}</span>
          <span class="slide-meta-item">${TOPIC_EMOJI[f.dominant_macro]||'🎪'} ${TOPIC_LABEL[f.dominant_macro]||f.dominant_macro}</span>
        </div>
        <button class="slide-cta" onclick="openModal(${f.id})">자세히 보기
          <svg class="svg-icon icon-sm" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>`;
    slidesEl.appendChild(div);
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.onclick = ()=>slideGo(idx);
    dotsEl.appendChild(dot);
  });
  document.getElementById('slideTotal').textContent = heroFestivals.length + 1;
}
function slideGo(i){
  const slides = document.querySelectorAll('.slide');
  const dots = document.querySelectorAll('#dots .dot');
  slides[curSlide].classList.remove('active');
  dots[curSlide].classList.remove('active');
  curSlide = (i+slides.length)%slides.length;
  slides[curSlide].classList.add('active');
  dots[curSlide].classList.add('active');
  document.getElementById('slideIdx').textContent = curSlide+1;
}
function slideMove(d){slideGo(curSlide+d); resetSlideTimer();}
function resetSlideTimer(){
  clearInterval(slideTimer);
  slideTimer = setInterval(()=>slideGo(curSlide+1), 4000);
}
