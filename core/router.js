/* ============================================================
   core/router.js — hash 路由
   ------------------------------------------------------------
   #/                 地图总览
   #/d/:districtId    区县
   #/s/:spotId        方言点详情
   #/w/:wordId        词条详情
   #/quiz/:levelId    方言小游戏（stage 层）
   ------------------------------------------------------------
   路由只负责「解析 + 派发」，不直接操作 DOM。
   具体渲染由各 feature 注册的 handler 完成。
   ============================================================ */
(function () {
  'use strict';

  var handlers = {};        // { home, district, spot, word, quiz, book }
  var pending = null;       // 一次性附加参数（如 fly）
  var last = { name: 'home', param: null };
  var lastStageReturn = '#/';

  function parse(hash) {
    var h = String(hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { name: 'home', param: null };
    var k = parts[0], v = parts[1] || null;
    if (k === 'd') return { name: 'district', param: v };
    if (k === 's') return { name: 'spot', param: v };
    if (k === 'w') return { name: 'word', param: v };
    if (k === 'quiz') return { name: 'quiz', param: v };
    if (k === 'book') return { name: 'book', param: null };
    return { name: 'home', param: null };
  }

  function toPath(name, param) {
    if (name === 'district') return '#/d/' + param;
    if (name === 'spot') return '#/s/' + param;
    if (name === 'word') return '#/w/' + param;
    if (name === 'quiz') return '#/quiz/' + param;
    if (name === 'book') return '#/book';
    return '#/';
  }

  function dispatch() {
    var r = parse(location.hash);
    r.opts = pending || {};
    pending = null;

    // stage 前的上一站，用于关闭后返回
    if (r.name !== 'quiz' && last.name !== 'quiz') {
      lastStageReturn = toPath(last.name, last.param);
    }

    last = { name: r.name, param: r.param };
    if (window.XZ && window.XZ.store) {
      window.XZ.store.setUI({ route: r.name, param: r.param, stage: r.name === 'quiz' ? 'quiz' : null });
    }

    var fn = handlers[r.name] || handlers.home;
    if (fn) fn(r.param, r.opts);
  }

  function go(name, param, opts) {
    pending = opts || null;
    if (name === 'quiz') lastStageReturn = location.hash || '#/';
    var path = toPath(name, param);
    if (location.hash === path) { dispatch(); return; }
    location.hash = path;
  }

  function replace(name, param, opts) {
    pending = opts || null;
    var path = toPath(name, param);
    if (location.hash === path) { dispatch(); return; }
    location.replace(location.pathname + location.search + path);
  }

  function back(fallback) {
    go('home');
    if (fallback) return;
  }

  function on(name, fn) { handlers[name] = fn; }

  function init() {
    window.addEventListener('hashchange', dispatch);
    if (!location.hash) {
      // 用 replace 避免多一条历史
      location.replace(location.pathname + location.search + '#/');
    }
    dispatch();
  }

  window.XZ = window.XZ || {};
  window.XZ.router = {
    init: init,
    go: go,
    replace: replace,
    back: back,
    on: on,
    dispatch: dispatch,
    parse: parse,
    current: function () { return last; },
    returnPath: function () { return lastStageReturn; }
  };
})();
