import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const round = process.argv.find(a => a.startsWith('--round='))?.split('=')[1] || 'local';
const results = [], errors = [];
const html = `<!doctype html><meta charset="UTF-8"><link rel="stylesheet" href="/scripts/extensions/third-party/test/style.css">
<style>body{font-family:sans-serif}.test-popup{position:fixed;inset:20px;background:white;color:black;overflow:auto;z-index:1000;padding:15px}.test-close{position:sticky;top:0;float:right;z-index:1001}</style>
<div id="extensions_settings2"></div><textarea id="send_textarea"></textarea><div class="mes_text"><img class="ygo2-card-img" style="width:800px" src="/scripts/extensions/third-party/test/assets/yugioh/card-normal.webp"></div>
<script>
window.__handlers=new Map();window.__slash=[];window.__tools=[];window.__prompts=new Map();window.__inputEvents=0;
document.getElementById('send_textarea').addEventListener('input',()=>window.__inputEvents++);
window.__host={extensionSettings:{'ygo-card-lookup-v2':{apiMode:'off',resultPopup:true,logVerbose:false}},chat:[],chatMetadata:{},extensionPath:'/scripts/extensions/third-party/test/',
saveSettingsDebounced(){},saveMetadata(){},setExtensionPrompt(k,v){__prompts.set(k,v)},registerFunctionTool(t){__tools.push(t)},
eventSource:{on(k,f){const a=__handlers.get(k)||[];a.push(f);__handlers.set(k,a)}},
SlashCommandParser:{addCommandObject(c){__slash.push(c)}},SlashCommand:{fromProps:p=>p},SlashCommandNamedArgument:{fromProps:p=>p},
callGenericPopup(html){return new Promise(resolve=>{const p=document.createElement('div');p.className='test-popup';p.innerHTML='<button class="test-close">关闭</button>'+html;document.body.append(p);p.querySelector('.test-close').onclick=()=>{p.remove();resolve(true)}})}};
window.SillyTavern={getContext:()=>__host};
</script><script src="/scripts/extensions/third-party/test/dist/index.js"></script>`;
const source = (await fs.readFile(path.join(root, 'dist/index.js'), 'utf8')).replace('var __entry = __req(', 'globalThis.__testReq = __req;\nvar __entry = __req(');
const server = http.createServer(async (request, response) => {
    const p = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (p === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
    const prefix = '/scripts/extensions/third-party/test/';
    if (!p.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    const rel = p.slice(prefix.length), target = path.resolve(root, rel);
    if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    try {
        const data = rel === 'dist/index.js' ? source : await fs.readFile(target);
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webp': 'image/webp' };
        response.setHeader('Content-Type', (types[path.extname(rel)] || 'text/plain') + '; charset=utf-8'); response.end(data);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(8000);
    await page.route('**/*', async route => {
        if (route.request().url().startsWith(base + '/')) await route.continue();
        else await route.fulfill({ status: 503, body: 'Offline browser test', headers: { 'access-control-allow-origin': '*' } });
    });
    async function test(name, run) {
        try { await run(); results.push({ name, ok: true }); }
        catch (e) { results.push({ name, ok: false, error: e.stack }); await page.screenshot({ path: path.join(root, 'tools/browser-failure.png') }); }
        finally { await page.evaluate(() => document.querySelectorAll('.test-close').forEach(el => el.click())); }
        console.log((results.at(-1).ok ? 'PASS ' : 'FAIL ') + name);
    }
    async function ready() { await page.evaluate(() => YgoCardLookupV2.ensureBoot()); await page.evaluate(() => YgoCardLookupV2.whenPanelMounted()); }
    await page.goto(base); await ready();
    await test('real browser mounts all panel controls and registers commands/tools', async () => {
        assert.equal(await page.locator('#ygo2_settings').count(), 1);
        const state = await page.evaluate(() => ({ controls: __testReq('src/ui/panel.js').FIELDS.filter(f => f.type !== 'note').every(f => !!document.getElementById('ygo2_' + f.key)), slash: __slash.length, tools: __tools.length }));
        assert.equal(state.controls, true); assert.equal(state.slash, 17); assert.equal(state.tools, 20);
    });
    await test('panel width change updates settings and computed image CSS', async () => {
        await page.locator('#ygo2_cardImgMax').fill('500'); await page.locator('#ygo2_cardImgMax').dispatchEvent('change');
        assert.equal(await page.evaluate(() => __testReq('src/core/settings.js').settings.get('cardImgMax')), 500);
        assert.equal(await page.locator('.mes_text img').evaluate(e => getComputedStyle(e).maxWidth), 'min(100%, 500px)');
    });
    await test('unlimited option selects no-ban mode and card/deck results reflect it', async () => {
        await page.locator('#ygo2_banlistRegion').selectOption({ label: '无限制' });
        const out = await page.evaluate(async () => ({ mode: __testReq('src/core/settings.js').settings.get('banlistRegion'), text: await __testReq('src/data/rules.js').banlistText(null, '青眼白龙'), deck: await __testReq('src/core/registry.js').registry.call('tool:deck', { deck: '4 青眼白龙' }) }));
        assert.equal(out.mode, 'none'); assert.match(out.text, /无禁限规则/); assert.match(out.deck, /同名卡最多 3 张/);
        await page.locator('#ygo2_banlistRegion').selectOption('cn');
    });
    await test('model text and textarea with HTML characters survive panel rendering', async () => {
        const actual = await page.evaluate(() => {
            const panel = __testReq('src/ui/panel.js'); const box = document.createElement('div');
            box.innerHTML = panel.renderControl(panel.FIELDS.find(f => f.key === 'apiUrl'), 'https://x.test/"quoted"') + panel.renderControl(panel.FIELDS.find(f => f.key === 'aliases'), '</textarea><b>literal</b>');
            return { text: box.querySelector('input').value, area: box.querySelector('textarea').value, tags: box.querySelectorAll('b').length };
        });
        assert.equal(actual.text, 'https://x.test/"quoted"'); assert.equal(actual.area, '</textarea><b>literal</b>'); assert.equal(actual.tags, 0);
    });
    await test('shop popup and buy click write the real textarea and dispatch input', async () => {
        await page.evaluate(() => { __pending = __testReq('src/ui/game.js').openShop({ date: '2026-01-01', size: 3 }); });
        await page.locator('[data-ygo2-buy]').first().waitFor(); const name = await page.locator('[data-ygo2-buy]').first().getAttribute('data-ygo2-buy');
        await page.locator('[data-ygo2-buy]').first().click(); assert.equal(await page.locator('#send_textarea').inputValue(), '购买 ' + name);
        assert.ok(await page.evaluate(() => __inputEvents > 0)); await page.locator('.test-close').click();
    });
    await test('card popup resolves query and renders card details', async () => {
        await page.evaluate(() => { __pending = __testReq('src/ui/game.js').openCard({ query: '青眼白龙' }); });
        await page.locator('.test-popup').waitFor(); assert.match(await page.locator('.test-popup').innerText(), /青眼白龙/); await page.locator('.test-close').click();
    });
    await test('DIY editor saves and deletes a card through actual clicks', async () => {
        await page.evaluate(() => { __pending = __testReq('src/ui/diy.js').openDiyEditor(''); });
        await page.locator('#ygo2_diy_name').fill('浏览器测试卡'); await page.locator('#ygo2_diy_category').selectOption('魔法');
        await page.locator('#ygo2_diy_desc').fill('测试效果'); await page.locator('#ygo2_diy_save').click();
        await page.waitForFunction(() => __testReq('src/core/settings.js').settings.get('diyCards').some(c => c.name === '浏览器测试卡' && c.category === '魔法'));
        await page.locator('#ygo2_diy_delete').click(); await page.waitForFunction(() => !__testReq('src/core/settings.js').settings.get('diyCards').some(c => c.name === '浏览器测试卡'));
        await page.locator('.test-close').click();
    });
    await test('DIY editor switches all ten real frames and subtype options', async () => {
        await page.locator('#ygo2_diyFrameMode').selectOption('real');
        await page.evaluate(() => { __pending = __testReq('src/ui/diy.js').openDiyEditor(''); });
        await page.locator('#ygo2_diy_name').fill('卡框测试'); await page.locator('#ygo2_diy_level').fill('4');
        for (const [frame, file] of Object.entries(await page.evaluate(() => __testReq('src/ui/diy.js').REAL_FILES))) {
            const category = ['魔法', '陷阱'].includes(frame) ? frame : '怪兽';
            await page.locator('#ygo2_diy_category').selectOption(category);
            if (category === '怪兽') await page.locator('#ygo2_diy_frame').selectOption(frame);
            await page.waitForFunction(file => { const i = document.querySelector('#ygo2_diy_preview .ygo2-frame'); return i && i.src.endsWith(file) && i.complete && i.naturalWidth > 0; }, file);
            if (category !== '怪兽') {
                await page.locator('#ygo2_diy_subtype').selectOption(category === '魔法' ? '速攻' : '反击');
                await page.waitForFunction(() => Array.from(document.querySelectorAll('#ygo2_diy_preview img')).every(i => i.complete && i.naturalWidth > 0));
                assert.equal(await page.locator('#ygo2_diy_preview img[src$="level.webp"]').count(), 0);
            }
        }
        await page.locator('.test-close').click();
    });
    await test('DIY list honors real/CSS mode and escapes saved card names', async () => {
        await page.evaluate(() => {
            __testReq('src/core/settings.js').settings.set('diyCards', [{ name: '<b>列表测试卡</b>', category: '怪兽', frame: '效果', level: 4, desc: '测试效果' }]);
            __pending = YgoCardLookupV2.PANEL_ACTIONS.diyList();
        });
        await page.waitForFunction(() => { const i = document.querySelector('.test-popup .ygo2-frame'); return i && i.complete && i.naturalWidth > 0; });
        assert.equal(await page.locator('.ygo2-diy-list-name').innerText(), '<b>列表测试卡</b>'); assert.equal(await page.locator('.ygo2-diy-list-name b').count(), 0);
        await page.locator('.test-close').click(); await page.locator('#ygo2_diyFrameMode').selectOption('css');
        await page.evaluate(() => { __pending = YgoCardLookupV2.PANEL_ACTIONS.diyList(); });
        await page.locator('.ygo2-diy-list').waitFor(); assert.equal(await page.locator('.test-popup .ygo2-real').count(), 0);
        await page.locator('.test-close').click(); await page.locator('#ygo2_diyFrameMode').selectOption('real');
        await page.evaluate(() => __testReq('src/core/settings.js').settings.set('diyCards', []));
    });
    await test('broken artwork keeps real frame while broken frame falls back to CSS', async () => {
        await page.evaluate(() => { __pending = __testReq('src/ui/diy.js').openDiyEditor(''); });
        await page.locator('#ygo2_diy_image').fill('/missing-art-test.webp');
        await page.waitForFunction(() => { const i = document.querySelector('#ygo2_diy_preview .ygo2-art'); return i && i.complete && i.naturalWidth === 0 && i.style.visibility === 'hidden'; });
        assert.equal(await page.locator('#ygo2_diy_preview .ygo2-real').count(), 1);
        await page.locator('.test-close').click();
        await page.evaluate(() => { __testReq('src/core/settings.js').settings.set('diyFrameBase', '/missing-frames/'); __pending = __testReq('src/ui/diy.js').openDiyEditor(''); });
        await page.waitForFunction(() => document.querySelector('#ygo2_diy_preview .ygo2-diy-card') && !document.querySelector('#ygo2_diy_preview .ygo2-real'));
        await page.locator('.test-close').click(); await page.evaluate(() => __testReq('src/core/settings.js').settings.set('diyFrameBase', ''));
    });
    await test('all 48 DIY images decode and all ten real card faces render for visual review', async () => {
        const loaded = await page.evaluate(async () => {
            const diy = __testReq('src/ui/diy.js');
            return Promise.all(diy.ASSET_LIST.map(name => new Promise(resolve => { const i = new Image(); i.onload = () => resolve({ name, width: i.naturalWidth }); i.onerror = () => resolve({ name, width: 0 }); i.src = diy.frameBase() + name; })));
        });
        assert.equal(loaded.length, 48); assert.deepEqual(loaded.filter(i => !i.width), []);
        await page.evaluate(() => {
            const diy = __testReq('src/ui/diy.js');
            const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#243752"/><stop offset="1" stop-color="#5a92a0"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="260" r="130" fill="#cbdde5"/><text x="300" y="500" text-anchor="middle" font-size="48" fill="white">DIY 卡图</text></svg>');
            const cards = Object.keys(diy.REAL_FILES).map(frame => diy.cardFaceHtml({ name: frame + '测试卡', category: ['魔法', '陷阱'].includes(frame) ? frame : '怪兽', frame, image, attribute: '光', race: '龙', level: 4, rank: 4, link: 2, scale: 7, atk: 2500, def: 2000, subtype: frame === '魔法' ? '速攻' : frame === '陷阱' ? '反击' : '', desc: '这是测试效果文本。\n用于核对卡图、类型和攻守的位置。' }, 'big'));
            __pending = __host.callGenericPopup('<div id="frame-review" style="display:grid;grid-template-columns:repeat(5,224px);gap:12px;padding:10px;width:max-content">' + cards.join('') + '</div>');
        });
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#frame-review img')).every(i => i.complete && i.naturalWidth > 0));
        assert.equal(await page.locator('#frame-review .ygo2-real').count(), 10);
        await page.locator('#frame-review').screenshot({ path: path.join(root, 'tools/diy-real-frames.png') }); await page.locator('.test-close').click();
    });
    await test('prompt editor changes settings and reset restores defaults', async () => {
        await page.evaluate(() => { __pending = __testReq('src/ui/prompt.js').openPromptEditor(); });
        await page.locator('#ygo2_pe_sheet').fill('自定义提示词'); await page.locator('#ygo2_pe_sheet').dispatchEvent('change');
        assert.equal(await page.evaluate(() => __testReq('src/core/settings.js').settings.get('promptSheet')), '自定义提示词');
        await page.locator('#ygo2_pe_reset').click(); assert.equal(await page.evaluate(() => __testReq('src/core/settings.js').settings.get('promptSheet')), '');
        await page.locator('.test-close').click();
    });
    await test('bundled DIY assets return successful HTTP responses', async () => {
        const out = await page.evaluate(() => __testReq('src/ui/diy.js').checkAssets()); assert.equal(out.missing.length, 0); assert.ok(out.ok.length >= 40);
    });
    await test('deck image slash command reads chat deck and opens generated page', async () => {
        await page.evaluate(() => { __host.chat = [{ is_user: true, mes: '<卡组>3 青眼白龙\n3 灰流丽\n3 栗子球</卡组>' }]; });
        const popupPromise = context.waitForEvent('page');
        await page.evaluate(() => __slash.find(c => c.name === 'ygodeckimage').callback({}, ''));
        const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded'); assert.match(await popup.locator('body').innerText(), /青眼白龙/); await popup.close();
    });
    await test('database installation immediately replaces cached stats', async () => {
        const out = await page.evaluate(async () => {
            const original = await (await fetch('/scripts/extensions/third-party/test/data/card-stats.tsv')).text();
            const imported = await __testReq('src/data/dbimport.js').dbImportFromText('card-stats.tsv', original.replace('青眼白龙', '浏览器测试白龙'));
            return { imported, name: (await __testReq('src/data/cards.js').findCard('89631139')).name };
        });
        assert.equal(out.imported.ok, true); assert.equal(out.name, '浏览器测试白龙');
    });
    await test('clear cache preserves manually installed database', async () => {
        await page.evaluate(() => YgoCardLookupV2.PANEL_ACTIONS.clearCache());
        assert.equal(await page.evaluate(async () => (await __testReq('src/data/cards.js').findCard('89631139')).name), '浏览器测试白龙');
    });
    await test('IndexedDB installation persists across reload', async () => {
        await page.reload(); await ready();
        assert.equal(await page.evaluate(async () => (await __testReq('src/data/cards.js').findCard('89631139')).name), '浏览器测试白龙');
    });
    await test('database uninstall restores bundled stats immediately', async () => {
        await page.evaluate(() => __testReq('src/data/dbimport.js').dbUninstall());
        assert.equal(await page.evaluate(async () => (await __testReq('src/data/cards.js').findCard('89631139')).name), '青眼白龙');
    });
    await test('no uncaught browser JavaScript errors', () => assert.deepEqual(errors, []));
} finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
const output = { round, mode: 'headless installed Chrome; real DOM/IndexedDB; simulated Tavern context; remote requests intentionally 503', pass: results.filter(r => r.ok).length, total: results.length, errors, results };
await fs.writeFile(path.join(root, `tools/test-browser-round-${round}.json`), JSON.stringify(output, null, 2)); console.log(JSON.stringify(output, null, 2));
if (output.pass !== output.total) process.exitCode = 1;
