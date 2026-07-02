// ====================================================================
// 추천 엔진 (v4)
// ====================================================================

// -- 코사인 유사도 --
function cosine(a, b) {
  let dot=0, na=0, nb=0;
  for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]**2; nb+=b[i]**2; }
  return (na&&nb) ? dot/(Math.sqrt(na)*Math.sqrt(nb)) : 0;
}
function getVec(f) {
  return [
    f.M1_자연계절||0, f.M2_역사문화||0, f.M3_먹거리특산물||0,
    f.M4_예술공연창작||0, f.M5_가족체험||0, f.M6_청년마켓||0, f.M7_과학레저||0
  ];
}

// -- Engine 1: 퀴즈 벡터 매칭 --
function getQuizRecs(quizVec, topN=30) {
  return [...FESTIVALS]
    .map(f => ({ f, score: cosine(quizVec, getVec(f)) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, topN)
    .map(({f, score}) => ({ ...f, matchPct: Math.round(score*100) }));
}

// -- Engine 2: 시즌 가중치 매칭 --
const SEASON_WEIGHTS = {
  1:[0.4,0.1,0.1,0.2,0.05,0.05,0.1],  2:[0.35,0.1,0.15,0.15,0.05,0.05,0.15],
  3:[0.4,0.1,0.1,0.2,0.1,0.05,0.05],  4:[0.35,0.05,0.1,0.3,0.1,0.05,0.05],
  5:[0.3,0.1,0.1,0.25,0.05,0.1,0.1],  6:[0.1,0.05,0.15,0.1,0.1,0.1,0.4],
  7:[0.05,0.05,0.2,0.1,0.1,0.1,0.4],  8:[0.05,0.1,0.2,0.15,0.1,0.1,0.3],
  9:[0.15,0.15,0.2,0.2,0.05,0.1,0.15],10:[0.1,0.25,0.2,0.2,0.05,0.1,0.1],
  11:[0.1,0.3,0.15,0.2,0.05,0.1,0.1], 12:[0.3,0.05,0.1,0.3,0.05,0.05,0.15]
};
const SEASON_TITLE = {
  5:'🌿 5월 가기 좋은 축제', 6:'🌊 6월 여름 축제', 10:'🍂 가을 문화 축제',
  12:'✨ 겨울 빛 축제'
};
function getSeasonRecs(month, topN=6) {
  const w = SEASON_WEIGHTS[month] || SEASON_WEIGHTS[5];
  return [...FESTIVALS_FULL]
    .filter(f => { const cs=computeStatus(f); return cs.status!=='ended'; })
    .map(f => ({ f, score: cosine(w, getVec(f)) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, topN)
    .map(({f, score}) => ({ ...f, matchPct: Math.round(score*100) }));
}

function getReasonTag(f, month) {
  const topicLabels = {
    'M1_자연계절':'자연 1위', 'M2_역사문화':'역사 1위',
    'M3_먹거리특산물':'미식 추천', 'M4_예술공연창작':'공연 1위',
    'M5_가족체험':'가족 추천', 'M6_청년마켓':'마켓 추천', 'M7_과학레저':'레저 추천'
  };
  if (f.visitors >= 500000) return '👥 전국 방문객 TOP';
  if (f.topic_entropy > 1.7) return '💎 복합 축제';
  return `${TOPIC_EMOJI[f.dominant_macro]||'🎪'} ${topicLabels[f.dominant_macro]||'이달 추천'}`;
}

// -- Engine 3: 로컬 보석 (고엔트로피 + 소규모) --
function getGemRecs(topN=4) {
  return [...FESTIVALS_FULL]
    .filter(f => f.topic_entropy > 1.5 && f.visitors < 150000 && f.visitors > 0)
    .sort((a,b) => (b.topic_entropy - a.topic_entropy) || (a.visitors - b.visitors))
    .slice(0, topN);
}

// -- 시즌 추천 렌더링 --
function renderSeasonRecs() {
  const month = TODAY.getMonth() + 1;
  const title = SEASON_TITLE[month] || `🌿 ${month}월 가기 좋은 축제`;
  const titleEl = document.getElementById('seasonRecTitle');
  if(titleEl) titleEl.textContent = title;

  const recs = getSeasonRecs(month, 10);
  const container = document.getElementById('seasonRecScroll');
  if(!container) return;
  container.innerHTML = '';
  recs.forEach(f => {
    const reasonTag = getReasonTag(f, month);
    const tmp = document.createElement('div');
    tmp.innerHTML = renderFullCard(f);
    const card = tmp.firstElementChild;
    if(!card) return;
    const info = card.querySelector('.fest-info');
    if(info) {
      const badge = document.createElement('div');
      badge.style.cssText = 'font-size:11px;font-weight:700;color:var(--blue);background:var(--blue-50);display:inline-flex;align-items:center;padding:3px 8px;border-radius:100px;margin-bottom:6px;';
      badge.textContent = reasonTag;
      info.insertBefore(badge, info.firstChild);
    }
    container.appendChild(card);
  });
}

// -- 로컬 보석 렌더링 --
function renderGemRecs() {
  const gems = getGemRecs(4);
  const container = document.getElementById('gemCards');
  if(!container) return;
  container.innerHTML = '';
  gems.forEach(f => {
    const emoji = TOPIC_EMOJI[f.dominant_macro]||'🎪';
    const label = TOPIC_LABEL[f.dominant_macro]||f.dominant_macro;
    const bg = TOPIC_FALLBACK_BG[f.dominant_macro]||'var(--gradient-festival)';
    const div = document.createElement('div');
    div.className = 'gem-card';
    div.onclick = ()=>openModal(f.id);
    div.innerHTML = `
      <div style="width:44px;height:44px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">${emoji}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;">${f.name}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);margin-bottom:4px;">${regionLabel(f)||label} · ${fmtPeriod(f)}</div>
        <span class="gem-entropy-badge">${(getEntropyStyle(f.topic_entropy)||{label:''}).label}</span>
        <span style="font-size:10px;color:rgba(255,255,255,.3);font-weight:500;"> 다양성 지수 ${f.topic_entropy.toFixed(2)} · 방문 ${(f.visitors||0).toLocaleString()}명</span>
      </div>`;
    container.appendChild(div);
  });
}
