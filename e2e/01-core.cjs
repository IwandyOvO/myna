const { chromium } = require('playwright');
const SP = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  await ctx.addInitScript(() => localStorage.setItem('myna.onboarded.v1', 'true'));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const shot = (n) => page.screenshot({ path: `${SP}/shots/${n}.png` });
  const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, e.message.split('\n').filter(l => /intercept|waiting for|locator|resolved/.test(l)).slice(0,4).join(' // ')); await shot('fail-' + name); } };

  await step('home loads feed', async () => {
    await page.goto('http://localhost:8081/');
    await page.getByText('樱花白桃味可乐（新口味）').first().waitFor({ timeout: 20000 });
    await shot('01-home');
  });
  await step('category chip filters', async () => {
    await page.getByRole('button', { name: '零食' }).first().click();
    await page.getByText('螺蛳粉味薯片').first().waitFor();
    await page.getByRole('button', { name: '推荐' }).first().click();
  });
  await step('blind detail is locked', async () => {
    await page.getByText('樱花白桃味可乐（新口味）').first().click();
    await page.getByText('?.?').waitFor();
    await shot('02-detail-blind');
  });
  await step('rate requires login', async () => {
    await page.getByRole('button', { name: '我也要评价' }).click();
    await page.getByPlaceholder('你的邮箱').waitFor();
  });
  await step('email login (dev code)', async () => {
    await page.getByPlaceholder('你的邮箱').fill('tester@example.com');
    await page.getByRole('checkbox', { name: '我已年满 13 岁' }).click();
    await page.getByRole('button', { name: '发送验证码' }).click();
    await page.getByPlaceholder('6 位验证码').waitFor();
    await shot('03-login');
    await page.getByRole('button', { name: '验证并继续' }).click();
    await page.getByText('?.?').waitFor({ timeout: 10000 });
  });
  await step('rate blind post unlocks distribution', async () => {
    await page.getByRole('button', { name: '我也要评价' }).click();
    await page.getByRole('radio', { name: '吨吨吨' }).click();
    await page.getByPlaceholder('说说为什么给这个分…（可选）').fill('冰镇后真的好喝');
    await shot('04-rate-sheet');
    await page.getByRole('button', { name: '提交评价' }).click();
    await page.getByText('褒贬不一').waitFor({ timeout: 10000 });
    await page.getByText('冰镇后真的好喝').first().waitFor();
    await page.getByRole('button', { name: '修改评价（还可改 3 次）' }).waitFor();
    await shot('05-detail-unlocked');
  });
  await step('edit rating marks edited', async () => {
    await page.getByRole('button', { name: '修改评价（还可改 3 次）' }).click();
    await page.getByRole('radio', { name: '好喝' }).click();
    await page.getByRole('button', { name: '保存修改' }).click();
    await page.getByText('已编辑').first().waitFor();
    await page.getByRole('button', { name: '修改评价（还可改 2 次）' }).waitFor();
  });
  await step('drawer opens with menu', async () => {
    await page.goBack();
    await page.getByRole('button', { name: '打开菜单' }).first().click();
    await page.getByText('链接识品').waitFor();
    await shot('06-drawer');
    await page.getByText('⚙️').click();
    await page.getByText('App 语言').waitFor();
    await shot('07-settings');
  });
  await step('switch to English + dark', async () => {
    await page.getByText('App 语言').click();
    await page.getByRole('radio', { name: 'English' }).click();
    await page.getByRole('button', { name: 'Dark' }).click();
    await page.getByText('App Language').first().waitFor();
    await shot('08-settings-en-dark');
    await page.locator('[aria-label="Back"]:visible').click();
  });
  await step('boards tab (EN, dark)', async () => {
    await page.getByRole('tab', { name: 'Rankings' }).click();
    await page.getByText('蜜桃乌龙气泡水').first().waitFor();
    await shot('09-boards');
    await page.getByRole('button', { name: /Food/ }).click();
    await page.getByRole('button', { name: /Worst Top 20/ }).click();
    await page.getByText('草莓炒肉').first().waitFor();
  });
  await step('publish flow', async () => {
    await page.getByRole('button', { name: 'Ask a Question' }).click();
    await page.getByRole('button', { name: '📅 Event', exact: true }).click();
    await page.getByRole('button', { name: '💼 Career', exact: true }).click();
    await page.getByPlaceholder("e.g. Team outing is a hike — should I go?").waitFor();
    await page.getByPlaceholder("e.g. Team outing is a hike — should I go?").fill('Team bowling night on Friday — worth it?');
    await shot('10-publish');
    await page.getByRole('button', { name: 'Post', exact: true }).filter({ visible: true }).click();
    await page.getByText('Be the first to rate — your take sets the tone').waitFor({ timeout: 10000 });
    await shot('11-published-detail');
  });
  await step('me tab', async () => {
    await page.goto('http://localhost:8081/me');
    await page.getByText('My Badges').waitFor({ timeout: 15000 });
    await page.getByText('My Posts').first().waitFor({ state: 'detached' }).catch(() => {});
    await shot('12-me');
  });
  await step('light zh home screenshot', async () => {
    await page.evaluate(() => localStorage.setItem('myna.settings.v1', JSON.stringify({ appLang: 'system', appearance: 'light', contentLangs: ['zh','en','es','fr','ja','ko','it'] })));
    await page.goto('http://localhost:8081/');
    await page.getByText('樱花白桃味可乐（新口味）').first().waitFor();
  });
  console.log('console errors:', errors.length ? errors.slice(0, 8) : 'none');
  await browser.close();
})();
