const { chromium } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const vis = (loc) => loc.filter({ visible: true }).first();
  const step = async (n, f) => { try { await f(); console.log('ok  ', n); } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); await p.screenshot({ path: `${SP}/shots/fail-${n}.png` }); } };

  await step('home header shows bird only', async () => {
    await p.goto('http://localhost:8081/');
    await p.getByText('樱花白桃味可乐（新口味）').first().waitFor({ timeout: 20000 });
    const logo = vis(p.getByRole('img', { name: 'Myna' }));
    const box = await logo.boundingBox();
    if (!box || box.width > 60) throw new Error('header logo too wide: ' + JSON.stringify(box));
    await p.screenshot({ path: `${SP}/shots/n1-home.png` });
  });
  await step('login', async () => {
    await p.goto('http://localhost:8081/login');
    await p.getByPlaceholder('你的邮箱').fill('night@example.com');
    await p.getByRole('button', { name: '发送验证码' }).click();
    await p.getByRole('button', { name: '验证并继续' }).click();
    await p.waitForTimeout(1500);
  });
  await step('favorite from detail + blind countdown', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByText('樱花白桃味可乐（新口味）')).click();
    await p.getByText(/盲评中 · \d+ 小时后公开/).waitFor();
    await vis(p.getByRole('button', { name: '收藏' })).click();
    await p.getByText('已加入收藏').waitFor();
    await p.screenshot({ path: `${SP}/shots/n2-detail.png` });
  });
  await step('author profile + follow', async () => {
    await vis(p.getByText(/奶茶去冰三分糖 ·/)).click();
    await vis(p.getByRole('button', { name: '关注' })).click();
    await p.getByText('已关注').first().waitFor();
    await p.screenshot({ path: `${SP}/shots/n3-profile.png` });
  });
  await step('me quick access → favorites, history, following', async () => {
    await p.goto('http://localhost:8081/me/favorites');
    await vis(p.getByText('樱花白桃味可乐（新口味）')).waitFor();
    await p.goto('http://localhost:8081/me/history');
    await vis(p.getByText('樱花白桃味可乐（新口味）')).waitFor();
    await p.screenshot({ path: `${SP}/shots/n4-history.png` });
    await p.goto('http://localhost:8081/me/following');
    await vis(p.getByText('奶茶去冰三分糖')).waitFor();
  });
  await step('draft autosave on leaving publish, then resume', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByRole('button', { name: '发布提问' })).click();
    await vis(p.getByPlaceholder('比如：新出的樱花汽水，好喝吗？')).fill('还没想好的草稿标题');
    await p.waitForTimeout(300);
    await vis(p.getByRole('button', { name: '返回' })).click();
    await p.getByText('已存入草稿箱').waitFor({ timeout: 8000 });
    await p.goto('http://localhost:8081/me/drafts');
    await vis(p.getByText('还没想好的草稿标题')).click();
    await p.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '还没想好的草稿标题'), null, { timeout: 8000 });
    await p.screenshot({ path: `${SP}/shots/n5-draft-resumed.png` });
  });
  await step('likes received page renders', async () => {
    await p.goto('http://localhost:8081/me/likes');
    await vis(p.getByText('这里还没有内容')).waitFor();
  });
  await step('me page quick access navigates', async () => {
    await p.goto('http://localhost:8081/me');
    await vis(p.getByRole('button', { name: /我的收藏/ })).click();
    await p.waitForURL(/me\/favorites/);
  });
  await step('achievements: challenge + leaderboard', async () => {
    await p.goto('http://localhost:8081/achievements');
    await vis(p.getByText('本周内评价 5 个新品')).waitFor();
    await vis(p.getByText('成就达人榜')).waitFor();
    await vis(p.getByText('干饭鉴黄师')).waitFor();
    await p.screenshot({ path: `${SP}/shots/n6-achievements.png`, fullPage: true });
  });
  await step('comment ⋯ → report', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByText('螺蛳粉味薯片')).click();
    await vis(p.getByRole('button', { name: '举报' })).click();
    await vis(p.getByRole('button', { name: '辱骂或骚扰' })).click();
    await p.getByText('已收到举报，我们会尽快处理').waitFor();
  });
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
  await b.close();
})();
