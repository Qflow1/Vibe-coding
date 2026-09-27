/* ============================================================
   门户首页 · 交互逻辑（portal.js）
   ------------------------------------------------------------
   它只负责一件事：搜索框输入 → 跳转到热点速览页，并把关键词带过去。

   为什么单独一个文件，而不是复用 app.js：
   app.js 管的是"热点速览页"那一整套（取数、渲染、筛选、收藏、四态）。
   门户首页没有列表、没有数据、没有四态，它只有一个搜索框。
   用一个轻量的小文件，比硬塞进 app.js 更清楚，也不会误触 app.js 里
   那些"找不到元素就会报错"的逻辑。
   ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', function () {
  const input = document.getElementById('portalKeyword');
  if (!input) return;

  function go() {
    const kw = input.value.trim();
    // 空关键词 → 直接进速览页；有词 → 带上 ?kw= 参数，速览页据此预填并筛选
    const url = kw
      ? 'hot.html?kw=' + encodeURIComponent(kw)
      : 'hot.html';
    window.location.href = url;
  }

  // 回车 = 搜索
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  });

  // 也支持点击输入框右侧的"检索"图标触发（如果将来给它加了点击）
  const icon = document.querySelector('.hero-search .search-icon');
  if (icon) {
    icon.style.cursor = 'pointer';
    icon.addEventListener('click', go);
  }
});
