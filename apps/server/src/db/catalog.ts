import type { Category, Locale } from '@myna/shared';
import type { Db } from './pool';
import { createPost } from '../services/posts';

/**
 * Starter catalog for an empty community (cold start): well-known products and everyday dilemmas, posted
 * by the official account with no ratings — so the first visitors have something to rate on day one.
 * Neutral questions only; the verdicts come from real people.
 */
type Item = [Category, string, string, string, Locale]; // category, title, body, emoji, lang

export const CATALOG: Item[] = [
  // drinks
  ['drinks', '元气森林白桃味气泡水', '0 糖 0 卡，到底是真好喝还是心理作用？', '🍑', 'zh'],
  ['drinks', '喜茶 多肉葡萄', '排队半小时值不值？', '🍇', 'zh'],
  ['drinks', '瑞幸 生椰拿铁', '当年的爆款，现在还能打吗？', '🥥', 'zh'],
  ['drinks', '东方树叶 青柑普洱', '"难喝排行榜常客"还是"懂的都懂"？', '🍵', 'zh'],
  ['drinks', '农夫山泉 维他命水', '甜度和口味大家怎么看？', '🧃', 'zh'],
  ['drinks', '可口可乐 零度', '和原味比差多少？', '🥤', 'zh'],
  ['drinks', '霸王茶姬 伯牙绝弦', '新晋网红奶茶，真香吗？', '🧋', 'zh'],
  ['drinks', '椰树牌椰汁', '童年味道还是现在喝不下去？', '🥥', 'zh'],
  ['drinks', 'Starbucks Pumpkin Spice Latte', 'Fall essential or overhyped syrup?', '🎃', 'en'],
  ['drinks', 'Liquid Death Mountain Water', 'Great branding — but is it worth paying for canned water?', '💀', 'en'],
  ['drinks', 'Celsius Energy Drink', 'Better than the usual energy drinks?', '⚡', 'en'],
  ['drinks', 'Olipop Vintage Cola', 'Does "healthy soda" actually taste good?', '🥤', 'en'],
  ['drinks', 'Dr Pepper', 'Unique flavor or medicine in a can?', '🥤', 'en'],
  // snacks
  ['snacks', '卫龙 大面筋', '辣条界的顶流，现在还好吃吗？', '🌶️', 'zh'],
  ['snacks', '乐事 黄瓜味薯片', '"黄瓜味"到底是什么味？', '🥒', 'zh'],
  ['snacks', '旺旺雪饼', '过年必备还是太干了？', '🍘', 'zh'],
  ['snacks', '三只松鼠 每日坚果', '值得天天吃吗？', '🥜', 'zh'],
  ['snacks', '奥利奥 原味', '扭一扭舔一舔泡一泡，你是哪派？', '🍪', 'zh'],
  ['snacks', '良品铺子 猪肉脯', '贵是贵，好吃吗？', '🥓', 'zh'],
  ['snacks', '大白兔奶糖', '经典永流传？', '🍬', 'zh'],
  ['snacks', '螺蛳粉味薯片', '猎奇还是真香？', '🍜', 'zh'],
  ['snacks', "Trader Joe's Dark Chocolate Peanut Butter Cups", 'Better than Reese’s?', '🍫', 'en'],
  ['snacks', "Trader Joe's Everything but the Bagel Seasoning", 'Put it on everything — or overrated?', '🥯', 'en'],
  ['snacks', 'Takis Fuego', 'Too spicy or perfectly spicy?', '🔥', 'en'],
  ['snacks', 'Hot Cheetos', 'Snack of champions?', '🌶️', 'en'],
  ['snacks', 'Pocky Strawberry', 'Classic or too sweet?', '🍓', 'en'],
  ['snacks', 'Doritos Cool Ranch', 'Better than Nacho Cheese?', '🔺', 'en'],
  ['snacks', 'Haribo Goldbears', 'Still the best gummy?', '🐻', 'en'],
  // electronics
  ['electronics', 'AirPods Pro 2', '降噪和通透模式值这个价吗？', '🎧', 'zh'],
  ['electronics', '小米手环', '性价比之王还是功能鸡肋？', '⌚', 'zh'],
  ['electronics', 'Kindle', '买来真的会看书吗？', '📖', 'zh'],
  ['electronics', '大疆 Osmo Pocket', 'vlog 神器还是吃灰神器？', '🎥', 'zh'],
  ['electronics', 'iPhone 16', '升级值不值？', '📱', 'zh'],
  ['electronics', 'Nintendo Switch OLED', 'Worth upgrading from the original?', '🎮', 'en'],
  ['electronics', 'Steam Deck', 'Real PC gaming on the go, or too clunky?', '🕹️', 'en'],
  ['electronics', 'Apple Vision Pro', 'The future — or a very expensive demo?', '🥽', 'en'],
  ['electronics', 'Meta Ray-Ban Smart Glasses', 'Useful or just a camera on your face?', '🕶️', 'en'],
  ['electronics', 'Dyson Airwrap', 'Salon hair at home or overpriced hair dryer?', '💨', 'en'],
  // beauty
  ['beauty', '完美日记 口红', '平价好用还是踩雷？', '💄', 'zh'],
  ['beauty', '理肤泉 B5 修复霜', '换季救星吗？', '🧴', 'zh'],
  ['beauty', '花西子 蜜粉', '颜值高，效果呢？', '🌸', 'zh'],
  ['beauty', 'The Ordinary Niacinamide 10% + Zinc', 'Cheap skincare that works?', '💧', 'en'],
  ['beauty', 'CeraVe Hydrating Cleanser', 'The holy grail cleanser?', '🧼', 'en'],
  ['beauty', 'Glossier You Perfume', 'Smells like "you" or smells like nothing?', '🌫️', 'en'],
  ['beauty', 'Rare Beauty Liquid Blush', 'One dot is enough — true?', '🌷', 'en'],
  // food / dining
  ['food', '海底捞', '服务是好，味道值这个价吗？', '🍲', 'zh'],
  ['food', '萨莉亚', '穷鬼天堂还是真心好吃？', '🍝', 'zh'],
  ['food', '麦当劳 麦辣鸡腿堡', '永远的神？', '🍔', 'zh'],
  ['food', '肯德基 疯狂星期四', '真的划算吗？', '🍗', 'zh'],
  ['food', '沙县小吃', '国民快餐靠谱吗？', '🥟', 'zh'],
  ['food', '必胜客', '现在还值得去吗？', '🍕', 'zh'],
  ['food', 'Chipotle Burrito Bowl', 'Still worth it at today’s prices?', '🌯', 'en'],
  ['food', 'In-N-Out Double-Double', 'Best fast-food burger?', '🍔', 'en'],
  ['food', "Costco Hot Dog Combo", 'The best deal in food?', '🌭', 'en'],
  ['food', 'Chick-fil-A Chicken Sandwich', 'Lives up to the hype?', '🐔', 'en'],
  ['food', 'Sweetgreen', 'Healthy lunch or $18 salad?', '🥗', 'en'],
  // household
  ['household', '名创优品 香薰', '便宜好闻还是刺鼻？', '🕯️', 'zh'],
  ['household', '扫地机器人', '解放双手还是添乱？', '🤖', 'zh'],
  ['household', '宜家 BLÅHAJ 鲨鱼', '抱着睡真的治愈吗？', '🦈', 'zh'],
  ['household', 'Stanley Quencher Tumbler', 'Worth the cult following?', '🥤', 'en'],
  ['household', 'Instant Pot', 'Kitchen hero or cabinet clutter?', '🍲', 'en'],
  ['household', 'Air Fryer', 'Does it really replace your oven?', '🍟', 'en'],
  // life
  ['life', '早起打卡 5 点起床', '人生赢家的秘密还是自我折磨？', '⏰', 'zh'],
  ['life', '周末 citywalk', '新潮生活方式还是换个说法的散步？', '🚶', 'zh'],
  ['life', '断舍离', '真的会让生活更好吗？', '🧹', 'zh'],
  ['life', 'Cold plunges', 'Life-changing or just cold?', '🧊', 'en'],
  ['life', 'Duolingo streaks', 'Actually learning or just keeping the owl happy?', '🦉', 'en'],
  // love
  ['love', '第一次约会 AA', '合理还是扫兴？', '💸', 'zh'],
  ['love', '异地恋', '值得坚持吗？', '💌', 'zh'],
  ['love', 'Dating apps in 2026', 'Still worth it?', '📱', 'en'],
  ['love', 'Matching couple outfits', 'Cute or cringe?', '👕', 'en'],
  // work
  ['work', '团建爬山', '增进感情还是变相加班？', '⛰️', 'zh'],
  ['work', '周末加班', '该不该接？', '💼', 'zh'],
  ['work', 'Return-to-office mandates', 'Good for teams or just commutes?', '🏢', 'en'],
  ['work', 'Open-plan offices', 'Collaboration or chaos?', '🗣️', 'en'],
  // family
  ['family', '过年回家催婚', '你家是哪种？', '🧧', 'zh'],
  ['family', '和父母住', '省钱还是窒息？', '🏠', 'zh'],
  ['family', 'Kids and screen time', 'Fine in moderation or avoid it?', '📺', 'en'],
  // education
  ['education', '考研', '值不值得？', '📚', 'zh'],
  ['education', '大学选修课 摸鱼', '该水还是该学？', '🎓', 'zh'],
  ['education', 'Online coding bootcamps', 'Career change ticket or expensive course?', '💻', 'en'],
  ['education', 'Gap year', 'Smart move or falling behind?', '🌍', 'en'],
];

/** Handle of the account that owns catalog posts. */
export const OFFICIAL_HANDLE = 'myna';

/**
 * Seeds the catalog when the community is (nearly) empty. Idempotent: titles the official account
 * already posted are skipped, and it does nothing once there are 20+ active posts.
 */
export async function seedCatalog(db: Db, log: (msg: string) => void = () => {}): Promise<number> {
  const active = Number((await db.query("SELECT count(*) AS n FROM posts WHERE status = 'active'")).rows[0].n);
  if (active >= 20) return 0;
  let official = (await db.query<{ id: string }>('SELECT id FROM users WHERE handle = $1', [OFFICIAL_HANDLE])).rows[0];
  if (!official) {
    official = (
      await db.query<{ id: string }>(
        "INSERT INTO users (nickname, handle, avatar, age_confirmed_at) VALUES ('Myna 官方', $1, '🐦', now()) RETURNING id",
        [OFFICIAL_HANDLE],
      )
    ).rows[0]!;
  }
  const existing = new Set((await db.query<{ title: string }>('SELECT title FROM posts WHERE author_id = $1', [official.id])).rows.map((r) => r.title));
  let n = 0;
  // Oldest first so the list reads in catalog order when sorted by newest.
  for (const [category, title, body, emoji, lang] of [...CATALOG].reverse()) {
    if (existing.has(title)) continue;
    await createPost(db, official.id, { category, title, body, emoji, lang });
    n++;
  }
  if (n) log(`starter catalog: ${n} posts`);
  return n;
}
