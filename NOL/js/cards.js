// ====== CARD RENDER FUNCTIONS ======
function getEntropyStyle(entropy){
  if(entropy === undefined || entropy === null || isNaN(entropy)) return null;
  if(entropy < 0.8)  return {key:'focused',  label:'🎯 개성파', desc:'한 주제에 집중된 특색 있는 축제가 잘 맞아요'};
  if(entropy < 1.5)  return {key:'balanced', label:'⚖️ 균형형', desc:'여러 경험을 두루두루 즐길 수 있는 축제가 잘 맞아요'};
  return              {key:'diverse',  label:'🌈 만능형', desc:'뭐든 다 있어서 모두가 즐길 수 있는 축제가 잘 맞아요'};
}

function renderFullCard(f){
  const cs = computeStatus(f);
  const dday = cs.status==='upcoming'?(cs.d_start===0?'D-DAY':`D-${cs.d_start}`):(cs.status==='ongoing'?'진행중':'');
  const emoji = TOPIC_EMOJI[f.dominant_macro]||'🎪';
  const label = TOPIC_LABEL[f.dominant_macro]||f.dominant_macro;
  const bg = TOPIC_FALLBACK_BG[f.dominant_macro]||'var(--gradient-festival)';
  const imgAttr = f.img?`style="background-image:url('${f.img}')"`: `style="background:${bg}"`;
  const hotBadge = (f.visitors>=100000)?'<span class="fest-tag grade">🔥 HOT</span>':'';
  const styleInfo = getEntropyStyle(f.topic_entropy);
  const styleBadge = (styleInfo && styleInfo.key === 'diverse') ? `<div class="fest-style-row"><span class="fest-style-label">💎 복합축제</span><span class="fest-entropy-val">(다양성 지수 ${f.topic_entropy.toFixed(2)})</span></div>` : '';
  return `<div class="fest-card" onclick="openModal(${f.id})">
    <div class="fest-img" ${imgAttr}>
      ${f.img?'':'<div class="fest-img-fallback">'+emoji+'</div>'}
      <div class="fest-tags">
        ${cs.status==='ongoing'?'<span class="fest-tag live">진행중</span>':''}
        ${dday&&cs.status==='upcoming'?`<span class="fest-tag dday">${dday}</span>`:''}
        ${hotBadge}
      </div>
    </div>
    <div class="fest-info">
      <p class="fest-region">${regionLabel(f)}</p>
      <p class="fest-name">${f.name}</p>
      <p class="fest-period">${fmtPeriod(f)}</p>
      <div class="fest-meta-row">
        <span class="fest-topic">${emoji} ${label}</span>
      </div>
      ${styleBadge}
    </div>
  </div>`;
}

function renderTextCard(f){
  const cs = computeStatus(f);
  const dday = cs.status==='upcoming'?(cs.d_start===0?'D-DAY':`D-${cs.d_start}`):(cs.status==='ongoing'?'진행중':'');
  const emoji = TOPIC_EMOJI[f.dominant_macro]||'🎪';
  const label = TOPIC_LABEL[f.dominant_macro]||f.dominant_macro;
  const bg = TOPIC_FALLBACK_BG[f.dominant_macro]||'var(--gradient-festival)';
  return `<div class="fest-card" onclick="openModal(${f.id})">
    <div class="text-card-thumb" style="background:${bg};position:relative;">
      <span>${emoji}</span>
    </div>
    <div class="fest-info">
      <p class="fest-region">${regionLabel(f)}</p>
      <p class="fest-name">${f.name}</p>
      <p class="fest-period">${fmtPeriod(f)}</p>
      <div class="fest-meta-row">
        <span class="fest-topic">${emoji} ${label}</span>
        ${dday?`<span style="font-size:11px;color:var(--accent-pink);font-weight:700">${dday}</span>`:''}
      </div>
    </div>
  </div>`;
}

function renderMiniCard(f){
  const emoji = TOPIC_EMOJI[f.dominant_macro]||'🎪';
  const label = TOPIC_LABEL[f.dominant_macro]||f.dominant_macro;
  const bg = TOPIC_FALLBACK_BG[f.dominant_macro]||'var(--gradient-festival)';
  const cs = computeStatus(f);
  const dday = cs.status==='upcoming'?(cs.d_start===0?'D-DAY':`D-${cs.d_start}`):(cs.status==='ongoing'?'진행중':'');
  return `<div class="mini-card" onclick="openModal(${f.id})">
    <div class="mini-card-icon" style="background:${bg}">${emoji}</div>
    <div class="mini-card-body">
      <div class="mini-card-name">${f.name}</div>
      <div class="mini-card-meta">${fmtPeriod(f)}${dday?' · <span style="color:var(--accent-pink)">'+dday+'</span>':''}</div>
    </div>
    <span class="tier-badge mini" style="flex-shrink:0;align-self:center;margin-left:8px;max-width:70px;text-overflow:ellipsis;overflow:hidden;">${label}</span>
  </div>`;
}
