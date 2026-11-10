const { chromium } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const vis = (loc) => loc.filter({ visible: true }).first();
  const mk = async (email) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://localhost:8081/login');
    await p.getByPlaceholder('你的邮箱').fill(email);
    await p.getByRole('button', { name: '发送验证码' }).click();
    await p.getByRole('button', { name: '验证并继续' }).click();
    await p.waitForTimeout(1500);
    return p;
  };
  let p;
  const step = async (n, f) => { try { await f(); console.log('ok  ', n); } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); await p.screenshot({ path: `${SP}/shots/fail-${n}.png` }); } };
  const alice = await mk('alice@example.com');
  const bob = await mk('bob2@example.com');
  p = alice;
  await step('alice rates a post (comment appears)', async () => {
    await alice.goto('http://localhost:8081/');
    await vis(alice.getByText('食堂新出的黄焖鸡')).click();
    await vis(alice.getByRole('button', { name: '我也要评价' })).click();
    await vis(alice.getByRole('radio', { name: '下饭' })).click();
    await vis(alice.getByPlaceholder('说说为什么给这个分…（可选）')).fill('鸡肉很嫩');
    await vis(alice.getByRole('button', { name: '提交评价' })).click();
    await vis(alice.getByText('鸡肉很嫩')).waitFor();
  });
  p = bob;
  await step('bob replies to alice', async () => {
    await bob.goto('http://localhost:8081/');
    await vis(bob.getByText('食堂新出的黄焖鸡')).click();
    await vis(bob.getByText('鸡肉很嫩')).waitFor();
    // the "回复" link under alice's comment (alice's comment has the most recent reply link near it)
    const row = bob.locator('div').filter({ hasText: '鸡肉很嫩' }).filter({ hasText: /^.*回复.*$/ }).last();
    await row.getByText('回复', { exact: true }).last().scrollIntoViewIfNeeded();
    await row.getByText('回复', { exact: true }).last().click();
    await vis(bob.getByPlaceholder(/回复 alice/)).fill('同感，下次还点');
    await bob.screenshot({ path: `${SP}/shots/r1-reply-bar.png` });
    await vis(bob.getByRole('button', { name: '发送' })).click();
    await bob.getByText('回复已发送').waitFor();
    await vis(bob.getByText('同感，下次还点')).waitFor();
    await bob.screenshot({ path: `${SP}/shots/r2-thread.png` });
  });
  p = alice;
  await step('alice sees bell badge and the reply notification', async () => {
    await alice.goto('http://localhost:8081/');
    await vis(alice.getByText('食堂新出的黄焖鸡')).waitFor();
    await alice.waitForTimeout(800);
    await alice.screenshot({ path: `${SP}/shots/r3-bell.png`, clip: { x: 0, y: 0, width: 390, height: 70 } });
    await vis(alice.getByRole('button', { name: '消息' })).click();
    await vis(alice.getByText(/bob2 回复了你/)).waitFor();
    await alice.screenshot({ path: `${SP}/shots/r4-inbox.png` });
    await vis(alice.getByText(/bob2 回复了你/)).click();
    await alice.waitForURL(/\/post\//);
  });
  await step('last season sheet on rankings', async () => {
    await alice.goto('http://localhost:8081/boards');
    await vis(alice.getByText(/上期（\d{4}-\d{2}）榜单/)).click();
    await vis(alice.getByText('蜜桃乌龙气泡水')).waitFor();
    await alice.screenshot({ path: `${SP}/shots/r5-last-season.png` });
  });
  await step('settings has notification switches', async () => {
    await alice.goto('http://localhost:8081/settings');
    await vis(alice.getByText('互动提醒')).waitFor();
    await vis(alice.getByText('上榜与徽章提醒')).waitFor();
  });
  await step('edit profile (nickname + avatar)', async () => {
    await alice.goto('http://localhost:8081/me/edit');
    const input = vis(alice.getByLabel('昵称'));
    await input.fill('爱丽丝');
    await vis(alice.getByRole('radio', { name: '🦊' })).click();
    await vis(alice.getByRole('button', { name: '保存修改' })).click();
    await alice.getByText('已保存').waitFor();
    await alice.goto('http://localhost:8081/me');
    await vis(alice.getByText('爱丽丝')).waitFor();
  });
  await step('legal pages + feedback', async () => {
    await alice.goto('http://localhost:8081/settings');
    await vis(alice.getByText('隐私政策')).click();
    await vis(alice.getByText('照片中的位置信息')).waitFor();
    await alice.goto('http://localhost:8081/settings');
    await vis(alice.getByText('意见反馈')).click();
    await vis(alice.getByPlaceholder(/想对我们说点什么/)).fill('很喜欢盲评功能');
    await vis(alice.getByRole('button', { name: '发送' })).click();
    await alice.getByText('感谢反馈！').waitFor();
  });
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
  await b.close();
})();
