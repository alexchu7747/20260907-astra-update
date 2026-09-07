/* Learning workflow enhancements; preserves the existing v2 storage schema. */
(() => {
  'use strict';
  const DAY = 86400000;
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  let reviewQueue = [], reviewIndex = 0, reviewRevealed = false, reviewCount = 0;
  let recallRevealed = false, draftTimer;
  state.activity ||= {};
  state.reader ||= { title:'', source:'', text:'', segments:[], activeIndex:0, stage:'skim' };
  const dueItems = () => state.corpus.filter(item => !item.review?.due || item.review.due <= Date.now());
  const go = view => document.querySelector(`nav [data-view="${view}"]`).click();

  window.persistReader = function () {
    if (window.studyDataCleared) return;
    state.reader = { title: $('articleTitle').value, source: $('articleSource').value, text: $('articleInput').value,
      segments: readSegments.map(s => ({...s})), activeIndex: activeReadIndex, stage: readStage, articleId: state.reader?.articleId || '' };
    saveState(false);
  };
  const savedReader = state.reader;
  $('articleTitle').value = savedReader.title || '';
  $('articleSource').value = savedReader.source || '';
  $('articleInput').value = savedReader.text || '';
  readSegments = Array.isArray(savedReader.segments) ? savedReader.segments : [];
  activeReadIndex = Number(savedReader.activeIndex) || 0;
  readStage = ['skim','analyze','recall'].includes(savedReader.stage) ? savedReader.stage : 'skim';

  function recordPractice() {
    const day = localDay();
    state.activity[day] = (Number(state.activity[day]) || 0) + 1;
    saveState(false);
    renderSummary();
  }
  function renderSummary() {
    const due = dueItems().length;
    $('reviewBadge').textContent = due;
    $('dueCount').textContent = due;
    const done = state.subtitles.filter(s => s.done).length;
    $('listenProgressText').textContent = state.subtitles.length ? `${done} / ${state.subtitles.length} 句已完成` : '导入字幕后开始';
    $('listenProgress').max = Math.max(1,state.subtitles.length);
    $('listenProgress').value = done;
    $('sessionSummary').textContent = state.activity[localDay()] ? `今天已完成 ${state.activity[localDay()]} 次练习` : '每天一句，离流利更近一点';
    $('sessionHint').textContent = due ? `${due} 条语料等待复习` : '精听 → 精读 → 回忆，让表达留下来。';
    $('reviewStats').innerHTML = `<div><b>${due}</b><span>待复习</span></div><div><b>${state.corpus.filter(i => (i.review?.interval || 0) >= 7).length}</b><span>已巩固</span></div>`;
  }
  const originalRenderAll = renderAll;
  renderAll = function () { originalRenderAll(); renderSummary(); renderShelf(); };
  const originalRenderSentences = renderSentences;
  renderSentences = function () {
    // Playback highlighting must not destroy an active dictation/note edit.
    if ($('sentenceList').contains(document.activeElement) && document.activeElement.matches('textarea')) {
      document.querySelectorAll('[data-sentence]').forEach(el => el.classList.toggle('active',el.dataset.sentence === activeSentenceId));
      renderSummary(); return;
    }
    originalRenderSentences();
    document.querySelectorAll('.sentence-note-fields').forEach(fields => {
      const id = fields.querySelector('[data-dictation]').dataset.dictation;
      const button = document.createElement('button');
      button.textContent = '检查听写'; button.dataset.checkDictation = id;
      fields.appendChild(button);
      const result = document.createElement('div'); result.className='dictation-result'; result.dataset.dictationResult=id; result.setAttribute('aria-live','polite'); fields.appendChild(result);
    });
    renderSummary();
  };
  const words = text => (String(text).normalize('NFC').toLocaleLowerCase('pt').match(/[\p{L}\p{N}]+/gu) || []);
  window.compareDictation = function (expected, actual) {
    const a = words(expected), b = words(actual);
    // LCS keeps the comparison aligned when a learner misses a word.
    if (a.length > 500 || b.length > 500) throw new Error('请逐句检查，单次最多 500 个词。');
    const dp = Array.from({length:a.length+1}, () => new Uint16Array(b.length+1));
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j],dp[i][j-1]);
    let i=a.length,j=b.length; const matched=new Set();
    while(i&&j) { if(a[i-1]===b[j-1]) {matched.add(--i);j--;} else if(dp[i-1][j]>=dp[i][j-1]) i--; else j--; }
    return {score: Math.round(100 * (2*matched.size) / Math.max(1,a.length+b.length)), expected:a, matched};
  };
  $('sentenceList').addEventListener('click', event => {
    const id = event.target.dataset.checkDictation;
    if(id) {
      const sentence = getSentence(id);
      if(!sentence?.dictation?.trim()) return showToast('先写下你听到的内容，再检查。');
      try {
        const result=window.compareDictation(sentence.pt,sentence.dictation);
        const output = [...document.querySelectorAll('[data-dictation-result]')].find(el=>el.dataset.dictationResult===id);
        output.innerHTML = `<strong>词语匹配 ${result.score}%</strong><br>${result.expected.map((word,i)=>result.matched.has(i)?escapeHtml(word):`<mark>${escapeHtml(word)}</mark>`).join(' ')}<br><span class="small">黄色为漏写或不同的词。忽略大小写和标点，保留重音差异；此结果不评价发音。</span>`;
        recordPractice();
      } catch(error) { showToast(error.message); }
    }
    if(event.target.dataset.done && getSentence(event.target.dataset.done)?.done) recordPractice();
  });

  function renderShelf() {
    $('articleShelf').innerHTML = state.articles.length ? state.articles.map(article=>`<button class="shelf-card" data-open-article="${escapeHtml(article.id)}"><strong>${escapeHtml(article.title||'未命名文章')}</strong><span>${escapeHtml(article.source||'我的文章')} · ${words(article.text).length} 词</span><span>继续阅读 →</span></button>`).join('') : '<div class="shelf-empty">粘贴文章并保存后，会在这里保留。当前阅读草稿和段落笔记会自动保存。</div>';
  }
  window.saveCurrentArticle = function () {
    if(!$('articleInput').value.trim()) return showToast('请先粘贴文章内容。');
    persistReader();
    const existing = state.articles.find(article=>article.id===state.reader.articleId);
    const article = { id:existing?.id||uid(), title:$('articleTitle').value.trim()||'未命名文章', source:$('articleSource').value.trim(), text:$('articleInput').value.trim(), segments:readSegments.map(s=>({...s})), activeIndex:activeReadIndex, createdAt:existing?.createdAt||new Date().toISOString() };
    if(existing) Object.assign(existing,article); else state.articles.unshift(article);
    state.reader.articleId=article.id; saveState(); showToast(existing?'文章已更新':'文章已保存，可在上方继续阅读。');
  };
  function saveLinkedArticle() {
    if (window.studyDataCleared) return;
    persistReader();
    const article=state.articles.find(a=>a.id===state.reader.articleId);
    if(article) { Object.assign(article,{title:state.reader.title,source:state.reader.source,text:state.reader.text,segments:state.reader.segments,activeIndex:activeReadIndex}); saveState(false); }
  }
  $('articleShelf').addEventListener('click',event=> {
    const button=event.target.closest('[data-open-article]'); if(!button)return;
    const article=state.articles.find(a=>a.id===button.dataset.openArticle); if(!article)return;
    saveLinkedArticle();
    if(state.reader.text.trim() && !state.reader.articleId && !confirm('打开文章将替换当前未收入文章架的草稿。继续吗？')) return;
    $('articleTitle').value=article.title; $('articleSource').value=article.source||''; $('articleInput').value=article.text;
    readSegments=Array.isArray(article.segments)?article.segments.map(s=>({...s})):[]; activeReadIndex=article.activeIndex||0; readStage='skim';state.reader.articleId=article.id;
    renderArticle();persistReader();startReadSession();
  });
  $('newArticleBtn').addEventListener('click',()=> {
    saveLinkedArticle();
    if(state.reader.text.trim()&&!state.reader.articleId&&!confirm('新建会清除当前草稿。建议先保存到文章架，仍要继续吗？'))return;
    if(readImmersive)exitReadSession();
    ['articleTitle','articleSource','articleInput'].forEach(id=>$(id).value='');
    state.reader.articleId='';readSegments=[];activeReadIndex=0;readStage='skim';renderArticle();persistReader();$('articleTitle').focus();
  });
  ['articleTitle','articleSource','articleInput','readUnitNote'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(draftTimer);draftTimer=setTimeout(saveLinkedArticle,350);}));
  $('articleFile').addEventListener('change',()=>setTimeout(saveLinkedArticle,200));
  window.addEventListener('pagehide',saveLinkedArticle);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveLinkedArticle();});
  const originalWorkspace=renderReadWorkspace;
  renderReadWorkspace = function () {
    originalWorkspace();
    $('prevReadUnitBtn').disabled = activeReadIndex<=0;
    $('nextReadUnitBtn').disabled = activeReadIndex>=readSegments.length-1;
    $('markUnitDoneBtn').textContent = readSegments[activeReadIndex]?.done?'✓ 已完成':'完成本段';
    $('markUnitHardBtn').textContent = readSegments[activeReadIndex]?.hard?'取消难点':'标记难点';
    $('markUnitDoneBtn').setAttribute('aria-pressed',String(!!readSegments[activeReadIndex]?.done));
    $('markUnitHardBtn').setAttribute('aria-pressed',String(!!readSegments[activeReadIndex]?.hard));
    if(readStage==='recall' && readSegments.length) {
      const active=readSegments[activeReadIndex];
      $('articleView').classList.add('hidden');
      $('activeReadUnit').innerHTML=`<div class="small">回忆 · 第 ${activeReadIndex+1} 段</div><div class="recall-cover"><p>不看原文，用葡语复述这一段。</p><textarea id="recallInput" aria-label="本段复述" placeholder="写下你记得的表达…">${escapeHtml(active.recall||'')}</textarea><button id="revealRecallBtn" class="primary">${recallRevealed?'隐藏原文':'对照原文'}</button>${recallRevealed?`<div class="recall-answer" lang="pt">${tokenize(active.text)}</div>`:''}</div>`;
    } else $('articleView').classList.remove('hidden');
    persistReader();
  };
  const originalSetStage=setReadStage;
  setReadStage=function(stage){recallRevealed=false;originalSetStage(stage);};
  const originalSetIndex=setActiveReadIndex;
  setActiveReadIndex=function(index,behavior){recallRevealed=false;originalSetIndex(index,behavior);};
  $('activeReadUnit').addEventListener('click',event=>{if(event.target.id==='revealRecallBtn'){recallRevealed=!recallRevealed;renderReadWorkspace();}});
  $('activeReadUnit').addEventListener('input',event=>{if(event.target.id==='recallInput'){readSegments[activeReadIndex].recall=event.target.value;persistReader();}});
  $('markUnitDoneBtn').addEventListener('click',()=>{if(readSegments[activeReadIndex]?.done)recordPractice();saveLinkedArticle();});
  $('markUnitHardBtn').addEventListener('click',saveLinkedArticle);
  const selectionTools=document.createElement('div');selectionTools.className='row-actions';
  for(const [target,label] of [['translateSelectionBtn','翻译选中'],['aiExplainSelectionBtn','AI 解释'],['saveSelectionBtn','收藏选中']]) {
    const button=document.createElement('button');button.textContent=label;button.addEventListener('click',()=>$(target).click());selectionTools.appendChild(button);
  }
  document.querySelector('.read-tools .tool-block').appendChild(selectionTools);
  ['hidePt','hideZh'].forEach(id=>$(id).addEventListener('change',()=>renderSentences()));

  window.scheduleReview = function(previous,grade,now=Date.now()) {
    const old=Number(previous?.interval)||0;
    const interval=grade==='again'?0:grade==='hard'?1:old?Math.min(90,Math.max(3,Math.round(old*2.2))):3;
    return { interval, due:now+(grade==='again'?10*60000:interval*DAY), count:(previous?.count||0)+1, lastReviewed:now };
  };
  function startReview() {reviewQueue=dueItems().map(i=>i.id);reviewIndex=0;reviewCount=0;reviewRevealed=false;renderReview();}
  function renderReview() {
    renderSummary();
    const item=state.corpus.find(i=>i.id===reviewQueue[reviewIndex]);
    if(!item) {
      $('reviewWorkspace').innerHTML=`<div class="review-card review-complete"><div class="eyebrow">${reviewCount?'MUITO BEM':'TUDO EM DIA'}</div><h2>${reviewCount?'这一轮，完成了。':state.corpus.length?'今天的复习已就绪':'从第一条语料开始'}</h2><p>${reviewCount?`本轮复习了 ${reviewCount} 条。下次打开时，到期内容会自动出现。`:state.corpus.length?'暂时没有到期语料，去读一段或听一句吧。':'在精听或精读中保存一个单词、一句话，就能在这里练习回忆。'}</p><div class="row-actions"><button data-review-action="listen" class="primary">去精听</button><button data-review-action="read">去精读</button><button data-review-action="refresh">检查到期语料</button></div></div>`;return;
    }
    $('reviewWorkspace').innerHTML=`<div class="review-card"><div class="shelf-heading"><span class="eyebrow">${reviewIndex+1} / ${reviewQueue.length} · ${escapeHtml(item.type||'语料')}</span><span class="chip">${item.review?'再次巩固':'新语料'}</span></div><div class="review-term" lang="pt">${escapeHtml(item.term)}</div>${reviewRevealed?`<div class="review-answer">${escapeHtml(item.meaning||'这条语料还没有释义，可以结合上下文回忆。')}</div><div class="review-context">${escapeHtml(item.context||item.source||'')}</div><div class="row-actions"><button data-grade="again">再练 · 10 分钟</button><button data-grade="hard">模糊 · 1 天</button><button data-grade="good" class="primary">记住 · ${window.scheduleReview(item.review,'good').interval} 天</button></div>`:'<div class="small">先想一想：它是什么意思？你会在什么时候用？</div><button class="primary" data-review-action="reveal">翻开答案</button>'}</div>`;
  }
  $('reviewWorkspace').addEventListener('click',event=> {
    const action=event.target.dataset.reviewAction;
    if(action==='reveal'){reviewRevealed=true;renderReview();}
    if(action==='listen'||action==='read')go(action);
    if(action==='refresh')startReview();
    const grade=event.target.dataset.grade;
    if(grade&&reviewRevealed){const item=state.corpus.find(i=>i.id===reviewQueue[reviewIndex]);if(!item)return;item.review=window.scheduleReview(item.review,grade);reviewIndex++;reviewCount++;reviewRevealed=false;recordPractice();renderReview();}
  });
  $('quickReviewBtn').addEventListener('click',()=>go('review'));
  document.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=> {
    stopTts(false);saveLinkedArticle();
    document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b===button?'page':'false'));
    if(button.dataset.view==='review')startReview();
    renderSummary();
  }));
  document.addEventListener('keydown',event=> {
    if(!$('review').classList.contains('active')||event.metaKey||event.ctrlKey||event.altKey||document.activeElement.matches('input,textarea,select,[contenteditable]'))return;
    if(event.code==='Space'&&!document.activeElement.matches('button')){event.preventDefault();$('reviewWorkspace').querySelector('[data-review-action="reveal"]')?.click();}
    const grade={'1':'again','2':'hard','3':'good'}[event.key];if(grade)$('reviewWorkspace').querySelector(`[data-grade="${grade}"]`)?.click();
  });

  window.showCorpusContext = function(id) {
    const item=state.corpus.find(i=>i.id===id);if(!item)return;
    $('contextBody').innerHTML=`<h3 lang="pt">${escapeHtml(item.term)}</h3><p>${escapeHtml(item.meaning||'未添加释义')}</p><blockquote>${escapeHtml(item.context||'这条语料没有保存上下文。')}</blockquote><p class="small">来源：${escapeHtml(item.source||'手动收藏')}${item.time!=null?' · '+formatTime(item.time):''}</p>`;
    $('contextDialog').showModal();
  };
  $('closeContextBtn').addEventListener('click',()=>$('contextDialog').close());
  $('contextDialog').addEventListener('click',event=>{if(event.target===$('contextDialog')){const rect=$('contextDialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('contextDialog').close();}});

  window.validateStudyBackup = function(data) {
    if(!data||typeof data!=='object'||!Array.isArray(data.corpus)||!Array.isArray(data.articles)||!Array.isArray(data.subtitles))throw new Error('请选择此应用导出的 JSON 备份。');
    for(const [key,fields] of [['corpus',['term']],['articles',['text']],['subtitles',['pt']]]) {
      if(data[key].length>30000)throw new Error('备份内容过多，请分批恢复。');
      for(const item of data[key])if(!item||typeof item.id!=='string'||!/^[\w-]{1,100}$/.test(item.id)||fields.some(field=>typeof item[field]!=='string'))throw new Error('备份中存在格式不正确的学习内容。');
    }
    return data;
  };
  $('restoreBtn').addEventListener('click',()=>$('restoreFile').click());
  $('restoreFile').addEventListener('change',async event=> {
    const file=event.target.files[0];if(!file)return;
    try {
      if(file.size>20*1024*1024)throw new Error('备份文件超过 20 MB，请选择较小的备份。');
      const incoming=window.validateStudyBackup(JSON.parse(await file.text()));
      if(!confirm(`恢复 ${incoming.articles.length} 篇文章、${incoming.corpus.length} 条语料及 ${incoming.subtitles.length} 句字幕？文章和语料将合并，同 ID 的本机内容保留；字幕仅在本机为空时恢复。`))return;
      for(const key of ['articles','corpus']) {const ids=new Set(state[key].map(i=>i.id));for(const item of incoming[key])if(!ids.has(item.id)){state[key].push(item);ids.add(item.id);}}
      if(!state.subtitles.length)state.subtitles=incoming.subtitles;
      if(!state.reader.text&&typeof incoming.reader?.text==='string') {
        state.reader={...incoming.reader};$('articleTitle').value=state.reader.title||'';$('articleSource').value=state.reader.source||'';$('articleInput').value=state.reader.text;
        readSegments=Array.isArray(state.reader.segments)?state.reader.segments:[];activeReadIndex=state.reader.activeIndex||0;renderArticle();
      }
      saveState();showToast('学习内容已恢复，当前设备设置保持不变。');
    } catch(error){showToast(error instanceof SyntaxError?'无法读取，请选择有效的 JSON 备份。':error.message);}
    finally{event.target.value='';}
  });
  $('speedSelect').setAttribute('aria-label','播放速度');
  $('corpusSearch').setAttribute('aria-label','搜索语料');
  $('articleFile').setAttribute('aria-label','导入文章文本文件');
  $('syncLeadRange').setAttribute('aria-label','字幕提前量');
  $('playPauseBtn').title='播放 / 暂停（空格）';$('prevSentenceBtn').title='上一句（←）';$('nextSentenceBtn').title='下一句（→）';$('loopSentenceBtn').title='单句循环（L）';
  renderArticle();renderAll();startReview();
})();
