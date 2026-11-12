import type { Locale } from '@myna/shared';

/**
 * Terms of Service and Privacy Policy shown in the app. They describe what this codebase actually
 * does with data. DRAFT — must be reviewed by a lawyer before public launch (see docs/DEPLOY.md).
 * zh and en are maintained; other UI languages show the English text.
 */
type Doc = { title: string; updated: string; sections: { h: string; p: string }[] };

const PRIVACY: Record<'zh' | 'en', Doc> = {
  zh: {
    title: '隐私政策',
    updated: '更新日期：2026-11',
    sections: [
      { h: '我们收集什么', p: '账号信息：邮箱（或 Apple / Google / Facebook 提供的账号标识与名字）、昵称、头像。\n你发布的内容：帖子、评价、评论与回复、照片。\n可选的位置：仅在你发帖时主动添加位置，或在“附近”页允许定位时使用；我们只保存你添加到帖子上的地点。\n设备信息：推送通知令牌（你允许通知时）、界面语言。' },
      { h: '照片中的位置信息', p: '手机照片常带有拍摄地点（EXIF/GPS）。上传前我们会在服务器上删除这些元数据，只保存图像本身。' },
      { h: '我们如何使用', p: '提供评价、榜单、附近、成就与通知功能；计算均分与月榜；防止滥用（频率限制、举报处理）。我们不出售你的个人信息，也不用于第三方广告。' },
      { h: '崩溃诊断', p: 'App 出错时，我们通过 Sentry 收集错误信息（出错位置、设备型号与系统版本、App 版本，以及你的匿名用户编号），用于修复问题。不包含你的邮箱、IP 或帖子内容。' },
      { h: '谁能看到', p: '帖子、评价分数和你的昵称是公开的。你可以在 设置 → 谁可以看到我的评价 中，把评价文字限制为“关注的人”或“仅自己”（分数仍计入均分）。被你拉黑的人看不到你的内容，你也看不到他们的。' },
      { h: '删除账户', p: '在 设置 → 删除账户 可随时删除。我们会删除你的登录方式、昵称、头像、评论文字、收藏、历史、草稿、通知和推送令牌；你给出的评分以匿名形式保留，以免已有的均分和榜单失真。' },
      { h: '儿童', p: 'Myna 面向 13 岁及以上用户。' },
      { h: '联系我们', p: '有任何问题，请通过 设置 → 意见反馈 联系我们。' },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: 2026-11',
    sections: [
      { h: 'What we collect', p: 'Account: your e-mail (or the account ID and name Apple / Google / Facebook share with us), nickname and avatar.\nYour content: posts, ratings, comments and replies, photos.\nOptional location: only when you add a place to a post or allow location on Nearby; we store only the place you attach to a post.\nDevice: a push notification token (if you allow notifications) and your app language.' },
      { h: 'Location inside photos', p: 'Phone photos often embed where they were taken (EXIF/GPS). Our server removes that metadata before storing the image.' },
      { h: 'How we use it', p: 'To run ratings, charts, Nearby, achievements and notifications; to compute averages and monthly charts; and to prevent abuse (rate limits, handling reports). We do not sell your personal information or use it for third-party advertising.' },
      { h: 'Crash diagnostics', p: 'When the app hits an error we send a report to Sentry (where it failed, device model and OS version, app version and your anonymous user ID) so we can fix it. It does not include your e-mail, IP address or post content.' },
      { h: 'Who can see what', p: 'Posts, rating scores and your nickname are public. In Settings → Who can see my ratings you can limit your rating text to people you follow or only you (the score still counts in averages). People you block cannot see your content and you will not see theirs.' },
      { h: 'Deleting your account', p: 'Settings → Delete account, any time. We delete your sign-in methods, nickname, avatar, comment text, favourites, history, drafts, notifications and push tokens. Your scores stay as anonymous votes so existing averages and charts remain accurate.' },
      { h: 'Children', p: 'Myna is for people aged 13 and over.' },
      { h: 'Contact', p: 'Questions? Reach us via Settings → Send Feedback.' },
    ],
  },
};

const TERMS: Record<'zh' | 'en', Doc> = {
  zh: {
    title: '用户协议',
    updated: '更新日期：2026-11',
    sections: [
      { h: '欢迎使用 Myna', p: 'Myna 让你给任何东西、任何事打分，并听听大家怎么说。使用 Myna 即表示你同意本协议。' },
      { h: '你的内容', p: '你对自己发布的内容负责，并保证有权发布（包括照片）。你保留内容的所有权，并授权 Myna 在提供服务所需的范围内展示、存储和处理这些内容。' },
      { h: '社区规范', p: '有梗但不骂人：禁止辱骂、骚扰、仇恨、色情、违法内容、垃圾广告和刷分（包括使用多个账号操纵评分或榜单）。你可以举报内容或拉黑用户，我们会审核举报并可能删除内容或限制账号。' },
      { h: '评分与榜单', p: '评分是用户的个人意见，不构成专业建议。我们可以调整榜单规则（例如最低评价数）以防止刷榜。' },
      { h: '账号', p: '请保管好你的登录方式。你可以随时删除账户；违反本协议的账号可能被暂停或删除。' },
      { h: '免责声明', p: '服务按“现状”提供。在法律允许的范围内，我们不对因使用或无法使用服务造成的间接损失负责。' },
      { h: '变更', p: '我们可能更新本协议；重大变更会在 App 内提示。继续使用即表示接受更新后的协议。' },
    ],
  },
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: 2026-11',
    sections: [
      { h: 'Welcome to Myna', p: 'Myna lets you rate anything — products and plans alike — and hear what everyone is saying. By using Myna you agree to these terms.' },
      { h: 'Your content', p: 'You are responsible for what you post and confirm you have the right to post it (including photos). You keep ownership and give Myna permission to display, store and process it as needed to run the service.' },
      { h: 'Community rules', p: 'Funny, not mean: no abuse, harassment, hate, sexual or illegal content, spam, or score manipulation (including using several accounts to sway ratings or charts). You can report content and block people; we review reports and may remove content or restrict accounts.' },
      { h: 'Ratings and charts', p: 'Ratings are personal opinions, not professional advice. We may adjust chart rules (such as minimum rating counts) to prevent manipulation.' },
      { h: 'Your account', p: 'Keep your sign-in method secure. You can delete your account at any time; accounts that break these terms may be suspended or removed.' },
      { h: 'Disclaimer', p: 'The service is provided "as is". To the extent permitted by law, we are not liable for indirect losses arising from using or being unable to use it.' },
      { h: 'Changes', p: 'We may update these terms; material changes will be announced in the app. Continuing to use Myna means you accept the updated terms.' },
    ],
  },
};

export const legalDoc = (kind: 'terms' | 'privacy', l: Locale): Doc => (kind === 'terms' ? TERMS : PRIVACY)[l === 'zh' ? 'zh' : 'en'];
