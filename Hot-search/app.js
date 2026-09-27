/* ============================================================
   今日热搜网站 · 逻辑文件（app.js）
   ------------------------------------------------------------
   它负责这几件事：
     1. 拿到数据（现在是本地文件，将来是服务器）
     2. 按热度值排序、算出排名
     3. 渲染成页面上的卡片列表
     4. 响应用户输入的关键词做筛选
     5. 管理四种页面状态：加载中 / 有数据 / 空 / 出错
     6. 【Day 11】四个交互：复制链接 / 收藏星标 / 展开详情 / 回到顶部

   ⚠️ 本文件里【取数只写在一个地方】（见下面的 fetchHotList 函数）。
      将来数据源从"本地文件"换成"服务器接口"，只需要改那一个函数。

   【Day 8 更新】取数改成了"异步"（fetchHotList 返回 Promise）。
      这样做的原因：真实后端要发网络请求、要等待、可能失败。
      现在就把结构摆成这样，将来接后端时其余逻辑一行都不用改。

   【Day 10 修复】修掉"页面会撒谎"这个真问题。
      症状：网速慢时数据还没到，用户在搜索框里打字 →
            页面立刻说"没有找到相关内容"（其实只是还没到）；
            等数据到了，又完全无视搜索框里的字，把全部 30 条都排出来。
      病根：文件里没有"数据到没到"的记号，筛选和取数两条路各走各的。
      做法：新增 dataReady 记号；applyFilter() 没数据时直接不干活；
            loadData() 取到数据后不再自己喊"显示全部"，改为叫 applyFilter() 决定。
      影响面：只动了本文件 3 处，index.html / style.css / data.js 一个字没碰
              —— 这正是"取数只写在一个地方"那条约定带来的好处。

   【Day 11 新增】四个有反馈的交互。
     ① 复制链接 —— 点了复制这条的搜索链接，按钮变「已复制」再自己变回来
     ② 收藏星标 —— 点了星星填实、"盖"一下；收藏存在浏览器本地，不上传服务器
     ③ 展开详情 —— 点了在卡片下方展开，看同一来源还有哪几条上榜
     ④ 回到顶部 —— 往下滚一段才浮出来，点一下平滑回顶

     ⭐ 贯穿这四个交互的一条规矩：
        【凡是"点一下"引发的动作，都要立刻给出看得见的反馈】——
        按钮变色、文字换成「已复制」、星星弹一下。
        用户点了没反应，就会怀疑"是不是坏了"，然后再点一次。

     ⚠️ 这次踩到的坑：卡片本身就是个"点一下打开搜索"的大按钮，
        所以卡片里每个小按钮都必须【阻止点击冒泡】，
        否则点「复制」会连搜索一起打开。
        统一处理放在 makeCardButton() 里，注释写在那儿。
   ============================================================ */


/* ------------------------------------------------------------
   第 0 步：页面元素 + 运行设置
   ------------------------------------------------------------ */
const listEl    = document.getElementById('hotList');     // 列表容器
const inputEl   = document.getElementById('keywordInput'); // 输入框
const hintEl    = document.getElementById('filterHint');   // 顶部提示文字
const retryBtn  = document.getElementById('retryBtn');     // "重新加载"按钮
const stateEls  = {
  loading: document.getElementById('stateLoading'),  // 加载中
  empty:   document.getElementById('stateEmpty'),    // 没有内容
  error:   document.getElementById('stateError'),    // 出错了
};

/* ---------- Day 11 新增的几处界面元素 ---------- */
const emptyTitleEl = document.getElementById('emptyTitle'); // 空状态的标题
const emptySubEl   = document.getElementById('emptySub');   // 空状态的副标题
const favToggleEl  = document.getElementById('favToggle');  // "只看收藏"开关
const favCountEl   = document.getElementById('favCount');   // 收藏数量小牌子
const backTopEl    = document.getElementById('backToTop');  // "回到顶部"按钮

/* ---------- 开发用开关（接真实后端后可以删掉） ----------
   simulate 用来在【没有后端】的情况下，模拟真实网络的样子：
     delay   —— 假装请求要花 600 毫秒（这样才看得到"加载中"）
     failure —— 设成 true，就假装请求失败了（这样才看得到"出错了"）

   ⚠️ 这两个开关只是为了让四种状态【看得见】。
      将来接上真后端，delay 删掉、failure 永远 false，
      下面的显示逻辑一个字都不用改。

   ⭐【Day 9 追加】支持用网址参数临时覆盖，方便调试时切换状态，
      不用改代码、也不用重新提交：
        · ?slow=8     → 把等待拉长到 8 秒（从容截"加载中"）
        · ?fail=1     → 强制走"出错了"
        · ?empty=1    → 强制走"没有内容"
      正常情况下不带这些参数，就是 600 毫秒后正常出数据。

   【Day 11 追加】?focus=1 → 打开页面就把光标放进搜索框。
      干什么用：按 Tab 键时，焦点会从搜索框开始往后走
      （搜索框 → 只看收藏 → 卡片 → 复制 → 收藏 → 展开 …）。
      这样就能用键盘一路验过去，检查每个按钮是不是都接得上 ——
      这正是"无障碍"要保证的事：不用鼠标也能用完整站。 */
const DEBUG = (function () {
  const q = new URLSearchParams(location.search);
  return {
    delay:   q.has('slow')  ? Number(q.get('slow')) * 1000 : 600,
    failure: q.get('fail')  === '1',
    forceEmpty: q.get('empty') === '1',
    focusInput: q.get('focus') === '1',
  };
})();


/* ------------------------------------------------------------
   ★ 唯一取数口：所有需要数据的地方，都从这里拿
   ------------------------------------------------------------
   现在：从 data.js 里的 HOT_LIST 拿（就是那 30 条）。
   将来：改成 fetch('/api/hot') 之类的真实请求，只动这个函数内部。

   ⚠️ 它返回的是 Promise（"将来才会有结果"的意思）。
      这样写的好处：真实网络请求本来就是异步的，现在结构一致，
      将来把 setTimeout 换成 fetch，外面所有调用都不用改。
   ------------------------------------------------------------ */
function fetchHotList() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (DEBUG.failure) {
        // 假装"请求失败了" —— 用来演示错误状态
        reject(new Error('模拟的请求失败（DEBUG.failure = true）'));
        return;
      }
      if (typeof HOT_LIST === 'undefined') {
        // 真实可能发生的情况：数据文件没加载上 / 字段名被改坏了
        reject(new Error('数据不可用：没有找到 HOT_LIST'));
        return;
      }
      resolve(HOT_LIST);
    }, DEBUG.delay);
  });
}


/* ------------------------------------------------------------
   第 1 步：排序 + 算排名
   ------------------------------------------------------------
   · 按 heat（热度值）从高到低排
   · 排名不是数据里存的，是算出来的
   · 筛选之后要重新编号，所以会被反复调用
   ------------------------------------------------------------ */
function sortByHeat(list) {
  // slice() 先复制一份再排，避免把原数组弄乱
  return list.slice().sort((a, b) => b.heat - a.heat);
}


/* ------------------------------------------------------------
   ★ 【Day 11】四个交互共用的"零件"
   ------------------------------------------------------------
   四个交互各要一套本事，先把共用的几个小工具造在这里。

   ⚠️ 收藏存在哪：浏览器的 localStorage（本地存储）。
      它就是浏览器分给每个网站的一小块"抽屉"（约 5MB），
      关掉浏览器再打开还在，而且【不会上传到任何服务器】。
      注意它是按网址隔离的：本地服务器的收藏、和双击打开文件时的收藏，
      是两个抽屉，互不通用 —— 这是正常的，不是 bug。
   ------------------------------------------------------------ */
const FAV_KEY = 'hotsearch-favorites';

/* 读收藏：存成一个 Set，判断"这条收没收藏"最快 */
let favorites = (function () {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    // ⚠️ 这段 try/catch 不能省：隐私模式等情况下 localStorage 可能直接抛错。
    //    存不了也不能让整个页面崩掉 —— 退化成"这次打开期间有效"就行。
    console.warn('读不到本地收藏（可能是隐私模式），本次收藏只在当前页面有效：', e);
    return new Set();
  }
})();

function saveFavorites() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
  } catch (e) {
    console.warn('收藏存不进本地（可能是隐私模式）：', e);
  }
}

/* 复制一段文字到剪贴板，返回 Promise（true = 成功）
   ⭐ 为什么要写两套：现代剪贴板接口 navigator.clipboard
      只在"安全环境"（https 或 localhost）下才存在。
      咱们这个页面双击打开时是 file://，那时它可能压根没有 ——
      所以必须留一条老路（execCommand）兜底，不能只写一套。 */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text)      // 万一被系统拒绝，退回老办法再试一次
    );
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';    // 挪到屏幕外面去，用户看不见它闪一下
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/* 从全部数据里找出"同一个来源的其它上榜条目"，按热度排，最多要几条 */
function findPeers(item, limit) {
  return sortByHeat(allData)
    .filter(it => it.platform === item.platform && it.title !== item.title)
    .slice(0, limit);
}

/* 把文字里的 < > & " ' 换成安全写法。
   ⚠️ 这是"永远不拿 innerHTML 直接塞数据"的习惯：
      现在数据是咱们自己的，不会有事；但将来数据来自网络，
      标题里万一带了 < 这类符号，直接拼进 HTML 就会把页面结构搞坏。
      现在养成习惯，将来换真数据时不用返工。 */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* ---------- 卡片上两个图标（线条描边，和两侧装饰一个味道） ---------- */
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 3.4 L14.7 9.1 L21 9.9 L16.4 14.2 L17.6 20.4 L12 17.3 ' +
  'L6.4 20.4 L7.6 14.2 L3 9.9 L9.3 9.1 Z"/></svg>';

const CHEV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6 9.5 L12 15.5 L18 9.5"/></svg>';

/* 造一个卡片上的小按钮
   ------------------------------------------------------------
   ⚠️⚠️ 这里的两句 stopPropagation 是【必须】的，不是可选优化：
        卡片整体是个大按钮（点一下打开搜索），
        而小按钮就住在它怀里 —— 点小按钮时，
        点击事件会一路冒泡上去，被卡片的监听器接住，
        结果就是"点了复制，搜索窗口也弹出来了"。
        click 和 keydown 两条路都要拦：键盘用户按回车同样会冒泡。
   ------------------------------------------------------------ */
function makeCardButton(extraClass, ariaLabel, content) {
  const btn = document.createElement('button');
  btn.type = 'button';                 // 明确写出来，免得将来被当成"提交按钮"
  btn.className = 'card-btn ' + extraClass;
  btn.setAttribute('aria-label', ariaLabel);
  btn.title = ariaLabel;               // 鼠标悬停时的小提示
  btn.innerHTML = content;             // 内容全是自己写死的图标/文字，没有外部数据
  btn.addEventListener('click', e => e.stopPropagation());
  btn.addEventListener('keydown', e => e.stopPropagation());
  return btn;
}


/* ------------------------------------------------------------
   ★ 第 2 步：可复用的组件 —— 一张卡片
   ------------------------------------------------------------
   这就是 Day 8 的"余力加练"：把一条数据变成一个卡片元素，
   单独拿出来做成一个函数。

   好处：将来别的页面（比如"收藏列表""搜索历史"）要用同样的卡片，
         直接调这个函数就行，不用重写一遍。

   参数：
     item  —— 一条数据 { title, platform, heat }
     index —— 它在当前列表里的位置（从 0 开始，用来算排名）
   ------------------------------------------------------------ */
function createHotCard(item, index) {
  const rankNo = index + 1;                       // 排名从 1 开始
  const isTop3 = rankNo <= 3;                     // 前三名要特殊照顾

  const card = document.createElement('li');
  card.className = 'hot-card';
  if (isTop3) card.classList.add('is-top3', 'top-' + rankNo);
  card.addEventListener('click', () => openSearch(item.title));
  card.tabIndex = 0;
  // 键盘也能操作（无障碍）—— 回车或空格等于点击
  card.addEventListener('keydown', (e) => {
    // ⚠️【Day 11】只在焦点落在【卡片本身】时才响应。
    //    加了按钮以后，焦点会停在里面的按钮上；
    //    那时按回车如果这里不拦住，就会"既点了按钮、又打开了搜索"。
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSearch(item.title);
    }
  });

  // ── 左边：排名徽章 ──
  const badge = document.createElement('div');
  badge.className = 'card-rank';
  badge.textContent = String(rankNo).padStart(2, '0');

  // ── 中间：标题 + 平台 + 热度 ──
  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = item.title;   // 用 textContent 不用 innerHTML，避免标题里的符号搞乱页面

  const meta = document.createElement('div');
  meta.className = 'card-meta';

  const platform = document.createElement('span');
  platform.className = 'card-platform';
  platform.textContent = item.platform;

  const heat = document.createElement('span');
  heat.className = 'card-heat';
  // 【Day 9】原来是 '🔥 ' + 数值，改成国风的「热度」二字前缀
  heat.textContent = '热度 ' + formatHeat(item.heat);

  meta.appendChild(platform);
  meta.appendChild(heat);

  body.appendChild(title);
  body.appendChild(meta);

  // ── 下方：详情抽屉（Day 11）──
  //    先造一个空盒子收着，等真展开了再往里填内容
  //    （省得一次渲染就生成 30 份详情，白白浪费）
  const detail = document.createElement('div');
  detail.className = 'card-detail';
  detail.hidden = true;
  // ⚠️ 抽屉里的点击不许冒泡 —— 否则"想看详情"会变成"打开了搜索"
  detail.addEventListener('click', e => e.stopPropagation());

  // ── 右边：三个小动作按钮（Day 11）──
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  // ① 复制：把这条的搜索链接复制走
  const copyBtn = makeCardButton('copy-btn', '复制这条的搜索链接', '复制');
  copyBtn.addEventListener('click', () => handleCopy(copyBtn, item));

  // ② 收藏：一颗星。
  //    aria-pressed 是给读屏软件用的 —— 它会念"已按下 / 未按下"，
  //    光靠星星变红，看不见的用户是不知道的。
  const faved = favorites.has(item.title);
  const favBtn = makeCardButton('fav-btn', faved ? '取消收藏' : '收藏', STAR_SVG);
  favBtn.setAttribute('aria-pressed', String(faved));
  if (faved) favBtn.classList.add('is-fav');
  favBtn.addEventListener('click', () => handleFav(favBtn, item));

  // ③ 展开 / 收起详情
  //    aria-expanded 同理：告诉读屏软件"现在展没展开"
  const moreBtn = makeCardButton('more-btn', '展开详情', CHEV_SVG);
  moreBtn.setAttribute('aria-expanded', 'false');
  moreBtn.addEventListener('click', () => toggleDetail(card, detail, moreBtn, item));

  actions.appendChild(copyBtn);
  actions.appendChild(favBtn);
  actions.appendChild(moreBtn);

  card.appendChild(badge);
  card.appendChild(body);
  card.appendChild(actions);
  card.appendChild(detail);
  return card;
}


/* ------------------------------------------------------------
   ★ 第 3 步：可复用的组件 —— 一个卡片列表
   ------------------------------------------------------------
   参数是一组数据，产出是一整个列表（ol 里的内容）。
   这样"数据 → 界面"这一步就被封成了一个小零件。
   ------------------------------------------------------------ */
function createHotList(list) {
  const frag = document.createDocumentFragment();
  list.forEach((item, i) => frag.appendChild(createHotCard(item, i)));
  return frag;
}


/* ------------------------------------------------------------
   ★ 【Day 11】四个交互的动作
   ------------------------------------------------------------ */

/* ① 复制链接
   ------------------------------------------------------------
   ⭐ 反馈分两层，缺一不可：
      · 按钮上的字换成「已复制」—— 说清"发生了什么"
      · 按钮同时变朱砂色    —— 让它在余光里也看得见
      1.6 秒后自己变回去，不用用户再点一次。

   ⚠️ 连续快点两下的坑：如果不清掉上一次的"复原倒计时"，
      第二次点击的反馈会被第一次的定时器提前擦掉，
      看起来就像"第二次点没反应"。 */
function handleCopy(btn, item) {
  const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(item.title);

  copyText(url).then(ok => {
    clearTimeout(btn._resetTimer);        // 先取消上一次的倒计时，再重新开始

    btn.classList.add('is-copied');
    btn.textContent = ok ? '已复制' : '复制失败';

    btn._resetTimer = setTimeout(() => {
      btn.classList.remove('is-copied');
      btn.textContent = '复制';
    }, 1600);
  });
}

/* ② 收藏星标
   ------------------------------------------------------------
   ⭐ "盖一下"那个小动画是精髓：星星猛地放大再弹回来。
      有这一下，用户才会确信"它记住了"。

   ⚠️ 连续快点两下的坑：动画正在播的时候，
      再加同一个 class 是不会重播的 —— 得先把 class 摘掉、
      强迫浏览器重排一次（读一下 offsetWidth），再加回去。 */
function handleFav(btn, item) {
  const wasFaved = favorites.has(item.title);

  if (wasFaved) favorites.delete(item.title);
  else          favorites.add(item.title);
  saveFavorites();

  const nowFaved = !wasFaved;
  btn.classList.toggle('is-fav', nowFaved);
  btn.setAttribute('aria-pressed', String(nowFaved));
  const label = nowFaved ? '取消收藏' : '收藏';
  btn.setAttribute('aria-label', label);
  btn.title = label;

  if (nowFaved) {
    btn.classList.remove('just-faved');
    void btn.offsetWidth;               // 强制重排 → 动画才肯重新播一次
    btn.classList.add('just-faved');
    clearTimeout(btn._stampTimer);
    btn._stampTimer = setTimeout(() => btn.classList.remove('just-faved'), 430);
  }

  updateFavCount();

  // ⚠️ 正开着"只看收藏"时，取消收藏就该让这条从列表里消失 → 重筛一遍。
  //    注意是走 applyFilter（唯一出口），不是自己动手改列表 ——
  //    这是 Day 10 修那个 bug 时定下的规矩。
  if (favOnly) applyFilter();
}

/* ③ 展开 / 收起详情
   ------------------------------------------------------------
   ⭐ "一次只开一个"：几张卡片同时展开的话，
      被顶下去的内容会让页面跳来跳去，很容易点错。
      所以每次展开前，先把别的合上。 */
function toggleDetail(card, detail, btn, item) {
  const willOpen = detail.hidden;      // 先记下这次是要开还是要关

  closeAllDetails();                   // 不管开还是关，先把所有抽屉合上

  if (!willOpen) return;               // 本来就是开着的 → 上面那句就等于"关上"

  renderDetail(detail, item);
  detail.hidden = false;
  btn.classList.add('is-open');
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-label', '收起详情');
  btn.title = '收起详情';
}

function closeAllDetails() {
  if (!listEl) return;
  listEl.querySelectorAll('.card-detail').forEach(d => { d.hidden = true; });
  listEl.querySelectorAll('.more-btn').forEach(b => {
    b.classList.remove('is-open');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', '展开详情');
    b.title = '展开详情';
  });
}

/* 往抽屉里填内容：同一来源还有哪几条上榜 */
function renderDetail(detail, item) {
  const peers = findPeers(item, 3);

  let html = '<p class="detail-label">同来源上榜</p>';

  if (peers.length === 0) {
    html += '<p class="detail-empty">这个来源今天只有这一条上榜</p>';
  } else {
    peers.forEach(p => {
      html += '<p class="detail-peer">' + escapeHtml(p.title) + '</p>';
    });
  }

  // 顺手把"原始数字"给出来 —— 页面上显示的是"92.1万"，
  // 想看个究竟的人可以在这儿看到真实的 921000
  html += '<p class="detail-raw">原始热度 <b>' +
          item.heat.toLocaleString('zh-CN') +
          '</b>　·　排名是按热度算出来的，数据里并不存排名</p>';

  detail.innerHTML = html;
}

/* 更新"只看收藏"旁边那个小数字 */
function updateFavCount() {
  const n = favorites.size;
  if (favCountEl) favCountEl.textContent = String(n);
  if (favToggleEl) {
    favToggleEl.setAttribute('aria-label',
      n === 0 ? '只看收藏，当前还没有收藏' : '只看收藏，已收藏 ' + n + ' 条');
  }
}

/* ④ 回到顶部
   ------------------------------------------------------------
   ⭐ 为什么不一开始就显示这个按钮：
      在列表顶部时本来就够得着，按钮只会白占视线。
      只有【滚远了、回不去了】才浮出来 ——
      它的出现本身就是在提醒："你已经走挺远了"。 */
function initBackToTop() {
  if (!backTopEl) return;

  const THRESHOLD = 420;      // 往下滚过这么多像素才浮出来
  let shown = false;

  backTopEl.addEventListener('click', () => {
    // ⚠️ 系统设了"减少动态效果"就直接跳上去，别做平滑滚动
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  function check() {
    const should = window.scrollY > THRESHOLD;
    if (should === shown) return;    // 状态没变就别动 DOM（滚动事件触发得非常频繁）
    shown = should;
    backTopEl.classList.toggle('is-visible', should);
    // 藏起来时同步 aria-hidden，读屏软件才不会念到一个看不见的按钮
    backTopEl.setAttribute('aria-hidden', String(!should));
  }

  // ⚠️ passive: true 是滚动监听的性能常识：
  //    等于告诉浏览器"这个监听器不会阻止滚动"，滚动就更顺。
  window.addEventListener('scroll', check, { passive: true });
  check();   // 万一一打开就已经在下面了（浏览器会记得上次的滚动位置）
}


/* ------------------------------------------------------------
   第 4 步：页面状态管理（四种状态的总开关）
   ------------------------------------------------------------
   ★ 这就是 Day 8 的核心。

   四种状态互斥，同一时刻只显示一种：
     ① loading —— 正在加载
     ② list    —— 有数据
     ③ empty   —— 没找到内容
     ④ error   —— 出错了

   为什么要写成一个函数：因为状态是"切换"的，
   写成一处，才不会出现"两个状态同时显示"这种乱子。
   ------------------------------------------------------------ */
function showState(state, payload) {
  // 先把四个都藏起来 —— 这一步保证"同一时刻只显示一种"
  listEl.hidden = true;
  stateEls.loading.hidden = true;
  stateEls.empty.hidden = true;
  stateEls.error.hidden = true;

  switch (state) {
    case 'loading':
      stateEls.loading.hidden = false;
      hintEl.textContent = '正在加载…';
      break;

    case 'list':
      listEl.hidden = false;
      listEl.innerHTML = '';
      listEl.appendChild(createHotList(payload));
      updateHint(payload.length);
      break;

    case 'empty': {
      stateEls.empty.hidden = false;
      /* ⭐【Day 11】有两种"空"，得分开说，不然提示就是废话：
           · 收藏夹本来就是空的 → 提示他先去收藏几条
           · 关键词没匹配上     → 提示他换个词
         混在一句"没有找到相关内容"里，收藏夹空的人会以为数据坏了。 */
      const noFav = payload && payload.reason === 'fav';
      emptyTitleEl.textContent = noFav ? '还没有收藏' : '没有找到相关内容';
      emptySubEl.textContent   = noFav ? '点条目右侧的星标，收几条试试' : '换个关键词试试';
      hintEl.textContent = noFav
        ? '收藏夹是空的'
        : (favOnly ? '没有匹配的内容（当前只看收藏）' : '没有匹配的内容');
      break;
    }

    case 'error':
      stateEls.error.hidden = false;
      hintEl.textContent = '出错了';
      // 把具体错误显示出来（开发时很有用；正式上线可以藏起来）
      const detail = document.getElementById('errorDetail');
      if (detail) detail.textContent = payload && payload.message ? payload.message : '';
      break;
  }
}


/* ------------------------------------------------------------
   第 5 步：筛选
   ------------------------------------------------------------
   规则（来自 PRD.md §4.3）：
     · 实时筛选（输入就变，不用按回车）
     · 只管标题，不匹配来源平台
     · 不区分大小写
     · 先去掉首尾空格
     · 只输入空格 → 视为"空"，显示全部，不触发空状态
   ------------------------------------------------------------ */
let allData = [];   // 存一份"原始数据"，筛选时反复用

/* ⭐【Day 10 修复】"数据到没到"的记号。
   初始 false = 数据还在路上。
   为什么要它：下面 applyFilter() 要靠它判断"现在到底能不能筛"，
   免得拿一个空筐子去筛，然后得出"世界上没有"这种错误结论。 */
let dataReady = false;

/* ⭐【Day 11】"只看收藏"开关的状态（false = 看全部） */
let favOnly = false;

function applyFilter() {
  /* ⭐【Day 10 修复】数据还没到 → 什么都不做，让"加载中"继续留着。
     ------------------------------------------------------------
     修复前的毛病：这里不检查数据到没到，直接拿 allData 去筛。
     而此刻 allData 还是空数组 []，筛出 0 条 → 走下面的 showState('empty')
     → 页面撒谎说"没有找到相关内容"。
     其实不是"没有"，是"还没到"。 */
  if (!dataReady) return;

  const keyword = inputEl.value.trim().toLowerCase();   // 去首尾空格 + 转小写

  /* ⭐【Day 11】筛选就像一个漏斗，条件一层层往下过：
       第 ① 层 排序   —— 先把全部按热度排好
       第 ② 层 收藏   —— 开了"只看收藏"就只留收藏过的
       第 ③ 层 关键词 —— 框里有字就只留标题含这个词的

     写成"一层层过滤"而不是"分情况讨论"的好处：
     将来再加条件（比如"只看某个平台"）只需插一层，结构不用动。 */
  let list = sortByHeat(allData);

  if (favOnly) {
    list = list.filter(it => favorites.has(it.title));
  }

  if (keyword !== '') {
    list = list.filter(it => it.title.toLowerCase().includes(keyword));
  }

  // 一条都不剩 → 空状态。
  // ⚠️ 但要分清是哪一种"空"，不然提示就成了废话（见 showState 里的注释）
  if (list.length === 0) {
    const noFav = favOnly && favorites.size === 0;
    showState('empty', { reason: noFav ? 'fav' : 'keyword' });
    return;
  }

  showState('list', list);
}


/* ------------------------------------------------------------
   第 6 步：点击条目 → 新窗口打开百度搜索
   ------------------------------------------------------------
   ⚠️ 两个要点（PRD.md §4.3）：
     1. encodeURIComponent 把标题编码 —— 标题里可能有 & # ? 空格，
        不编码会把网址弄断（例如 & 后面的内容会被丢掉）
     2. window.open(..., '_blank') 开新窗口，当前页面不动
   ------------------------------------------------------------ */
function openSearch(title) {
  const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(title);
  window.open(url, '_blank');
}


/* ------------------------------------------------------------
   第 7 步：两个小工具函数
   ------------------------------------------------------------ */

// 热度值显示得像样一点（≥1万 显示成"xx万"）
// ⚠️ 只影响【显示】，排序用的永远是原始数字（PRD.md §6）
function formatHeat(n) {
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
}

// 顶部那行提示
function updateHint(count) {
  const total = allData.length;

  // 【Day 11】正在"只看收藏"时，这行要说清"收藏了几条、其中筛出几条"。
  // 否则用户看到"共 30 条"，会以为自己根本没开过滤。
  if (favOnly) {
    hintEl.textContent = '只看收藏（' + favorites.size + ' 条）' +
      (count === favorites.size ? '' : ' · 筛出 ' + count + ' 条');
    return;
  }

  hintEl.textContent = count === total
    ? '共 ' + total + ' 条'
    : '筛出 ' + count + ' 条（共 ' + total + ' 条）';
}


/* ------------------------------------------------------------
   第 8 步：加载数据 + 启动
   ------------------------------------------------------------
   把"取数 → 成功显示 / 失败报错"这段单独抽成 loadData()，
   这样【启动时】和【点"重新加载"时】都能调它，不用写两遍。
   ------------------------------------------------------------ */
function loadData() {
  // ① 先显示"加载中"，同时把记号复位（又要开始等了）
  showState('loading');
  dataReady = false;              // ⭐【Day 10 修复】重新加载 → 记号放下

  // ② 取数（异步）
  fetchHotList()
    .then(data => {
      allData = data;                              // 存一份备用
      dataReady = true;                            // ⭐【Day 10 修复】数据到了 → 记号立起

      // 调试用：?empty=1 时假装一条都没匹配上（用来截"空状态"）
      if (DEBUG.forceEmpty) {
        showState('empty');
        return;
      }

      /* ⭐【Day 10 修复】不直接命令"显示全部"，改为叫 applyFilter() 来干活。
         ------------------------------------------------------------
         修复前的毛病：这里写死 showState('list', ...)，看都不看搜索框一眼。
         用户在等待期间打的字就这样被无视 —— 数据一到，全部 30 条哗哗排出来。
         现在两条路并成一条：
           · 搜索框是空的 → 它显示全部（效果和原来一样）
           · 搜索框里有字 → 它筛出匹配的那几条
         以后入口只有一个，不用再担心两边各说各话。 */
      applyFilter();                               // ③ 成功 → 让筛选器决定显示什么
    })
    .catch(err => {
      console.error('取数失败：', err);
      showState('error', err);                     // ③ 失败 → 显示错误状态
    });
}

function init() {
  // 输入框的监听先挂上，用户随时可以打字
  inputEl.addEventListener('input', applyFilter);

  // "重新加载"按钮：点了就重新走一遍取数流程
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      DEBUG.failure = false;   // 手动重试时，把模拟的故障关掉
      loadData();
    });
  }

  /* ⭐【Day 11】"只看收藏"开关
     ⚠️ 点它不直接改列表，而是叫 applyFilter 干活 ——
        和"打字筛选"共用同一个出口。
        Day 10 那个 bug 的教训正是这个：出口越少，越不容易出乱子。 */
  if (favToggleEl) {
    favToggleEl.addEventListener('click', () => {
      favOnly = !favOnly;
      favToggleEl.setAttribute('aria-pressed', String(favOnly));
      applyFilter();
    });
  }

  // 先把上次留下的收藏数量显示出来（收藏是存在本地的，关掉浏览器也在）
  updateFavCount();

  // 【Day 11】"回到顶部"按钮
  initBackToTop();

  // 【调试】?focus=1 → 打开就把光标放进搜索框（方便用键盘 Tab 检查焦点顺序）
  if (DEBUG.focusInput && inputEl) inputEl.focus();

  // 启动
  loadData();
}

document.addEventListener('DOMContentLoaded', init);
