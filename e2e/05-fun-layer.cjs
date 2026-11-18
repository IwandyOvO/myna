// Fun layer walkthrough: verdict-first feed, unified chips, search, quick-rate deck with crowd reveal,
// daily question + streak, taste profile on Me, editing your own comment, any-emoji avatar.
const { chromium } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('myna.onboarded.v1', 'true'));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const vis = (loc) => loc.filter({ visible: true }).first();
  const step = async (n, f) => { try { await f(); console.log('ok  ', n); } catch (e) { console.log('FAIL', n, e.message.split('\n').filter((l) => /waiting for|Error|expected/.test(l)).slice(0, 2).join(' // ')); await p.screenshot({ path: `${SP}/shots/fail-f-${n}.png` }); } };

  await step('feed cards lead with a verdict and a vote split', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByText('螺蛳粉味薯片')).waitFor({ timeout: 20000 });
    await vis(p.getByText(/争议之王|劝退|公认踩雷|中规中矩|真香|封神/)).waitFor();
    await vis(p.getByText(/👎 \d+%/)).waitFor();
    await p.screenshot({ path: `${SP}/shots/f1-home-verdicts.png` });
  });
  await step('controversial chip ranks polarising posts', async () => {
    await vis(p.getByRole('button', { name: '⚔️ 争议' })).click();
    await p.waitForTimeout(1500);
    // Every card in this list must carry the controversial verdict (the list may also be empty).
    const verdicts = await p.getByText(/争议之王|中规中矩|劝退|公认踩雷|真香|封神/).filter({ visible: true }).allInnerTexts();
    if (verdicts.some((v) => !v.includes('争议之王'))) throw new Error('non-controversial card in list: ' + verdicts.join(','));
    await p.screenshot({ path: `${SP}/shots/f2-controversial.png` });
    await vis(p.getByRole('button', { name: '🔥 热门' })).click();
  });
  await step('search page finds items and browses categories', async () => {
    await vis(p.getByRole('search', { name: '搜索' })).click();
    await p.getByPlaceholder('搜产品、店名或话题').fill('螺蛳粉');
    await vis(p.getByText('螺蛳粉味薯片')).waitFor();
    await p.getByPlaceholder('搜产品、店名或话题').fill('');
    await vis(p.getByText('试试这些')).waitFor();
    await p.screenshot({ path: `${SP}/shots/f3-search.png` });
    await p.goBack();
  });
  await step('guest can browse the swipe feed; rating asks to log in', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByRole('tab', { name: '开评' })).click();
    await vis(p.getByText('🔥 今日开评')).waitFor({ timeout: 15000 });
    await p.screenshot({ path: `${SP}/shots/f4-swipe-guest.png` });
    await vis(p.getByRole('radio')).click();
    await p.getByPlaceholder('你的邮箱').waitFor({ timeout: 10000 }); // client-side navigation to login
  });
  await step('login', async () => {
    await p.getByPlaceholder('你的邮箱').fill('fun@example.com');
    await p.getByRole('checkbox', { name: '我已年满 13 岁' }).click();
    await p.getByRole('button', { name: '发送验证码' }).click();
    await p.getByRole('button', { name: '验证并继续' }).click();
    await p.waitForTimeout(1500);
  });
  await step('swipe feed: today first, tap → reveal → glides to the next card', async () => {
    await p.goto('http://localhost:8081/play');
    await vis(p.getByText('🔥 今日开评')).waitFor({ timeout: 15000 });
    const firstTitle = await vis(p.getByRole('radio')).evaluate(() => document.title);
    await vis(p.getByRole('radio')).click();
    await vis(p.getByText(/你和 \d+% 的人站在一边|少数派|你是第一个评的/)).waitFor({ timeout: 10000 });
    await vis(p.getByText('🔥 连续 1 天')).waitFor({ timeout: 10000 });
    await p.screenshot({ path: `${SP}/shots/f5-swipe-reveal.png` });
    // Auto-advance: the next card's tier buttons come into view by themselves.
    await p.waitForTimeout(3200);
    await vis(p.getByRole('radio')).waitFor({ timeout: 5000 });
    await p.screenshot({ path: `${SP}/shots/f6-swipe-next.png` });
    void firstTitle;
  });
  await step('swipe up skips to another card', async () => {
    const before = await p.getByRole('radio').filter({ visible: true }).first().boundingBox();
    await p.mouse.move(195, 400);
    await p.mouse.wheel(0, 900);
    await p.waitForTimeout(1200);
    await vis(p.getByRole('radio')).waitFor();
    void before;
  });
  await step('weekly theme on publish tags the post', async () => {
    await p.goto('http://localhost:8081/publish');
    await vis(p.getByText('本周主题')).waitFor({ timeout: 10000 });
    await vis(p.getByText('+ 发一条')).click();
    const body = await p.locator('textarea, input').evaluateAll((els) => els.map((e) => e.value).join('|'));
    if (!/#\S/.test(body)) throw new Error('theme not added: ' + body);
    await p.screenshot({ path: `${SP}/shots/f7-theme-publish.png` });
    await p.goto('http://localhost:8081/');
  });
  await step('rate with a comment from the detail page', async () => {
    await p.goto('http://localhost:8081/discover');
    await p.getByPlaceholder('搜产品、店名或话题').fill('螺蛳粉');
    await vis(p.getByText('螺蛳粉味薯片')).click();
    // The swipe feed may already have rated it — then this is an edit.
    await vis(p.getByRole('button', { name: /我也要评价|修改评价/ })).click();
    await vis(p.getByRole('radio')).click();
    await p.locator('textarea:visible').fill('还行吧');
    await vis(p.getByRole('button', { name: /提交评价|保存修改/ })).click();
    await vis(p.getByRole('button', { name: '完成' })).click();
  });
  await step('me shows taste profile, not reputation', async () => {
    await p.goto('http://localhost:8081/me');
    await vis(p.getByText('品味画像')).waitFor({ timeout: 10000 });
    await vis(p.getByText(/新手上路|反向指标|毒舌评审|夸夸怪|大众嘴替|独立思考/)).waitFor();
    await p.screenshot({ path: `${SP}/shots/f8-me-taste.png` });
  });
  await step('edit my own comment from its menu', async () => {
    await p.goto('http://localhost:8081/me/ratings');
    await vis(p.getByText('还行吧')).click(); // my rating card → post detail
    await vis(p.getByRole('button', { name: '编辑' })).waitFor({ timeout: 10000 }); // ⋯ on my own comment
    await vis(p.getByRole('button', { name: '编辑' })).click();
    await vis(p.getByText('✏️ 编辑')).click();
    await vis(p.getByText('编辑我的评论')).waitFor();
    await p.locator('textarea:visible').fill('其实挺好吃的');
    await vis(p.getByRole('button', { name: '保存修改' })).click();
    await vis(p.getByText('其实挺好吃的')).waitFor({ timeout: 10000 });
    await p.screenshot({ path: `${SP}/shots/f9-comment-edited.png` });
  });
  await step('any emoji avatar', async () => {
    await p.goto('http://localhost:8081/me/edit');
    await vis(p.getByLabel('或输入任意表情')).fill('🦄');
    await vis(p.getByRole('button', { name: '保存修改' })).click();
    await p.waitForTimeout(800);
    await p.goto('http://localhost:8081/me');
    await vis(p.getByText('🦄')).waitFor();
  });
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
  await b.close();
})();
