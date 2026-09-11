// Muse course format 1.0: shared validation and deterministic rendering.
export const KEYS = ['listen','path','quote','three-r','practice','concept','reflection'];
export const NAMES = {listen:'听音引导',path:'听读路径',quote:'重点表达','three-r':'步骤卡',practice:'练习与下一课',concept:'概念卡',reflection:'提醒卡'};
export const ANCHORS = {concept:'concept','three-r':'threeR',reflection:'reflection',practice:'practice'};
export const FORMATS = ['none','highlight','bold','quote'];
export const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const plainInline = value => String(value).replace(/\*\*(.*?)\*\*/g,'$1');
export const count = (text, needle) => needle ? text.split(needle).length-1 : 0;
export const clone = value => JSON.parse(JSON.stringify(value));
export function safeAsset(value) {
  return typeof value === 'string' && (!value || /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) || (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..') && !/[?#\x00-\x1f]/.test(value)));
}
export function validate(pkg) {
  const errors=[], warnings=[];
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  if(!object(pkg))return {valid:false,errors:['课程包必须是对象。'],warnings};
  if(pkg.schemaVersion!=='1.0')errors.push('只支持 schemaVersion 1.0。');
  const meta=object(pkg.courseMeta)?pkg.courseMeta:{};
  for(const key of ['id','series','articleTitle','fullTitle','sourceFilename'])if(typeof meta[key]!=='string'||!meta[key].trim())errors.push('缺少 courseMeta.'+key);
  if(!/^[a-z0-9][a-z0-9._-]*$/i.test(meta.id||''))errors.push('课程 id 仅接受字母、数字、点、横线和下划线。');
  if(!Number.isInteger(meta.lessonNumber)||meta.lessonNumber<0)errors.push('课次须为非负整数。');
  for(const key of ['subtitle','durationLabel','durationClock'])if(meta[key]!==undefined&&typeof meta[key]!=='string')errors.push(key+' 必须是文字。');
  if(!object(meta.assets))errors.push('缺少 assets 对象。');
  if(!object(meta.anchors))errors.push('缺少 anchors 对象。');
  for(const key of ['audio','articleCover','podcastCover']){
    const path=meta.assets?.[key];
    if(typeof path!=='string'||!safeAsset(path)||(key==='audio'&&path.startsWith('data:')))errors.push(key+' 必须为包内相对路径；图片也接受 PNG/JPG/WebP/GIF Data URL。');
    else if(!path)warnings.push('待补素材：'+({audio:'音频',articleCover:'公众号封面',podcastCover:'播客封面'}[key]));
  }
  const source=typeof pkg.transcriptMarkdown==='string'?pkg.transcriptMarkdown:'';
  if(!source.trim())errors.push('原稿不能为空。');
  const lines=source.split(/\r?\n/);
  let inCode=false;
  const eligibleLines=lines.filter(l=>{if(/^\s*(```|~~~)/.test(l)){inCode=!inCode;return false}return !inCode&&!/^\s*(#|\*\*\*|---)/.test(l)});
  const searchable=lines.map(plainInline).join('\n');
  if(!object(pkg.components))errors.push('缺少 components 对象。');
  for(const key of KEYS){
    const c=pkg.components?.[key];
    if(!object(c)){errors.push('缺少组件：'+key);continue}
    if(typeof c.enabled!=='boolean')errors.push(key+'.enabled 必须是布尔值。');
    for(const f of ['name','title','body'])if(typeof c[f]!=='string')errors.push(key+'.'+f+' 必须是文字。');
    if(c.position!==undefined&&!['before','after'].includes(c.position))errors.push(key+' 插入位置无效。');
    const anchor=meta.anchors?.[ANCHORS[key]];
    if(c.enabled&&ANCHORS[key]&&(!anchor||count(source,anchor)!==1))errors.push(key+' 必须指定在原稿中唯一命中的锚点。');
  }
  for(const [key,anchor] of Object.entries(meta.anchors||{})){
    if(typeof anchor!=='string')errors.push('锚点 '+key+' 必须是文字。');
    else if(anchor&&(count(source,anchor)!==1||!eligibleLines.some(l=>l.includes(anchor))))errors.push('锚点 '+key+' 必须唯一命中同一正文行。');
  }
  const ids=new Set(), active=[];
  for(const group of ['editorialRules','customEditorialRules']){
    const rules=pkg[group]??(group==='customEditorialRules'?[]:null);
    if(!Array.isArray(rules)){errors.push(group+' 必须是数组。');continue}
    for(const rule of rules){
      if(!object(rule)){errors.push('重点规则必须是对象。');continue}
      if(typeof rule.id!=='string'||!rule.id||ids.has(rule.id))errors.push('重点 id 为空或重复。');ids.add(rule.id);
      for(const key of ['text','label','reason'])if(typeof rule[key]!=='string'||!rule[key].trim())errors.push('重点 '+key+' 不能为空。');
      if(!FORMATS.includes(rule.format)||!FORMATS.includes(rule.recommended))errors.push('重点格式无效。');
      const text=rule.text;
      if(typeof text!=='string'||!text||count(searchable,text)!==1||!eligibleLines.some(l=>plainInline(l).includes(text)))errors.push('重点必须唯一命中同一正文行：'+String(text).slice(0,40));
      if(rule.format!=='none'&&(group==='customEditorialRules'||pkg.components?.quote?.enabled)&&typeof text==='string'){
        const start=searchable.indexOf(text),end=start+text.length;
        if(active.some(r=>start<r.end&&end>r.start))errors.push('启用的重点存在重叠，请缩短或关闭其中一处。');
        active.push({start,end});
      }
    }
  }
  if(pkg.articleLink && (typeof pkg.articleLink!=='string'||!/^https:\/\/mp\.weixin\.qq\.com\//.test(pkg.articleLink)))errors.push('文章链接必须是 https://mp.weixin.qq.com/ 地址。');
  if(meta.podcast!==undefined&&(!object(meta.podcast)||typeof meta.podcast.intro!=='string'||!Array.isArray(meta.podcast.notes)||meta.podcast.notes.some(x=>typeof x!=='string')))errors.push('播客简介或节目笔记格式错误。');
  if(meta.conceptItems!==undefined&&(!Array.isArray(meta.conceptItems)||meta.conceptItems.some(x=>!object(x)||typeof x.title!=='string'||typeof x.body!=='string')))errors.push('概念项格式错误。');
  return {valid:errors.length===0,errors,warnings};
}
export function typography(text){
  text=String(text??'');if(!/[\u3400-\u9fff]/.test(text))return text;
  let doubleOpen=true,singleOpen=true;
  return text.replace(/"/g,()=>{const q=doubleOpen?'“':'”';doubleOpen=!doubleOpen;return q}).replace(/'/g,(q,i)=>{if(/[a-z0-9]/i.test(text[i-1]||'')&&/[a-z0-9]/i.test(text[i+1]||''))return q;const r=singleOpen?'‘':'’';singleOpen=!singleOpen;return r}).replace(/([\u3400-\u9fff”’])([,;!?])/g,(_,c,p)=>c+({',':'，',';':'；','!':'！','?':'？'}[p]));
}
const leaf=(text,style='',normalize=true)=>'<span leaf=""'+(style?' style="'+style+'"':'')+'>'+esc(normalize?typography(text):text)+'</span>';
const pstyle='margin:0 0 20px;padding:0;font-size:14px !important;line-height:1.9;color:#5f5964;text-align:left;word-break:break-word;';
const emph={highlight:'background-color:#fff0a6;color:#493d25;',bold:'font-weight:700;color:#473163;',quote:'display:block;margin:18px 0;padding:16px;border-left:3px solid #9173b5;background-color:#f2ecf8;color:#473163;font-weight:700;'};
function inline(text,rules=[]){
  // Match source phrases before escaping. Each phrase occurs once, checked by validate().
  const clean=plainInline(text),ranges=[];
  let removed=0;
  for(const m of text.matchAll(/\*\*(.*?)\*\*/g)){const start=m.index-removed;ranges.push({start,end:start+m[1].length,style:emph.bold});removed+=4}
  const matches=rules.map(r=>({...r,start:clean.indexOf(r.text)})).filter(r=>r.start>=0).map(r=>({...r,end:r.start+r.text.length}));
  const stops=[...new Set([0,clean.length,...ranges.flatMap(r=>[r.start,r.end]).filter(p=>!matches.some(r=>p>r.start&&p<r.end)),...matches.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
  const display=typography(clean);
  let out='';
  for(let i=0;i<stops.length-1;i++){const start=stops[i],end=stops[i+1];const rule=matches.find(r=>start>=r.start&&start<r.end),bold=ranges.find(r=>start>=r.start&&start<r.end);out+=leaf(display.slice(start,end),rule?emph[rule.format]:bold?.style||'',false)}
  return out;
}
function basic(text){return leaf(text)}
function card(pkg,key,part=''){
  const c=pkg.components[key],meta=pkg.courseMeta;
  if(!c?.enabled||key==='quote')return '';
  let title=c.title,body='';
  const bodyLines=c.body.split('\n').filter(x=>x.trim());
  if(key==='concept'&&meta.conceptItems?.length){
    body+='<section style="display:block;font-size:0;">'+meta.conceptItems.map((x,i)=>'<section style="display:inline-block;vertical-align:top;width:'+((100-(meta.conceptItems.length-1)*4)/meta.conceptItems.length)+'%;margin-right:'+(i===meta.conceptItems.length-1?0:4)+'%;font-size:14px;">'+leaf(x.title,'font-weight:700;')+'<p style="margin:6px 0;">'+leaf(x.body)+'</p></section>').join('')+'</section>';
  }
  if(key==='practice'){title=part==='next'?'下一课':c.title;body=leaf((part==='next'?bodyLines.slice(1):bodyLines.slice(0,1)).join('\n'))}
  else if(key==='three-r')body+='<section style="display:block;font-size:0;">'+bodyLines.map((x,i)=>'<section style="display:inline-block;vertical-align:top;width:'+((100-(bodyLines.length-1)*3.5)/Math.max(1,bodyLines.length))+'%;margin-right:'+(i===bodyLines.length-1?0:3.5)+'%;font-size:14px;">'+leaf(String(i+1).padStart(2,'0'),'font-weight:700;color:#9173b5;')+'<p style="margin:6px 0;">'+leaf(x)+'</p></section>').join('')+'</section>';
  else body+=bodyLines.map(x=>'<p style="margin:7px 0;font-size:14px;line-height:1.8;">'+leaf(x)+'</p>').join('');
  return '<section style="margin:22px 0;padding:18px;background-color:'+(key==='listen'?'#f2ecf8':'#f1f5f6')+';border-radius:12px;line-height:1.8;">'+leaf(title,'display:block;margin-bottom:8px;font-weight:700;color:#473163;font-size:16px;')+body+'</section>';
}
export function renderArticle(pkg,{audit=false}={}){
  const result=validate(pkg);if(!result.valid)throw new Error(result.errors.join('\n'));
  const meta=pkg.courseMeta,anchors=meta.anchors||{};
  const rules=[...(pkg.components.quote.enabled?pkg.editorialRules:[]),...(pkg.customEditorialRules||[])].filter(r=>r.format!=='none');
  let html=card(pkg,'listen')+card(pkg,'path'),code=false;
  const lines=pkg.transcriptMarkdown.split(/\r?\n/);
  lines.forEach((raw,index)=>{
    const line=raw.trim();if(!line&&!code)return;
    const sourceAttr=audit?' data-source-line="'+index+'"':'';
    const heading=line.match(/^(#{1,6})\s+(.*)$/);
    if(/^(```|~~~)/.test(line)){code=!code;return}
    if(!code&&/^(\*\*\*|---)\s*$/.test(line)){html+='<p style="text-align:center;margin:24px 0;">'+leaf('···')+'</p>';return}
    const keys=Object.entries(ANCHORS).filter(([k,a])=>anchors[a]&&raw.includes(anchors[a])).map(([k])=>k);
    keys.filter(k=>pkg.components[k].position==='before').forEach(k=>html+=card(pkg,k));
    if(heading&&!code){
      // H1 belongs to preview header/platform title; retain other H1s as headings.
      if(heading[1].length!==1||index!==lines.findIndex(l=>/^#\s/.test(l)))html+='<h3'+sourceAttr+' style="margin:30px 0 16px;color:#473163;font-size:20px;line-height:1.6;">'+inline(heading[2])+'</h3>';
    }else html+='<p'+sourceAttr+' style="'+pstyle+(code?'font-family:monospace;white-space:pre-wrap;background-color:#f4f2f6;padding:10px;':'')+'">'+(code?leaf(raw,'',false):inline(line,rules))+'</p>';
    keys.filter(k=>pkg.components[k].position!=='before').forEach(k=>html+=card(pkg,k));
    if(anchors.nextLesson&&raw.includes(anchors.nextLesson))html+=card(pkg,'practice','next');
  });
  return '<section style="padding:18px 12px;margin:0;background-color:#fffdf8;color:#5f5964;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;font-size:14px !important;line-height:1.9;-webkit-text-size-adjust:none;text-size-adjust:none;">'+(meta.subtitle?'<p style="'+pstyle+'">'+leaf(meta.subtitle)+'</p>':'')+html+'</section>';
}
export function podcastNotes(pkg){
  const m=pkg.courseMeta;return [m.fullTitle,m.podcast?.intro,...(m.podcast?.notes||[]),pkg.articleLink?'配套文章：'+pkg.articleLink:'配套文章：发布图文后回填链接。'].filter(Boolean).join('\n\n');
}
