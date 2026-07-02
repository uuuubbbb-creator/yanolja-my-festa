// ====== CONSTANTS ======
// FESTIVALS 배열은 data/festivals.js 에서 이미 정의됨

const TOPIC_EMOJI = {
  'M1_자연계절':'🌿','M2_역사문화':'🏯','M3_먹거리특산물':'🍜',
  'M4_예술공연창작':'🎭','M5_가족체험':'👨‍👩‍👧','M6_청년마켓':'🎪','M7_과학레저':'🏄'
};
const TOPIC_LABEL = {
  'M1_자연계절':'자연·계절','M2_역사문화':'역사·문화','M3_먹거리특산물':'먹거리·특산물',
  'M4_예술공연창작':'예술·공연','M5_가족체험':'가족·체험','M6_청년마켓':'청년·마켓','M7_과학레저':'레저·스포츠'
};
// ── 오늘 날짜 + 실시간 상태 계산 (FESTIVALS 직후 선언) ──
const TODAY = (()=>{const t=new Date();return new Date(t.getFullYear(),t.getMonth(),t.getDate());})();

function computeStatus(f){
  if(!f.start) return {status:'unknown', d_start:9999, d_end:9999};
  const s = new Date(f.start);
  const e = new Date(f.end || f.start);
  const dStart = Math.round((s - TODAY) / 86400000);
  const dEnd   = Math.round((e - TODAY) / 86400000);
  let status;
  if(dEnd < 0)      status = 'ended';
  else if(dStart <= 0) status = 'ongoing';
  else              status = 'upcoming';
  return {status, d_start: dStart, d_end: dEnd};
}

const TOPIC_FALLBACK_BG = {
  'M1_자연계절':'linear-gradient(135deg,#065f46,#10b981)',
  'M2_역사문화':'linear-gradient(135deg,#581c87,#9333ea)',
  'M3_먹거리특산물':'linear-gradient(135deg,#92400e,#ea580c)',
  'M4_예술공연창작':'linear-gradient(135deg,#7c2d12,#dc2626)',
  'M5_가족체험':'linear-gradient(135deg,#0e7490,#06b6d4)',
  'M6_청년마켓':'linear-gradient(135deg,#713f12,#d97706)',
  'M7_과학레저':'linear-gradient(135deg,#1e3a5f,#3b82f6)'
};
