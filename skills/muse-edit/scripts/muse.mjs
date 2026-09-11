#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {transcriptReview,KEYS,NAMES,validate,renderArticle,podcastNotes,clone} from './core.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function flags(args){const result={};for(let i=0;i<args.length;i++){if(!args[i].startsWith('--'))throw Error('参数须使用 --name value');const k=args[i].slice(2);result[k]=args[i+1]&&!args[i+1].startsWith('--')?args[++i]:true}return result}
function json(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function write(file,value){fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')}
function sourceRead(file){return fs.readFileSync(file,'utf8')}
function freshDirectory(out){if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('输出目录非空，请换一个目录，避免覆盖已有成品。');fs.mkdirSync(out,{recursive:true})}
function locateAsset(value,base){
  const resolved=path.resolve(base,value),realBase=fs.realpathSync(base);
  if(!fs.existsSync(resolved))throw Error('缺少素材：'+value+'（基准目录 '+base+'）');
  const real=fs.realpathSync(resolved);
  if(!real.startsWith(realBase+path.sep))throw Error('素材不能通过符号链接指向包目录之外：'+value);
  if(!fs.statSync(real).isFile())throw Error('素材不是文件：'+value);
  return real;
}
function check(pkg,options={}){
  const r=validate(pkg);
  if(options.source&&pkg.transcriptMarkdown!==sourceRead(options.source))r.errors.push('逐字稿与源文件不一致；不允许静默改写原稿。');
  if(options.assets){
    for(const key of ['audio','articleCover','podcastCover']){const value=pkg.courseMeta?.assets?.[key];if(value&&!value.startsWith('data:'))try{locateAsset(value,options.assets)}catch(e){r.errors.push(e.message)}}
  }
  if(options['require-assets'])for(const key of ['audio','articleCover','podcastCover'])if(!pkg.courseMeta?.assets?.[key])r.errors.push('发布材料缺少：'+key);
  r.valid=!r.errors.length;return r;
}
function assertValid(r){if(!r.valid)throw Error(r.errors.join('\n'))}
function init(opts){
  for(const k of ['source','title','id','out'])if(typeof opts[k]!=='string')throw Error('缺少 --'+k);
  const out=path.resolve(opts.out),source=sourceRead(opts.source);
  if(!source.trim())throw Error('原稿不能为空。');
  const assets={};const copies=[];
  for(const [key,flag] of [['audio','audio'],['articleCover','article-cover'],['podcastCover','podcast-cover']]){
    assets[key]='';assets[key+'Filename']='';
    if(opts[flag]){const input=path.resolve(opts[flag]);if(!fs.statSync(input).isFile())throw Error('素材不是文件');const filename=key+path.extname(input).toLowerCase();assets[key]='assets/'+filename;assets[key+'Filename']=filename;copies.push([input,filename])}
  }
  const pkg={schemaVersion:'1.0',courseMeta:{id:opts.id,series:opts.series||'我的课程',lessonNumber:Number(opts.lesson||0),articleTitle:opts.title,fullTitle:opts.title,subtitle:'',sourceFilename:path.basename(opts.source),durationLabel:'待核对时长',durationClock:'',assets,anchors:{concept:'',threeR:'',reflection:'',practice:'',nextLesson:''},conceptItems:[],podcast:{intro:'',notes:[]}},transcriptMarkdown:source,components:Object.fromEntries(KEYS.map(key=>[key,{name:NAMES[key],title:NAMES[key],body:'',position:'after',enabled:false}])),editorialRules:[],customEditorialRules:[],articleLink:''};
  assertValid(validate(pkg));freshDirectory(out);fs.mkdirSync(path.join(out,'assets'),{recursive:true});for(const [input,name] of copies)fs.copyFileSync(input,path.join(out,'assets',name));
  write(path.join(out,'course.json'),pkg);write(path.join(out,'transcript.md'),source);
  return {course:path.join(out,'course.json'),next:'填写课程 JSON 中的阅读建议、锚点和播客简介；保留 transcriptMarkdown 原样。'};
}
function build(opts){
  if(!opts.course||!opts.out)throw Error('需要 --course 和 --out');
  const pkg=clone(json(opts.course)),base=path.resolve(opts.assets||path.dirname(opts.course));
  const report=check(pkg,{...opts,assets:base});assertValid(report);
  const files=[];
  for(const key of ['audio','articleCover','podcastCover']){
    const value=pkg.courseMeta.assets[key];if(!value)continue;
    let bytes,ext;
    if(value.startsWith('data:')){const match=value.match(/^data:image\/([^;]+);base64,(.*)$/);ext='.'+({jpeg:'jpg'}[match[1]]||match[1]);bytes=Buffer.from(match[2],'base64')}
    else {const src=locateAsset(value,base);bytes=fs.readFileSync(src);ext=path.extname(src).toLowerCase()}
    const allowed=key==='audio'?['.mp3','.wav','.m4a','.ogg','.aac']:['.png','.jpg','.jpeg','.webp','.gif'];
    if(!allowed.includes(ext))throw Error('不支持的素材格式：'+key+ext);
    const name=key+ext;files.push({name,bytes});pkg.courseMeta.assets[key]='assets/'+name;pkg.courseMeta.assets[key+'Filename']=name;
  }
  const html=renderArticle(pkg);
  const input=opts.validator;
  if(input){
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'muse-check-'));
    try{
      const file=path.join(tmp,'article.html');write(file,html);
      const proc=spawnSync('python3',[path.resolve(input),file],{encoding:'utf8'});
      report.externalValidator={exitCode:proc.status,output:(proc.stdout||'')+(proc.stderr||'')};
      if(proc.error||proc.status!==0||/WARNING\s*[×x]\s*[1-9]/i.test(proc.stdout||''))throw Error('外部公众号校验未通过：\n'+report.externalValidator.output);
    }finally{fs.rmSync(tmp,{recursive:true,force:true})}
  }
  const out=path.resolve(opts.out);freshDirectory(out);fs.mkdirSync(path.join(out,'assets'),{recursive:true});
  for(const f of files)fs.writeFileSync(path.join(out,'assets',f.name),f.bytes);
  write(path.join(out,'course.json'),pkg);write(path.join(out,'transcript.md'),pkg.transcriptMarkdown);write(path.join(out,'article.html'),html);
  write(path.join(out,'title.txt'),pkg.courseMeta.articleTitle);write(path.join(out,'podcast-notes.txt'),podcastNotes(pkg));
  write(path.join(out,'transcript-review.txt'),transcriptReview(pkg));
  write(path.join(out,'发布说明.md'),'# '+pkg.courseMeta.fullTitle+'\n\n1. 打开 index.html 检查全文和阅读层。\n2. 修改会保存在当前浏览器；导出配置才是可迁移文件备份。\n3. 点击“下载当前正文”取得修改后的 HTML；目录里的 article.html 是构建时快照。\n4. 在公众号后台分别填写标题和图文正文，检查手机预览。\n5. 音频、方形封面和轻量节目笔记分别上传；原生音频和时间轴不会随 HTML 复制。\n6. 图文发布后回填链接，再导出播客简介。\n\n'+report.warnings.map(x=>'- '+x).join('\n')+'\n');
  const envelope={package:pkg,sourceHash:hash(pkg.transcriptMarkdown),buildId:hash(JSON.stringify(pkg)).slice(0,20)};
  let page=fs.readFileSync(path.join(ROOT,'assets','workbench.html'),'utf8');
  const js=fs.readFileSync(path.join(ROOT,'scripts','core.mjs'),'utf8').replace(/^export /gm,'')+'\n'+fs.readFileSync(path.join(ROOT,'assets','workbench.js'),'utf8');
  page=page.replace('/* MUSE_SCRIPT */',js.replaceAll('</script','<\\/script')).replace('MUSE_DATA_BASE64',Buffer.from(JSON.stringify(envelope)).toString('base64'));
  write(path.join(out,'index.html'),page);
  report.sourceSha256=envelope.sourceHash;report.assets=files.map(f=>({path:'assets/'+f.name,sha256:hash(f.bytes),bytes:f.bytes.length}));report.htmlBytes=Buffer.byteLength(html);report.checkScope='结构、原稿一致性（传 --source 时）、锚点、重点、素材；不是公众号平台实粘验收。';
  write(path.join(out,'validation.json'),report);
  return {entry:path.join(out,'index.html'),...report};
}
function main(){
  const [command,...args]=process.argv.slice(2);
  if(!command||command==='--help'){console.log('Muse Edit · Node.js 22+，无运行依赖\n\ninit --source 原稿.md --title 标题 --id lesson-01 --out 工作目录 [--audio 音频.mp3 --article-cover 图.png --podcast-cover 图.png]\nvalidate --course course.json [--source 原稿.md --assets 素材根目录 --require-assets]\nbuild --course course.json --out 新发布目录 [--assets 素材根目录 --source 原稿.md --require-assets --validator validate_gzh_html.py]\n\n生成后双击 index.html；若剪贴板受限，用 python3 -m http.server 8765 --bind 127.0.0.1 --directory 发布目录，再打开 http://127.0.0.1:8765。');return}
  const opts=flags(args);let result;
  if(command==='init')result=init(opts);
  else if(command==='validate'){if(!opts.course)throw Error('需要 --course');result=check(json(opts.course),opts);if(!result.valid)process.exitCode=1}
  else if(command==='build')result=build(opts);
  else throw Error('未知命令：'+command);
  console.log(JSON.stringify(result,null,2));
}
try{main()}catch(error){console.error(JSON.stringify({valid:false,error:error.message},null,2));process.exitCode=1}
