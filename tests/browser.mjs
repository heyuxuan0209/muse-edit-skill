import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
const root=process.cwd(),out=path.join(root,'test-results','browser'),demo=JSON.parse(fs.readFileSync('examples/demo.course.json'));
fs.mkdirSync(out,{recursive:true});
const release=fs.mkdtempSync(path.join(out,'release-'));
const built=spawnSync(process.execPath,['skills/muse-edit/scripts/muse.mjs','build','--course','examples/demo.course.json','--out',release],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
const server=http.createServer((req,res)=>{
  const file=path.resolve(release,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(release+path.sep)&&file!==release){res.writeHead(403).end();return}
  const resolved=file===release?path.join(release,'index.html'):file;
  if(!fs.existsSync(resolved)){res.writeHead(404).end();return}
  res.setHeader('Content-Type',resolved.endsWith('.html')?'text/html;charset=utf-8':resolved.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(resolved));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.MUSE_BROWSER_EXECUTABLE?{executablePath:process.env.MUSE_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1500,height:1000},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/index.html');await page.locator('#title').waitFor();
  assert.equal(await page.locator('#importButton').textContent(),'导入课程包');
  assert.equal(await page.locator('#exportButton').textContent(),'导出本课配置');
  assert.equal(await page.locator('#copyTop').textContent(),'复制到公众号');
  for(const id of ['coverAsset','podcastCoverAsset','deliveryPackage']){assert.equal(await page.locator('#'+id).isVisible(),true);assert.equal(await page.locator('#'+id).evaluate(el=>!!el.closest('details')),false)}
  assert.deepEqual(await page.locator('[data-tab]').allTextContents(),['公众号图文','播客播放','播客原文']);
  assert.equal(await page.locator('#sourceText').textContent(),demo.transcriptMarkdown);
  assert.equal(await page.locator('#article [data-source-line]').count(),9);
  // Changes must survive a real reload, without altering source.
  await page.locator('[data-tab="audioPane"]').click();
  await page.locator('#component-reflection summary').click();
  assert.equal(await page.locator('#articlePane').isVisible(),true);
  await page.waitForFunction(()=>{const el=document.querySelector('[data-reading-component="reflection"]'),pane=document.querySelector('.preview-scroll');const a=el.getBoundingClientRect(),b=pane.getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom});
  assert.equal(await page.locator('[data-reading-component="reflection"].linked-reading').count(),1);
  await page.locator('#component-reflection input[type=checkbox]').uncheck();
  assert.equal(await page.locator('[data-reading-component="reflection"]').count(),0);
  assert.ok((await page.locator('.linked-reading[data-source-line]').textContent()).includes('一次只改变一个条件'));
  await page.locator('#component-reflection input[type=checkbox]').check();
  assert.equal(await page.locator('[data-reading-component="reflection"].linked-reading').count(),1);
  await page.locator('#component-reflection textarea').fill('只做一个小实验，再回看结果。');
  assert.ok((await page.locator('[data-reading-component="reflection"].linked-reading').textContent()).includes('只做一个小实验'));
  await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('已保存'));
  await page.reload();assert.equal(await page.locator('#sourceText').textContent(),demo.transcriptMarkdown);
  assert.ok((await page.locator('#article').textContent()).includes('只做一个小实验，再回看结果。'));
  // Switch formats and add/remove independent custom rules.
  await page.locator('#rules button').filter({hasText:'高亮'}).first().click();
  await page.locator('#customText').fill('一次只改变一个条件');await page.locator('#addRule').click();assert.equal(await page.locator('#rules .rule').count(),2);
  await page.locator('#rules button').filter({hasText:'移除'}).click();assert.equal(await page.locator('#rules .rule').count(),1);
  const htmlBefore=await page.evaluate(()=>renderArticle(current));
  // Real clipboard, not a mocked navigator.clipboard.
  await page.locator('#copyBody').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.startsWith('已复制，请到'));
  const clipboard=await page.evaluate(async()=>{const items=await navigator.clipboard.read();return await (await items[0].getType('text/html')).text()});
  assert.ok(clipboard.includes('记录事实，再作判断。'));assert.ok(!clipboard.includes('data-source-line'));assert.ok(!clipboard.includes('data-reading-component'));assert.ok(!clipboard.includes('linked-reading'));
  // Export then feed the downloaded JSON through the actual file input.
  const pending=page.waitForEvent('download');await page.locator('#exportButton').click();const exported=await pending;const file=path.join(out,'roundtrip.course.json');await exported.saveAs(file);
  await page.locator('#importFile').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('toast').textContent.startsWith('已导入课程'));
  assert.equal(await page.evaluate(()=>renderArticle(current)),htmlBefore);
  // Bad input reports failure and preserves current course.
  const bad=path.join(out,'invalid.json');fs.writeFileSync(bad,JSON.stringify({...demo,transcriptMarkdown:''}));await page.locator('#importFile').setInputFiles(bad);await page.waitForFunction(()=>document.getElementById('toast').textContent.startsWith('导入失败'));assert.equal(await page.evaluate(()=>renderArticle(current)),htmlBefore);
  // Invalid link blocks export; valid link propagates to notes.
  await page.locator('summary').filter({hasText:'课程信息与发布材料'}).click();await page.locator('#articleLink').fill('https://example.com');assert.equal(await page.locator('#exportButton').isDisabled(),true);
  await page.locator('#articleLink').fill('https://mp.weixin.qq.com/s/example');assert.equal(await page.locator('#exportButton').isDisabled(),false);
  await page.locator('[data-tab="audioPane"]').click();await page.locator('#openNotes').click();assert.ok((await page.locator('#podcastText').textContent()).includes('https://mp.weixin.qq.com/s/example'));assert.equal(await page.locator('#notesPane').isVisible(),true);
  await page.locator('[data-tab="articlePane"]').click();await page.locator('summary').filter({hasText:'课程信息与发布材料'}).click();
  // Both prominent cover cards must support real file upload, preview and download.
  const pixel=path.join(out,'cover.png');fs.writeFileSync(pixel,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afooAAAAASUVORK5CYII=','base64'));
  for(const id of ['coverAsset','podcastCoverAsset']){
    await page.locator('#'+id+' input[type=file]').setInputFiles(pixel);
    await page.waitForFunction(id=>document.querySelector('#'+id+' img').naturalWidth===1,id);
    await page.locator('#'+id+' button').filter({hasText:'放大预览'}).click();assert.equal(await page.locator('#imageDialog').isVisible(),true);await page.locator('#closeImage').click();
    const coverDownload=page.waitForEvent('download');await page.locator('#'+id+' a').click();assert.equal((await coverDownload).suggestedFilename(),'cover.png');
  }
  assert.equal(await page.locator('#audioPane').isVisible(),true);
  assert.ok((await page.locator('#podcastImage').getAttribute('src')).startsWith('data:image/png'));
  await page.locator('[data-tab="articlePane"]').click();
  await page.locator('#confirm').click();await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).display==='none');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  // Imported course identity must survive reload, not silently revert to the build default.
  const imported={...demo,courseMeta:{...demo.courseMeta,id:'another-course',articleTitle:'另一份课程'}};
  const another=path.join(out,'another.course.json');fs.writeFileSync(another,JSON.stringify(imported));await page.locator('#importFile').setInputFiles(another);
  await page.waitForFunction(()=>document.getElementById('title').textContent==='另一份课程');await page.reload();assert.equal(await page.locator('#title').textContent(),'另一份课程');
  // Storage failures must be visible; keep the file export usable.
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}});
  await page.locator('#originalOnly').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存失败'));
  assert.equal(await page.locator('#exportButton').isEnabled(),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['source-preserved','real-reload-save','editorial-edit','custom-rule','real-clipboard-html','export-import-roundtrip','invalid-import-preserves-state','link-validation','imported-course-reload','storage-failure-is-visible','mobile-overflow','console'],screenshots:out},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
