import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {clone,validate,renderArticle} from '../skills/muse-edit/scripts/core.mjs';
const demo=JSON.parse(fs.readFileSync(new URL('../examples/demo.course.json',import.meta.url),'utf8'));
const cli=fileURLToPath(new URL('../skills/muse-edit/scripts/muse.mjs',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
test('render keeps each quoted source phrase once, at its original location',()=>{
  assert.equal(validate(demo).valid,true);const html=renderArticle(demo);
  assert.equal(html.split('记录事实，再作判断。').length-1,1);
  assert.ok(html.indexOf('记录事实，再作判断。')<html.indexOf('事实是你看见的变化'));
  assert.doesNotMatch(html,/<(?:script|style|div)\b|\b(?:class|id)=|display:flex|text-align:start/);
});
test('empty transcript, missing structure and forged or ambiguous references fail',()=>{
  for(const edit of [p=>p.transcriptMarkdown='',p=>delete p.courseMeta.anchors,p=>p.editorialRules[0].text='凭空生成',p=>p.transcriptMarkdown+='\n记录事实，再作判断。',p=>p.courseMeta.anchors.concept='不存在']){const p=clone(demo);edit(p);assert.equal(validate(p).valid,false)}
});
test('active overlapping annotations fail',()=>{const p=clone(demo);p.customEditorialRules=[{...p.editorialRules[0],id:'extra',text:'再作判断'}];assert.equal(validate(p).valid,false);p.customEditorialRules[0].format='none';assert.equal(validate(p).valid,true)});
test('untrusted text is escaped and unsafe asset paths fail',()=>{
  const p=clone(demo);p.components.path.body='<img src=x onerror=alert(1)>';assert.ok(renderArticle(p).includes('&lt;img'));
  for(const url of ['javascript:alert(1)','https://example.com/file.png','../file.png','/etc/passwd','data:image/svg+xml;base64,abc','x\\y']){p.courseMeta.assets.articleCover=url;assert.equal(validate(p).valid,false)}
});
test('source comparison detects one-character drift, and long transcripts are not truncated',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'muse-test-'));try{
    const p=clone(demo);p.transcriptMarkdown+='\n'+('很长的原稿。'.repeat(2200))+'末尾证据。';fs.writeFileSync(path.join(tmp,'course.json'),JSON.stringify(p));fs.writeFileSync(path.join(tmp,'source.md'),p.transcriptMarkdown);
    assert.equal(run('validate','--course',path.join(tmp,'course.json'),'--source',path.join(tmp,'source.md')).status,0);
    fs.appendFileSync(path.join(tmp,'source.md'),'变');assert.equal(run('validate','--course',path.join(tmp,'course.json'),'--source',path.join(tmp,'source.md')).status,1);
    assert.ok(renderArticle(p).includes('末尾证据。'));
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('build roundtrip is portable, refuses overwrite and reports missing assets',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'muse-build-'));try{
    const course=path.join(tmp,'course.json');fs.writeFileSync(course,JSON.stringify(demo));
    const out=path.join(tmp,'release');const first=run('build','--course',course,'--out',out);assert.equal(first.status,0,first.stderr);
    const built=JSON.parse(fs.readFileSync(path.join(out,'course.json')));assert.equal(built.transcriptMarkdown,demo.transcriptMarkdown);
    const page=fs.readFileSync(path.join(out,'index.html'),'utf8');assert.ok(!page.includes('MUSE_DATA_BASE64'));assert.ok(!page.includes('/* MUSE_SCRIPT */'));
    for(const m of page.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);
    assert.equal(run('build','--course',course,'--out',out).status,1);
    assert.equal(run('build','--course',course,'--out',path.join(tmp,'strict'),'--require-assets').status,1);
    const p=clone(demo);p.courseMeta.assets.audio='assets/missing.mp3';fs.writeFileSync(course,JSON.stringify(p));assert.equal(run('build','--course',course,'--out',path.join(tmp,'missing')).status,1);
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('init copies media and preserves source bytes as UTF-8 text',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'muse-init-'));try{
    const input=path.join(tmp,'source.md'),audio=path.join(tmp,'input.wav');fs.writeFileSync(input,demo.transcriptMarkdown);fs.writeFileSync(audio,'synthetic-test-audio');const out=path.join(tmp,'new');
    const result=run('init','--source',input,'--title','新课程','--id','fresh-course','--audio',audio,'--out',out);assert.equal(result.status,0,result.stderr);const p=JSON.parse(fs.readFileSync(path.join(out,'course.json')));assert.equal(p.transcriptMarkdown,demo.transcriptMarkdown);assert.equal(fs.readFileSync(path.join(out,p.courseMeta.assets.audio),'utf8'),'synthetic-test-audio');assert.ok(Object.values(p.components).every(c=>!c.enabled));
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('original Markdown bold remains styled',()=>{const p=clone(demo);p.transcriptMarkdown+='\n这是**重要文字**。';assert.match(renderArticle(p),/style="font-weight:700[^>]*>重要文字<\/span>/)});
test('code punctuation stays literal, Chinese display punctuation changes without mutating source',()=>{
  const p=clone(demo);p.transcriptMarkdown+='\n中文说"你好"!\n\n```sh\n# 这是代码\necho "中文"\n```';const before=p.transcriptMarkdown;
  const html=renderArticle(p);assert.ok(html.includes('中文说“你好”！'));assert.ok(html.includes('echo &quot;中文&quot;'));assert.ok(html.includes('# 这是代码'));assert.equal(p.transcriptMarkdown,before);
  p.customEditorialRules=[{...p.editorialRules[0],id:'code-rule',text:'这是代码'}];assert.equal(validate(p).valid,false);
});
test('a quoted sentence containing original bold stays one continuous block',()=>{
  const p=clone(demo);p.transcriptMarkdown=p.transcriptMarkdown.replace('记录事实，再作判断。','记录**事实**，再作判断。');const html=renderArticle(p);assert.equal(html.split('border-left:3px solid').length-1,1);assert.ok(html.includes('记录事实，再作判断。'));
});
