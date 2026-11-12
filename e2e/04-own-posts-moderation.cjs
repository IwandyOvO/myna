const { chromium } = require('playwright');
const SP = process.argv[2];
const API = 'http://localhost:4000';
(async () => {
  const b = await chromium.launch();
  const errors = [];
  let p;
  const vis = (loc) => loc.filter({ visible: true }).first();
  const step = async (n, f) => { try { await f(); console.log('ok  ', n); } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); await p.screenshot({ path: `${SP}/shots/fail-${n}.png` }); } };

  // Fresh visitor: onboarding shows once.
  const ctx0 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  p = await ctx0.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await step('onboarding shows on first launch and can be finished', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByText('万物皆可评')).waitFor();
    await p.screenshot({ path: `${SP}/shots/o1-onboarding.png` });
    await vis(p.getByRole('button', { name: '下一步' })).click();
    await vis(p.getByText('每类都有专属量表')).waitFor();
    await vis(p.getByRole('button', { name: '下一步' })).click();
    await vis(p.getByRole('button', { name: '开始使用' })).click();
    await vis(p.getByText('樱花白桃味可乐（新口味）')).waitFor();
    await p.reload();
    await vis(p.getByText('樱花白桃味可乐（新口味）')).waitFor();
    if (await p.getByText('万物皆可评').filter({ visible: true }).count()) throw new Error('onboarding shown twice');
  });
  await step('login needs the 13+ checkbox', async () => {
    await p.goto('http://localhost:8081/login');
    await p.getByPlaceholder('你的邮箱').fill('owner-e2e@example.com');
    const send = vis(p.getByRole('button', { name: '发送验证码' }));
    if (!(await send.isDisabled())) throw new Error('send enabled without age confirmation');
    await p.getByRole('checkbox', { name: '我已年满 13 岁' }).click();
    await send.click();
    await vis(p.getByRole('button', { name: '验证并继续' })).click();
    await p.waitForTimeout(1500);
  });
  await step('publish, edit, then delete own post', async () => {
    await p.goto('http://localhost:8081/publish');
    await vis(p.getByPlaceholder('比如：新出的樱花汽水，好喝吗？')).fill('写错字的标提');
    await vis(p.getByRole('button', { name: '发布', exact: true })).click();
    await vis(p.getByText('写错字的标提')).waitFor({ timeout: 10000 });
    await vis(p.getByText('⋯')).click();
    await vis(p.getByText('✏️ 编辑帖子')).click();
    const input = vis(p.locator('input[value="写错字的标提"]'));
    await input.fill('改好了的标题');
    await vis(p.getByRole('button', { name: '保存修改' })).click();
    await vis(p.getByText('改好了的标题')).waitFor();
    await vis(p.getByText(/已编辑/)).waitFor();
    await vis(p.getByText('⋯')).click();
    await vis(p.getByText('🗑 删除帖子')).click();
    await vis(p.getByRole('button', { name: '删除帖子' })).click();
    await p.getByText('帖子已删除').waitFor();
  });
  await step('share button is present on posts', async () => {
    await p.goto('http://localhost:8081/');
    await vis(p.getByText('樱花白桃味可乐（新口味）')).click();
    await vis(p.getByRole('button', { name: '分享' })).waitFor();
  });
  await step('profanity is refused with a friendly message', async () => {
    await p.goto('http://localhost:8081/publish');
    await vis(p.getByPlaceholder('比如：新出的樱花汽水，好喝吗？')).fill('老板是傻逼');
    await vis(p.getByRole('button', { name: '发布', exact: true })).click();
    await p.getByText('内容包含不文明用语，请修改后再发').waitFor();
  });

  // Admin (the seeded demo account is an admin in dev data).
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  await ctx.addInitScript(() => localStorage.setItem('myna.onboarded.v1', 'true'));
  p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  const tok = await (await fetch(`${API}/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: 'foodjudge_007' }) })).json();
  // three users report a comment so it lands in the queue
  const target = (await (await fetch(`${API}/search?q=${encodeURIComponent('螺蛳粉味薯片')}`)).json()).items[0];
  const comment = (await (await fetch(`${API}/posts/${target.id}/comments`)).json()).items[0];
  for (let i = 0; i < 3; i++) {
    const email = `reporter-e2e${i}@example.com`;
    const s = await (await fetch(`${API}/auth/email/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })).json();
    const l = await (await fetch(`${API}/auth/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code: s.devCode, ageConfirmed: true }) })).json();
    await fetch(`${API}/reports`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${l.token}` }, body: JSON.stringify({ commentId: comment.id, reason: 'abuse' }) });
  }
  await p.goto('http://localhost:8081/');
  await p.evaluate((t) => localStorage.setItem('myna.token', t), tok.token);
  await step('admin console lists the auto-hidden comment and restores it', async () => {
    await p.goto('http://localhost:8081/settings');
    await vis(p.getByText('🛡️ 审核后台')).click();
    await vis(p.getByText('3 人举报')).waitFor();
    await vis(p.getByText('已自动隐藏')).waitFor();
    await p.screenshot({ path: `${SP}/shots/o2-admin.png` });
    await vis(p.getByRole('button', { name: '恢复显示' })).click();
    await vis(p.getByText('没有待处理的举报')).waitFor();
  });
  await step('download my data', async () => {
    await p.goto('http://localhost:8081/settings');
    const [dl] = await Promise.all([p.waitForEvent('download'), vis(p.getByText('下载我的数据')).click()]);
    if (dl.suggestedFilename() !== 'myna-data.json') throw new Error('unexpected file ' + dl.suggestedFilename());
  });
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
  await b.close();
})();
