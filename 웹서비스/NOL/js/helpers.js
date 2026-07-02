// ====== HELPERS ======
function fmtDate(s){if(!s)return'';const d=new Date(s);return `${d.getMonth()+1}.${d.getDate()}`}
function fmtPeriod(f){
  if(!f.start)return '';
  const s=new Date(f.start), e=f.end?new Date(f.end):s;
  if(s.getTime()===e.getTime()) return `${s.getFullYear()}.${s.getMonth()+1}.${s.getDate()}`;
  if(s.getFullYear()===e.getFullYear()){
    return `${s.getFullYear()}.${s.getMonth()+1}.${s.getDate()} — ${e.getMonth()+1}.${e.getDate()}`;
  }
  return `${s.getFullYear()}.${s.getMonth()+1}.${s.getDate()} — ${e.getFullYear()}.${e.getMonth()+1}.${e.getDate()}`;
}
function getDDay(f){
  const cs = computeStatus(f);
  if(cs.status==='ongoing'){
    if(cs.d_end<=7) return `D-${cs.d_end} 종료`;
    return '진행중';
  }
  if(cs.status==='upcoming'){
    if(cs.d_start===0) return 'D-DAY';
    return `D-${cs.d_start}`;
  }
  return '';
}
function regionLabel(f){
  return [f.sido_clean, f.sigungu].filter(Boolean).join(' ');
}
function imgStyle(f){
  if(f.img) return `background-image:url('${f.img}')`;
  return `background:${TOPIC_FALLBACK_BG[f.dominant_macro]||'var(--gradient-festival)'}`;
}

// ====== STATS ======
function renderStats(){
  document.getElementById('statTotal').textContent = FESTIVALS.length.toLocaleString();
  const regions = new Set(FESTIVALS.map(f=>f.sido_clean).filter(Boolean));
  document.getElementById('statRegions').textContent = regions.size;
  const ongoing = FESTIVALS.filter(f=>computeStatus(f).status==='ongoing').length;
  document.getElementById('statOngoing').textContent = ongoing;
  const soon = FESTIVALS.filter(f=>{const cs=computeStatus(f);return cs.status==='upcoming'&&cs.d_start<=30;}).length;
  document.getElementById('statSoon').textContent = soon;
}
