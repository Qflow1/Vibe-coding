/* ============================================================
   今日热搜网站 · 逻辑文件（app.js）
   ------------------------------------------------------------
   它负责这几件事：
     1. 拿到数据（现在是本地文件，将来是服务器）
     2. 按热度值排序、算出排名
     3. 渲染成页面上的卡片列表
     4. 响应用户输入的关键词做筛选
     5. 管理四种页面状态：加载中 / 有数据 / 空 / 出错

   ⚠️ 本文件里【取数只写在一个地方】（见下面的 fetchHotList 函数）。
      将来数据源从"本地文件"换成"服务器接口"，只需要改那一个函数。

   【Day 8 更新】取数改成了"异步"（fetchHotList 返回 Promise）。
      这样做的原因：真实后端要发网络请求、要等待、可能失败。
      现在就把结构摆成这样，将来接后端时其余逻辑一行都不用改。
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
      正常情况下不带这些参数，就是 600 毫秒后正常出数据。 */
const DEBUG = (function () {
  const q = new URLSearchParams(location.search);
  return {
    delay:   q.has('slow')  ? Number(q.get('slow')) * 1000 : 600,
    failure: q.get('fail')  === '1',
    forceEmpty: q.get('empty') === '1',
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
  // 键盘也能操作（无障碍）—— 回车或空格等于点击
  card.tabIndex = 0;
  card.addEventListener('keydown', (e) => {
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

  // ── 右边：箭头 ──
  const arrow = document.createElement('div');
  arrow.className = 'card-arrow';
  arrow.textContent = '›';

  card.appendChild(badge);
  card.appendChild(body);
  card.appendChild(arrow);
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

    case 'empty':
      stateEls.empty.hidden = false;
      hintEl.textContent = '没有匹配的内容';
      break;

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

function applyFilter() {
  const keyword = inputEl.value.trim().toLowerCase();   // 去首尾空格 + 转小写

  // 空关键词 → 显示全部（按热度排好序）
  if (keyword === '') {
    showState('list', sortByHeat(allData));
    return;
  }

  // 只在【标题】里找关键词
  const matched = sortByHeat(allData).filter(item =>
    item.title.toLowerCase().includes(keyword)
  );

  if (matched.length === 0) {
    showState('empty');
  } else {
    showState('list', matched);
  }
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
  // ① 先显示"加载中"
  showState('loading');

  // ② 取数（异步）
  fetchHotList()
    .then(data => {
      allData = data;                              // 存一份备用
      // 调试用：?empty=1 时假装一条都没匹配上（用来截"空状态"）
      if (DEBUG.forceEmpty) {
        showState('empty');
        return;
      }
      showState('list', sortByHeat(allData));      // ③ 成功 → 显示卡片列表
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

  // 启动
  loadData();
}

document.addEventListener('DOMContentLoaded', init);
