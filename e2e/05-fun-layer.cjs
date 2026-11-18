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
  await step('login', async () => {
    await p.goto('http://localhost:8081/login');
    await p.getByPlaceholder('你的邮箱').fill('fun@example.com');
    await p.getByRole('checkbox', { name: '我已年满 13 岁' }).click();
    await p.getByRole('button', { name: '发送验证码' }).click();
    await p.getByRole('button', { name: '验证并继续' }).click();
    await p.waitForTimeout(1500);
  });
  await step('quick rate: one tap then crowd reveal', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByRole('tab', { name: '快评' })).click();
    await vis(p.getByPlaceholder('一句话吐槽（可选）')).fill('还行吧');
    await p.screenshot({ path: `${SP}/shots/f4-deck.png` });
    await vis(p.getByRole('radio')).click();
    await vis(p.getByText(/你和 \d+% 的人站在一边|少数派|你是第一个评的/)).waitFor({ timeout: 10000 });
    await p.screenshot({ path: `${SP}/shots/f5-deck-reveal.png` });
    await vis(p.getByRole('button', { name: /下一步/ })).click();
    await vis(p.getByPlaceholder('一句话吐槽（可选）')).waitFor();
    await vis(p.getByText(/本次已评 1 个/)).waitFor();
  });
  await step('today's drop rated → streak 1', async () => {
    await vis(p.getByRole('tab', { name: '今日开评' })).click();
    await vis(p.getByText('本周主题')).waitFor({ timeout: 10000 });
    await p.screenshot({ path: `${SP}/shots/f6-daily.png` });
    // The deck may already have served today's question — then it's answered and the streak is running.
    if (!(await p.getByText('今天已评 ✓').filter({ visible: true }).count())) {
      await vis(p.getByText('今天评一下，开始连胜')).waitFor();
      await vis(p.getByRole('radio')).click();
      await vis(p.getByText(/你和 \d+% 的人站在一边|少数派|你是第一个评的/)).waitFor({ timeout: 10000 });
    }
    await vis(p.getByText('🔥 连续 1 天')).waitFor({ timeout: 10000 });
    await p.screenshot({ path: `${SP}/shots/f7-daily-done.png` });
  });
  await step('weekly theme prefills publish', async () => {
    await vis(p.getByRole('button', { name: '发一条' })).click();
    await p.waitForURL(/publish/);
    await p.waitForTimeout(800);
    const body = await p.locator('textarea, input').evaluateAll((els) => els.map((e) => e.value).join('|'));
    if (!body.includes('#最值得上的一门课') && !/#\S/.test(body)) throw new Error('theme not prefilled: ' + body);
    await p.screenshot({ path: `${SP}/shots/f7b-theme-publish.png` });
    await p.goto('http://localhost:8081/');
  });
  await step('me shows taste profile, not reputation', async () => {
    await vis(p.getByRole('tab', { name: '我的' })).click();
    await vis(p.getByText('品味画像')).waitFor();
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
