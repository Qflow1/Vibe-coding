/* ============================================================
   今日热搜网站 · 逻辑文件（app.js）
   ------------------------------------------------------------
   它负责四件事：
     1. 拿到数据
     2. 按热度值排序、算出排名
     3. 渲染成页面上的列表
     4. 响应用户输入的关键词做筛选

   ⚠️ 本文件里【取数只写在一个地方】（见下面的 getAllData 函数）。
      将来数据源从"本地文件"换成"服务器接口"，只需要改那一个函数，
      下面的排序、渲染、筛选逻辑一行都不用动。
   ============================================================ */


/* ------------------------------------------------------------
   第 0 步：拿到页面上的元素，存起来备用
   ------------------------------------------------------------
   document.getElementById('xxx') 的意思是：
     "去页面里找到 id 叫 xxx 的那个元素"。
   找到之后存进变量，后面反复用，不用每次都去找一遍。
   ------------------------------------------------------------ */
const listEl  = document.getElementById('hotList');    // 列表容器（ol）
const inputEl = document.getElementById('keywordInput'); // 输入框
const emptyEl = document.getElementById('emptyState');   // 空状态提示
const hintEl  = document.getElementById('filterHint');   // 筛选结果提示


/* ------------------------------------------------------------
   ★ 唯一取数口：所有需要数据的地方，都从这里拿
   ------------------------------------------------------------
   现在：从 data.js 里的 HOT_LIST 拿（就是那 30 条）。
   将来：改成向服务器要数据，只动这个函数内部的写法。
   ------------------------------------------------------------ */
function getAllData() {
  return HOT_LIST;
}


/* ------------------------------------------------------------
   第 1 步：排序 + 算排名
   ------------------------------------------------------------
   规则（来自 PRD.md §4.2）：
     · 按 heat（热度值）从高到低排
     · 排名不是数据里存的，是这里【算出来】的
     · 筛选之后要重新编号，所以这个函数会被反复调用
   ------------------------------------------------------------ */
function sortByHeat(list) {
  // slice() 是"复制一份再排"，避免把原数组也弄乱了
  // sort() 里的 (a, b) => b.heat - a.heat 意思是：大的排前面
  return list.slice().sort((a, b) => b.heat - a.heat);
}


/* ------------------------------------------------------------
   第 2 步：把一条数据变成页面上的一个列表项（DOM 元素）
   ------------------------------------------------------------
   小知识：把数字变成两位数（1 → "01"），用 padStart(2, '0')
     —— "1".padStart(2, "0") 结果是 "01"
   ------------------------------------------------------------ */
function createItemEl(item, index) {
  const li = document.createElement('li');
  li.className = 'hot-item';
  // 点击时跳去百度搜索这条标题（见第 5 步）
  li.addEventListener('click', () => openSearch(item.title));

  // 排名
  const rank = document.createElement('span');
  rank.className = 'item-rank';
  rank.textContent = String(index + 1).padStart(2, '0');
  // 前三名加个特殊样式（gold / silver / bronze）
  if (index < 3) rank.classList.add('top-' + (index + 1));

  // 中间：标题 + 来源平台
  const main = document.createElement('div');
  main.className = 'item-main';

  const title = document.createElement('p');
  title.className = 'item-title';
  title.textContent = item.title;   // 用 textContent 而不是 innerHTML，避免标题里的特殊符号搞乱页面

  const meta = document.createElement('p');
  meta.className = 'item-meta';
  meta.textContent = item.platform + ' · 热度 ' + formatHeat(item.heat);

  main.appendChild(title);
  main.appendChild(meta);

  // 右侧：一个箭头，暗示"可以点"
  const arrow = document.createElement('span');
  arrow.className = 'item-arrow';
  arrow.textContent = '›';

  li.appendChild(rank);
  li.appendChild(main);
  li.appendChild(arrow);
  return li;
}


/* ------------------------------------------------------------
   第 3 步：渲染列表
   ------------------------------------------------------------
   render(数据数组) 会：
     · 先把列表清空（否则会越堆越多）
     · 再一条条生成、塞进去
     · 顺便决定"显示列表"还是"显示空状态"
   ------------------------------------------------------------ */
function render(list) {
  listEl.innerHTML = '';   // 清空

  if (list.length === 0) {
    // 没有结果 → 藏起列表，显示空状态
    listEl.hidden = true;
    emptyEl.hidden = false;
  } else {
    listEl.hidden = false;
    emptyEl.hidden = true;

    // DocumentFragment：可以先在"后台"把 30 条都拼好，
    // 最后一次性放进页面 —— 比一条一条插要快。
    const frag = document.createDocumentFragment();
    list.forEach((item, i) => frag.appendChild(createItemEl(item, i)));
    listEl.appendChild(frag);
  }

  // 顶部那行小提示（共几条 / 筛出几条）
  updateHint(list.length);
}


/* ------------------------------------------------------------
   第 4 步：筛选
   ------------------------------------------------------------
   规则（来自 PRD.md §4.3）：
     · 实时筛选（输入就变，不用按回车）
     · 只管标题，不匹配来源平台
     · 不区分大小写
     · 先去掉首尾空格
     · 只输入空格 → 视为"空"，显示全部，不触发空状态
   ------------------------------------------------------------ */
function applyFilter() {
  const raw = inputEl.value;
  const keyword = raw.trim().toLowerCase();   // 去首尾空格 + 转小写

  if (keyword === '') {
    // 空关键词 → 显示全部 30 条
    render(sortByHeat(getAllData()));
    return;
  }

  const all = sortByHeat(getAllData());
  // filter 是"留一部分"：标题里包含关键词的才留下
  const matched = all.filter(item =>
    item.title.toLowerCase().includes(keyword)
  );
  render(matched);
}


/* ------------------------------------------------------------
   第 5 步：点击条目 → 新窗口打开百度搜索
   ------------------------------------------------------------
   ⚠️ 两个要点（来自 PRD.md §4.3）：
     1. 用 encodeURIComponent 把标题编码。
        标题里可能有 & # ? 空格 这些字符，不编码会把网址弄断。
     2. 用 window.open(..., '_blank') 开新窗口 —— 当前页面不动。
   ------------------------------------------------------------ */
function openSearch(title) {
  const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(title);
  window.open(url, '_blank');
}


/* ------------------------------------------------------------
   第 6 步：几个小工具函数
   ------------------------------------------------------------ */

// 把热度值显示得像样一点（≥1万 就显示成"xx万"）
// ⚠️ 注意：只影响【显示】，排序用的永远是原始数字（PRD.md §6）
function formatHeat(n) {
  if (n >= 10000) {
    return (n / 10000).toFixed(1) + '万';
  }
  return String(n);
}

// 顶部那行提示文字
function updateHint(count) {
  const total = getAllData().length;
  if (count === total) {
    hintEl.textContent = '共 ' + total + ' 条';
  } else {
    hintEl.textContent = '筛出 ' + count + ' 条（共 ' + total + ' 条）';
  }
}


/* ------------------------------------------------------------
   第 7 步：启动
   ------------------------------------------------------------
   页面一打开就做的事：
     · 先把 30 条排好序显示出来
     · 再给输入框挂上"边打字边筛选"的监听
   ------------------------------------------------------------ */
function init() {
  render(sortByHeat(getAllData()));

  // input 事件 = 输入框内容一变就触发（这就是"实时"）
  inputEl.addEventListener('input', applyFilter);
}

// 页面结构加载完再启动，避免"找不到元素"
document.addEventListener('DOMContentLoaded', init);
