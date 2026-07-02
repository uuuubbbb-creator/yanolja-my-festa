// ====== MODAL ======
function openModal(id){
  const f = FESTIVALS.find(x=>x.id===id);
  if(!f) return;
  document.getElementById('modalImg').style.cssText = imgStyle(f);
  document.getElementById('modalRegion').textContent = '📍 '+regionLabel(f);
  document.getElementById('modalTitle').textContent = f.name;

  const periodEl = document.getElementById('modalPeriod');
  periodEl.innerHTML = `📅 ${fmtPeriod(f)}`;
  if(getDDay(f)){
    periodEl.innerHTML += ` <span class="dot"></span> <span style="color:var(--accent-pink);font-weight:800">${getDDay(f)}</span>`;
  }

  const tags = [
    `<span class="modal-tag">${TOPIC_EMOJI[f.dominant_macro]||'🎪'} ${TOPIC_LABEL[f.dominant_macro]||f.dominant_macro}</span>`,
  ];

  document.getElementById('modalTags').innerHTML = tags.join('');

  const rawDesc = f.desc ? f.desc.trim() : '';
  document.getElementById('modalOverview').textContent = rawDesc
    ? (/[.!?。]$/.test(rawDesc) ? rawDesc : rawDesc + '…')
    : '상세 설명이 준비 중입니다.';
  document.getElementById('modalBg').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(e){
  if(e && e.target.id!=='modalBg' && !e.currentTarget) return;
  document.getElementById('modalBg').classList.remove('show');
  document.body.style.overflow = '';
}
