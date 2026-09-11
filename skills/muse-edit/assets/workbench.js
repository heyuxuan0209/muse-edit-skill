const boot=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(document.getElementById('muse-data').textContent.trim()),c=>c.charCodeAt(0))));
const originalPackage=clone(boot.package);
let current=clone(originalPackage),lastHtml='',saveTimer,toastTimer,confirmed=false;
const $=id=>document.getElementById(id);
const storageKey=()=>`muse-edit:1:${location.pathname}:${originalPackage.courseMeta.id}:${boot.buildId}`;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4200)}
function download(name,content,type='text/plain;charset=utf-8'){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function persist(){
  clearTimeout(saveTimer);
  const r=validate(current);if(!r.valid){$('saveStatus').textContent='有错误，尚未保存';return false}
  try{localStorage.setItem(storageKey(),JSON.stringify({package:current,confirmed,savedAt:new Date().toISOString()}));$('saveStatus').textContent='已保存到当前浏览器';return true}
  catch{$('saveStatus').textContent='浏览器保存失败，请导出配置';return false}
}
function changed(){confirmed=false;$('confirm').textContent='确认阅读层';$('saveStatus').textContent='修改待保存…';renderPreview();clearTimeout(saveTimer);saveTimer=setTimeout(persist,350)}
function enabledRules(){return [...(current.components.quote.enabled?current.editorialRules:[]),...(current.customEditorialRules||[])]}
function renderPreview(){
  const report=validate(current);
  $('validation').className='status'+(!report.valid?' error':report.warnings.length?' warning':'');
  $('validation').textContent=report.valid?(report.warnings.length?'结构检查通过；'+report.warnings.join('；'):'结构检查通过。发布前仍需检查公众号手机预览。'):report.errors.join('；');
  for(const id of ['copyBody','downloadHtml','exportButton','confirm'])$(id).disabled=!report.valid;
  $('sourceText').textContent=current.transcriptMarkdown;
  $('sourceMeta').textContent=`${current.courseMeta.sourceFilename} · ${current.transcriptMarkdown.length.toLocaleString()} 字符`;
  $('series').textContent=current.courseMeta.series+' · 第 '+current.courseMeta.lessonNumber+' 课';
  $('title').textContent=current.courseMeta.articleTitle;
  if(report.valid){lastHtml=renderArticle(current);$('article').innerHTML=renderArticle(current,{audit:true})}
  else{$('article').textContent='当前配置有错误，修复后显示预览。';lastHtml=''}
  $('audioTitle').textContent=current.courseMeta.fullTitle;
  const img=current.courseMeta.assets.podcastCover;$('podcastImage').hidden=!img;if(img)$('podcastImage').src=img;
  const audio=current.courseMeta.assets.audio;
  if(audio!==($('audio').getAttribute('src')||'')){if(audio)$('audio').src=audio;else $('audio').removeAttribute('src');$('audio').load()}
  $('audio').hidden=!audio;$('audioStatus').textContent=audio?'配置时长：'+(current.courseMeta.durationLabel||'待核对'):'未提供音频；可先排图文。';
  $('podcastText').textContent=podcastNotes(current);
  renderMap();
}
function renderMap(){
  $('map').replaceChildren();
  [...$('article').querySelectorAll('h3')].forEach((h,i)=>{h.id='heading-'+i;const b=document.createElement('button');b.textContent=h.textContent;b.onclick=()=>h.scrollIntoView({behavior:'smooth',block:'start'});$('map').append(b)});
  for(const key of KEYS.filter(k=>current.components[k].enabled&&k!=='quote')){const b=document.createElement('button');b.textContent='编辑 · '+current.components[key].name;b.onclick=()=>{const d=$('component-'+key);d.open=true;d.scrollIntoView({behavior:'smooth',block:'center'})};$('map').append(b)}
}
function field(label,value,onInput,multi=false){
  const l=document.createElement('label');l.className='field';const span=document.createElement('span');span.textContent=label;const input=document.createElement(multi?'textarea':'input');input.value=value??'';if(multi)input.rows=3;input.addEventListener('input',()=>onInput(input.value));l.append(span,input);return l;
}
function renderControls(){
  $('metadata').replaceChildren();for(const [key,label] of [['articleTitle','公众号标题'],['fullTitle','课程完整标题'],['subtitle','副标题'],['series','系列名称'],['durationLabel','音频时长（按真实素材填写）']])$('metadata').append(field(label,current.courseMeta[key],v=>{current.courseMeta[key]=v;changed()}));
  $('intro').value=current.courseMeta.podcast?.intro||'';$('notes').value=(current.courseMeta.podcast?.notes||[]).join('\n');$('articleLink').value=current.articleLink||'';
  $('covers').replaceChildren();$('assetLinks').replaceChildren();
  for(const [key,label] of [['articleCover','公众号封面'],['podcastCover','播客封面']]){
    const box=document.createElement('div'),img=document.createElement('img'),p=document.createElement('p'),input=document.createElement('input');
    p.textContent=label;img.alt=label;const url=current.courseMeta.assets[key];if(url)img.src=url;else img.hidden=true;
    img.onclick=()=>{$('largeImage').src=img.src;$('imageDialog').showModal()};
    input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif';input.setAttribute('aria-label','替换'+label);
    input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(file.size>8*1024*1024||!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){toast('请选择 8 MB 内的 PNG/JPG/WebP/GIF 图片。');return}const r=new FileReader();r.onload=()=>{current.courseMeta.assets[key]=r.result;current.courseMeta.assets[key+'Filename']=file.name;renderControls();changed()};r.readAsDataURL(file)};
    box.append(img,p,input);$('covers').append(box);
  }
  for(const [key,label] of [['audio','下载音频'],['articleCover','下载图文封面'],['podcastCover','下载播客封面']]){const url=current.courseMeta.assets[key];if(!url)continue;const a=document.createElement('a');a.className='action';a.textContent=label;a.href=url;a.download=current.courseMeta.assets[key+'Filename']||key;$('assetLinks').append(a)}
  $('components').replaceChildren();
  for(const key of KEYS){
    const c=current.components[key],d=document.createElement('details'),summary=document.createElement('summary'),toggle=document.createElement('input'),name=document.createElement('span');d.className='card';d.id='component-'+key;
    toggle.type='checkbox';toggle.checked=c.enabled;toggle.setAttribute('aria-label','启用'+c.name);toggle.onclick=e=>e.stopPropagation();toggle.onchange=()=>{c.enabled=toggle.checked;changed()};name.textContent=c.name;summary.append(toggle,name);d.append(summary);
    if(key==='quote'){const p=document.createElement('p');p.className='muted';p.textContent='控制课程建议的重点表达；你补充的重点独立生效。';d.append(p)}
    else {
      d.append(field('标题',c.title,v=>{c.title=v;changed()}),field('阅读层文案',c.body,v=>{c.body=v;changed()},true));
      if(ANCHORS[key]){
        d.append(field('原文锚点（须在同一正文行中唯一出现）',current.courseMeta.anchors[ANCHORS[key]],v=>{current.courseMeta.anchors[ANCHORS[key]]=v;changed()}));
        const select=document.createElement('select');select.setAttribute('aria-label',c.name+'插入位置');for(const [v,t]of [['before','原文之前'],['after','原文之后']]){const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o)}select.value=c.position||'after';select.onchange=()=>{c.position=select.value;changed()};d.append(select);
      }
      if(key==='concept'){(current.courseMeta.conceptItems||[]).forEach((item,i)=>{d.append(field('概念 '+(i+1),item.title,v=>{item.title=v;changed()}),field('解释',item.body,v=>{item.body=v;changed()}))})}
      if(key==='practice')d.append(field('下一课锚点（可留空）',current.courseMeta.anchors.nextLesson,v=>{current.courseMeta.anchors.nextLesson=v;changed()}));
    }
    const reset=document.createElement('button');reset.textContent='恢复构建建议';reset.style.marginTop='10px';reset.onclick=()=>{if(current.courseMeta.id!==originalPackage.courseMeta.id){toast('导入的课程请重新导入原配置以恢复建议。');return}current.components[key]=clone(originalPackage.components[key]);if(ANCHORS[key])current.courseMeta.anchors[ANCHORS[key]]=originalPackage.courseMeta.anchors[ANCHORS[key]];renderControls();changed()};d.append(reset);$('components').append(d);
  }
  renderRules();
}
function renderRules(){
  $('rules').replaceChildren();const all=[...current.editorialRules,...(current.customEditorialRules||[])];$('ruleCount').textContent=all.length+' 处';
  const labels={none:'不处理',highlight:'高亮',bold:'加粗',quote:'引用'};
  all.forEach(rule=>{const row=document.createElement('div');row.className='rule';const title=document.createElement('strong');title.textContent=rule.label;const quote=document.createElement('blockquote');quote.textContent=rule.text;const why=document.createElement('p');why.className='muted';why.textContent=rule.reason;const buttons=document.createElement('div');buttons.className='row';
    for(const f of FORMATS){const b=document.createElement('button');b.textContent=labels[f];b.className=rule.format===f?'active':'';b.setAttribute('aria-pressed',String(rule.format===f));b.onclick=()=>{rule.format=f;renderRules();changed()};buttons.append(b)}
    if(current.customEditorialRules.includes(rule)){const b=document.createElement('button');b.textContent='移除';b.onclick=()=>{current.customEditorialRules=current.customEditorialRules.filter(r=>r!==rule);renderRules();changed()};buttons.append(b)}
    row.append(title,quote,why,buttons);$('rules').append(row);
  });
}
async function copy(html,text){
  try{if(html)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);else await navigator.clipboard.writeText(text);toast('已复制，请到公众号编辑器粘贴检查。')}
  catch{
    const box=document.createElement(html?'div':'textarea');box.style.cssText='position:fixed;left:-10000px;top:0;';if(html)box.innerHTML=html;else box.value=text;document.body.append(box);
    if(html){const range=document.createRange();range.selectNodeContents(box);const s=window.getSelection();s.removeAllRanges();s.addRange(range)}else box.select();
    const ok=document.execCommand('copy');box.remove();window.getSelection()?.removeAllRanges();toast(ok?'已使用兼容方式复制，请检查粘贴结果。':'复制受限，请下载正文 HTML，打开后全选复制。');
  }
}
$('copyBody').onclick=()=>{if(!lastHtml)return;const d=document.createElement('div');d.innerHTML=lastHtml;copy(lastHtml,d.textContent)};
$('copyTitle').onclick=()=>copy('',current.courseMeta.articleTitle);
$('copyNotes').onclick=()=>copy('',podcastNotes(current));
$('downloadHtml').onclick=()=>{if(lastHtml)download('article.html',lastHtml,'text/html;charset=utf-8')};
$('downloadNotes').onclick=()=>download('podcast-notes.txt',podcastNotes(current));
$('downloadSource').onclick=()=>download('transcript.md',current.transcriptMarkdown);
$('exportButton').onclick=()=>{if(!validate(current).valid)return;persist();download(current.courseMeta.id+'.course.json',JSON.stringify(current,null,2)+'\n','application/json');toast('配置已导出；文件备份不包含音频，保留整个发布文件夹。')};
$('resetButton').onclick=()=>{if(!confirm('恢复这次构建时的版本？当前修改请先导出配置。'))return;current=clone(originalPackage);confirmed=false;renderControls();changed();persist()};
$('importButton').onclick=()=>$('importFile').click();
$('importFile').onchange=async()=>{
  const file=$('importFile').files?.[0];if(!file)return;
  try{const incoming=JSON.parse(await file.text()),r=validate(incoming);if(!r.valid)throw Error(r.errors.join('；'));if(!persist()&&!confirm('当前内容无法保存。仍要切换课程吗？请先导出备份。'))return;current=incoming;current.customEditorialRules??=[];renderControls();changed();persist();toast('已导入课程。相对素材路径须位于当前发布目录；迁移请用 build 命令。')}
  catch(e){toast('导入失败：'+e.message.split('；').slice(0,2).join('；'))}finally{$('importFile').value=''}
};
$('intro').oninput=()=>{current.courseMeta.podcast??={intro:'',notes:[]};current.courseMeta.podcast.intro=$('intro').value;changed()};
$('notes').oninput=()=>{current.courseMeta.podcast??={intro:'',notes:[]};current.courseMeta.podcast.notes=$('notes').value.split('\n').filter(Boolean);changed()};
$('articleLink').oninput=()=>{current.articleLink=$('articleLink').value.trim();changed()};
$('addRule').onclick=()=>{const text=$('customText').value.trim();if(!text){toast('请填写原句。');return}const trial=clone(current);trial.customEditorialRules??=[];trial.customEditorialRules.push({id:'custom-'+Date.now(),label:'自定义重点',text,reason:'由你补充',recommended:$('customFormat').value,format:$('customFormat').value,custom:true});const r=validate(trial);if(!r.valid){toast(r.errors[0]);return}current=trial;$('customText').value='';renderControls();changed()};
$('article').onmouseup=()=>{const s=window.getSelection();if(s&&!s.isCollapsed&&$('article').contains(s.anchorNode)&&$('article').contains(s.focusNode))$('customText').value=s.toString().trim()};
$('originalOnly').onclick=()=>{KEYS.forEach(k=>current.components[k].enabled=false);current.customEditorialRules=[];renderControls();changed()};
$('confirm').onclick=()=>{if(!validate(current).valid)return;confirmed=true;$('confirm').textContent='阅读层已确认';persist();toast('阅读层已确认。请检查封面、音频和公众号实际预览。')};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('articlePane').classList.toggle('hidden',b.dataset.tab!=='articlePane');$('audioPane').classList.toggle('hidden',b.dataset.tab!=='audioPane')});
$('closeImage').onclick=()=>$('imageDialog').close();
$('audio').onloadedmetadata=()=>{$('audioStatus').textContent='实际音频时长：'+Math.floor($('audio').duration/60)+' 分 '+Math.round($('audio').duration%60)+' 秒'};
$('audio').onerror=()=>{$('audioStatus').textContent='音频加载失败，请检查素材路径，并通过本地 HTTP 预览重试。'};
window.addEventListener('pagehide',persist);
window.addEventListener('beforeunload',e=>{if(!persist()){e.preventDefault();e.returnValue='有未保存的修改。'}});
try{const saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(saved?.package&&validate(saved.package).valid){current=saved.package;confirmed=!!saved.confirmed;$('saveStatus').textContent='已恢复当前浏览器草稿'}else $('saveStatus').textContent='已载入构建版本；修改将自动保存'}catch{$('saveStatus').textContent='浏览器存储不可用，请导出配置'}
current.customEditorialRules??=[];renderControls();renderPreview();if(confirmed)$('confirm').textContent='阅读层已确认';
