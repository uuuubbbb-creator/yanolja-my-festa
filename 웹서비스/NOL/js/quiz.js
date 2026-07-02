// ====== QUIZ ENGINE ======
function injectSparkles(){
  const wrap = document.getElementById('qzSparkles');
  if(!wrap) return;
  wrap.innerHTML = '';
  const icons = ['✦','★','✿','◈','❋','✺','⊛','✦'];
  const positions = [
    [8,15],[92,8],[5,60],[88,45],[15,85],[80,70],[50,5],[40,90],[70,25],[25,50]
  ];
  positions.forEach(([left,top],i)=>{
    const el = document.createElement('div');
    el.className='qz-sparkle';
    el.textContent = icons[i%icons.length];
    el.style.cssText = 'left:'+left+'%;top:'+top+'%;animation-delay:'+(i*0.9)+'s;color:rgba(255,'+(150+i*15)+','+(50+i*20)+',.5)';
    wrap.appendChild(el);
  });
}

let qzScores = [0,0,0,0,0,0,0];
let qzAnswers = [];
let qzCurrent = 0;

function initQuizListeners(){
  var btn = document.getElementById('qzStartBtn');
  if(btn) btn.addEventListener('click', function(){ showQuestion(0); });
}
async function startQuiz(){
  const quizPage = document.getElementById('page-quiz');
  // 퀴즈 페이지가 아직 활성화 안 된 경우 직접 lazy-load 후 전환
  if(quizPage && !quizPage.classList.contains('active')){
    if(!quizPage._loaded) await loadPageContent(quizPage);
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    quizPage.classList.add('active');
    const bc = document.getElementById('breadcrumbCurrent');
    if(bc) bc.textContent = 'MY FESTA › 유형 진단';
    const cta = document.getElementById('floatCta');
    if(cta) cta.style.display = 'none';
    history.pushState({page:'quiz'}, '', '#quiz');
  }
  resetQuiz();
  initQuizListeners();
  window.scrollTo({top:0,behavior:'smooth'});
}

function resetQuiz(){
  qzScores = [0,0,0,0,0,0,0];
  qzAnswers = [];
  qzCurrent = 0;
  document.getElementById('qzIntro').style.display = 'block';
  document.getElementById('qzQuestion').style.display = 'none';
  document.getElementById('qzLoading').style.display = 'none';
  updateProgress(0);
}

function showQuestion(idx){
  document.getElementById('qzIntro').style.display = 'none';
  document.getElementById('qzLoading').style.display = 'none';
  const qEl = document.getElementById('qzQuestion');
  qEl.style.display = 'block';
  qzCurrent = idx;
  updateProgress(idx);

  const q = QUESTIONS[idx];
  document.getElementById('qzQNum').textContent = '질문 ' + (idx+1) + ' / 7';
  document.getElementById('qzQText').textContent = q.text;

  const opts = document.getElementById('qzOptions');
  const nums = ['①','②','③','④'];
  opts.innerHTML = q.options.map((o,i)=>`
    <button class="qz-option" onclick="selectOption(${idx},${i},${o.topic})">
      <span class="qz-opt-num">${nums[i]}</span>
      <span>${o.text}</span>
    </button>
  `).join('');
}

const QUIZ_TOPIC_HINTS = [
  '❄️ 자연·계절 취향 +1',
  '🎵 감성·공연 취향 +1',
  '📚 역사·문화 취향 +1',
  '🌟 예술·창작 취향 +1',
  '🍖 먹거리·특산물 취향 +1',
  '🏯 가족·체험 취향 +1',
  '🏄 레저·스포츠 취향 +1',
];
function selectOption(qIdx, optIdx, topic){
  const opts = document.querySelectorAll('.qz-option');
  opts.forEach((o,i)=>{
    if(i===optIdx) o.classList.add('selected');
    else o.classList.add('fade-out');
  });
  qzScores[topic]++;
  qzAnswers[qIdx] = topic;

  const hintEl = document.getElementById('qzTopicHint');
  const hintText = document.getElementById('qzTopicHintText');
  if(hintEl && hintText){
    hintText.textContent = QUIZ_TOPIC_HINTS[topic] || '';
    hintEl.style.opacity = '1';
  }

  setTimeout(()=>{
    if(hintEl) hintEl.style.opacity = '0';
    if(qIdx < 6){
      showQuestion(qIdx+1);
    } else {
      showLoading();
    }
  }, 500);
}

function updateProgress(idx){
  const pct = Math.round((idx/7)*100);
  document.getElementById('qzProgressFill').style.width = pct + '%';
  if(idx===0){
    document.getElementById('qzProgressLabel').textContent = '여정 시작 전';
    document.getElementById('qzProgressPct').textContent = '';
  } else {
    document.getElementById('qzProgressLabel').textContent = idx + ' / 7 완료';
    document.getElementById('qzProgressPct').textContent = pct + '%';
  }
}

function showLoading(){
  document.getElementById('qzQuestion').style.display = 'none';
  document.getElementById('qzLoading').style.display = 'block';
  updateProgress(7);
  const steps = ['ls0','ls1','ls2','ls3'];
  steps.forEach(id=>document.getElementById(id).className='qz-loading-step');
  let s = 0;
  const tick = setInterval(()=>{
    if(s>0) { document.getElementById(steps[s-1]).className='qz-loading-step done'; }
    if(s<steps.length){
      document.getElementById(steps[s]).className='qz-loading-step active';
      s++;
    } else {
      clearInterval(tick);
      setTimeout(showResult, 600);
    }
  }, 700);
}

const TYPE_ENTROPY_PREF = ['focused','balanced','diverse','balanced','focused','focused','diverse'];

function renderTypeStyleMatch(top1){
  const pref = TYPE_ENTROPY_PREF[top1] || 'balanced';
  const INFO = {
    focused:  {label:'🎯 개성파', desc:'한 주제에 집중된 특색 있는 축제가 잘 맞아요', min:0,   max:0.8},
    balanced: {label:'⚖️ 균형형', desc:'여러 경험을 두루두루 즐길 수 있는 축제가 잘 맞아요', min:0.8, max:1.5},
    diverse:  {label:'🌈 만능형', desc:'뭐든 다 있어서 모두가 즐길 수 있는 축제가 잘 맞아요', min:1.5, max:999}
  };
  const si = INFO[pref];
  const lblEl = document.getElementById('trStyleLabel');
  const dscEl = document.getElementById('trStyleDesc');
  if(lblEl) lblEl.textContent = si.label;
  if(dscEl) dscEl.textContent = si.desc;

  const matched = [...FESTIVALS_FULL]
    .filter(f=>{
      const e = f.topic_entropy;
      return e!==undefined && e!==null && !isNaN(e) && e>=si.min && e<si.max && f.img;
    })
    .sort((a,b)=>b.visitors-a.visitors)
    .slice(0,3);

  const container = document.getElementById('trStyleCards');
  if(!container) return;
  container.innerHTML = '';
  matched.forEach(f=>{
    const emoji = TOPIC_EMOJI[f.dominant_macro]||'🎪';
    const bg = TOPIC_FALLBACK_BG[f.dominant_macro]||'var(--gradient-festival)';
    const div = document.createElement('div');
    div.className = 'tr-fest-card';
    div.onclick = ()=>openModal(f.id);
    div.innerHTML = `
      <div style="width:40px;height:40px;border-radius:10px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${emoji}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;color:#1e1b4b;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${f.name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${regionLabel(f)} · ${fmtPeriod(f)}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:3px;">다양성 지수 ${f.topic_entropy.toFixed(2)}</div>
      </div>`;
    container.appendChild(div);
  });
}

const TIEBREAK_ORDER = [3, 6, 0, 2, 4, 1, 5];

function resolveTop2(scores, answers) {
  const ranked = scores.map((v, i) => ({ score: v, topic: i }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      for (const qi of TIEBREAK_ORDER) {
        const t = answers[qi];
        if (t === a.topic) return -1;
        if (t === b.topic) return 1;
      }
      return a.topic - b.topic;
    });
  return [ranked[0].topic, ranked[1].topic];
}

async function showResult() {
  const [top1, top2] = resolveTop2(qzScores, qzAnswers);
  window.quizTop1 = top1;
  const key = [Math.min(top1,top2), Math.max(top1,top2)].join(',');
  const typeName = TYPE_MAP[key] || '조선디제이';
  const typeData = TYPE_DATA[typeName] || TYPE_DATA['조선디제이'];

  await goPage('type-result');
  renderTypeResult(typeName, typeData, qzScores, [top1, top2]);
  renderTypeStyleMatch(top1);
}

function renderTypeResult(typeName, typeData, scores, topTopics) {
  const imgEl = document.getElementById('trCharImg');
  const nameEl = document.getElementById('trTypeName');
  const tagEl = document.getElementById('trTypeTagline');
  const comboEl = document.getElementById('trComboBadge');
  if (imgEl) { imgEl.src = typeData.img; imgEl.alt = typeName; }
  if (nameEl) nameEl.textContent = typeName;
  if (tagEl) tagEl.textContent = `"${typeData.tagline}"`;
  if (comboEl) comboEl.textContent = `${TOPIC_LABELS[topTopics[0]]} × ${TOPIC_LABELS[topTopics[1]]}`;

  const GAUGE_META = [
    { emoji:'❄️', label:'엘사력',  color:'#60a5fa' },
    { emoji:'🎵', label:'감성력',  color:'#818cf8' },
    { emoji:'📚', label:'범생력',  color:'#a78bfa' },
    { emoji:'🌟', label:'스타력',  color:'#fbbf24' },
    { emoji:'🍖', label:'꿀꿀력',  color:'#34d399' },
    { emoji:'🏯', label:'유교력',  color:'#c084fc' },
    { emoji:'🏄', label:'청량력',  color:'#38bdf8' },
  ];
  const gaugeEl = document.getElementById('trGaugeGrid');
  if (gaugeEl) {
    gaugeEl.innerHTML = GAUGE_META.map((m, i) => {
      const val = scores[i] || 0;
      const pct = (val / 4) * 100;
      const isTop = topTopics.includes(i);
      return `<div class="tr-gauge-row${isTop?' highlight':''}">
        <span class="tr-gauge-emoji">${m.emoji}</span>
        <div class="tr-gauge-label">${m.label}</div>
        <div class="tr-gauge-bar"><div class="tr-gauge-fill" style="width:${pct}%;background:${isTop?`linear-gradient(90deg,${m.color},${m.color}cc)`:m.color}"></div></div>
        <div class="tr-gauge-val" style="width:28px;font-size:11px;">${val}/4</div>
      </div>`;
    }).join('');
  }

  const t1 = topTopics[0], t2 = topTopics[1];
  const scored = [...FESTIVALS_FULL].map(f => {
    const bs = BERT_SCORES[String(f.id)];
    if (!bs) return { f, s: 0 };
    const s = bs[t1] + bs[t2];
    return { f, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.f.visitors - a.f.visitors);
  const top30 = scored.slice(0, 30);
  const picks = top30.sort(() => Math.random() - 0.5).slice(0, 4);

  const festContainer = document.getElementById('trFestCards');
  if (festContainer) {
    festContainer.innerHTML = picks.map(({ f }) => {
      const emoji = TOPIC_EMOJI[f.dominant_macro] || '🎪';
      const bg = TOPIC_FALLBACK_BG[f.dominant_macro] || 'var(--gradient-festival)';
      return `<div class="tr-fest-card" onclick="openModal(${f.id})">
        <div style="width:44px;height:44px;border-radius:12px;overflow:hidden;flex-shrink:0;background:${bg};display:flex;align-items:center;justify-content:center;font-size:22px;" ${f.img?`style="background-image:url('${f.img}');background-size:cover;"`:''}>${f.img?'':emoji}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:800;color:#1e1b4b;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${f.name}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${regionLabel(f)} · ${fmtPeriod(f)}</div>
        </div>
      </div>`;
    }).join('');
  }
}

function showExploreSection(){
  if(!window._exploreInited){
    window._exploreInited = true;
    renderRegionFilter();
    document.querySelectorAll('#exploreThemePanel .theme-card').forEach(card=>{
      card.addEventListener('click', (e)=>{
        e.preventDefault();
        document.querySelectorAll('#exploreThemePanel .theme-card').forEach(c=>c.classList.remove('active'));
        card.classList.add('active');
        curTopic = card.dataset.topic;
        curPage = 1;
        document.getElementById('exploreStatusSection').style.display = '';
        renderCardGrid();
      });
    });
  }
  selectFindMode('taste');
  setTimeout(()=>{
    const anchor = document.getElementById('exploreAnchor');
    if(anchor) anchor.scrollIntoView({behavior:'smooth'});
  }, 80);
}
