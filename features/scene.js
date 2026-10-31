/* ============================================================
   features/scene.js — 拉呱场景（对话树）运行时
   ------------------------------------------------------------
   数据早已写在 data/atlas.js 的 `scenes` 里（节点 npc/py/opts，
   选项 t/score/unlock/next/reply/replyPy），但没有运行时消费它，
   导致 6 个「拉呱专属」词条（mashang/shenme/genala/tiliu/yangxin/yerang）
   永久锁死、图鉴封顶。

   本文件把数据接通：
     · 选支 → act.unlockWords(opt.unlock)   （6 个词的唯一解锁口）
     · 累加 opt.score → act.finishScene(id, total)（场景最高分 + done）
     · 复用 quiz 的 #stage 层与 .on 约定，不新增 DOM 容器

   契约（与 quiz.js 保持一致）：
     window.XZ.scene.start(sceneId) / .close() / .isOpen()
     路由 #/scene/:sceneId
   ============================================================ */
(function () {
  'use strict';

  var A = window.ATLAS;
  var act = window.XZ.actions;

  var root = null;     // #stage
  var sc = null;       // 当前场景数据
  var nodeId = null;   // 当前节点
  var total = 0;       // 本场累计得分

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
    });
  }

  function findScene(id) {
    var list = A.scenes || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var isTerminal = function (o) { return o.next === null || o.next === undefined; };

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!sc || !nodeId) return;
    var n = sc.nodes[nodeId];
    if (!n) { api.close(); return; }

    var opts = n.opts.map(function (o, i) {
      return '<button class="sc-opt" data-i="' + i + '">' + esc(o.t) + '</button>';
    }).join('');

    root.className = 'stage on';
    root.innerHTML =
      '<div class="stage-inner">' +
        '<div class="sc-head">' +
          '<button class="q-close" data-close aria-label="退出">✕</button>' +
          '<div class="sc-head-txt">' +
            '<b>' + esc(sc.name) + '</b>' +
            '<span>' + esc(sc.place) + '</span>' +
          '</div>' +
          '<div class="sc-score">' + total + '<small>本场</small></div>' +
        '</div>' +
        '<div class="sc-body">' +
          '<div class="sc-npc">' +
            '<span class="sc-avatar">' + esc(sc.avatar || '摊') + '</span>' +
            '<div class="sc-say">' +
              '<b>' + esc(n.npc) + '</b>' +
              (n.py ? '<i>' + esc(n.py) + '</i>' : '') +
            '</div>' +
          '</div>' +
          '<div class="sc-opts">' + opts + '</div>' +
          '<div class="sc-reply" data-reply hidden></div>' +
        '</div>' +
      '</div>';

    root.querySelector('[data-close]').addEventListener('click', api.close);
    var btns = root.querySelectorAll('.sc-opt');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        choose(Number(this.getAttribute('data-i')));
      });
    }
  }

  /* ---------------- 选一支 ---------------- */
  function choose(i) {
    if (!sc || !nodeId) return;
    var o = sc.nodes[nodeId].opts[i];
    if (!o) return;

    total += o.score || 0;

    // 唯一解锁口：数据里 opt.unlock 声明了谁，就解锁谁
    if (o.unlock && o.unlock.length) act.unlockWords(o.unlock);

    var rv = root.querySelector('[data-reply]');
    if (rv && o.reply) {
      rv.innerHTML = '<b>' + esc(o.reply) + '</b>' +
                     (o.replyPy ? '<i>' + esc(o.replyPy) + '</i>' : '');
      rv.hidden = false;
    }

    // 选项禁掉，避免连点重复计分
    var btns = root.querySelectorAll('.sc-opt');
    for (var k = 0; k < btns.length; k++) btns[k].disabled = true;

    var head = root.querySelector('.sc-score');
    if (head) head.innerHTML = total + '<small>本场</small>';

    var nx = document.createElement('button');
    nx.className = 'q-btn primary sc-next';
    nx.textContent = isTerminal(o) ? '结束本场' : '接着说';
    nx.addEventListener('click', function () {
      if (isTerminal(o)) { finish(); return; }
      nodeId = o.next;
      render();
    });
    if (rv) rv.appendChild(nx);
    if (nx.scrollIntoView) nx.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------------- 结算 ---------------- */
  function finish() {
    var sid = sc.id;
    var sum = total;
    var name = sc.name;

    act.finishScene(sid, sum);          // 最高分 + done，重玩不重复加分

    var book = window.XZ.selectors.bookProgress();
    root.innerHTML =
      '<div class="stage-inner sc-done">' +
        '<div class="sc-eyebrow">' + esc(name) + ' · 走完一场</div>' +
        '<div class="sc-big">' + sum + '</div>' +
        '<div class="sc-meta">本场得分 · 图鉴 ' + book.unlocked + ' / ' + book.total + '</div>' +
        '<button class="q-btn primary" data-close2>回到地图</button>' +
      '</div>';
    root.querySelector('[data-close2]').addEventListener('click', api.close);
  }

  /* ---------------- 对外 ---------------- */
  var api = {
    start: function (sceneId) {
      var s = findScene(sceneId);
      if (!s) { api.close(); return; }

      var el = document.getElementById('stage');
      if (!el) return;

      sc = s;
      nodeId = s.start;
      total = 0;
      root = el;
      render();
      document.body.classList.add('stage-open');
    },

    close: function () {
      if (!root) return;
      root.className = 'stage';
      root.innerHTML = '';
      sc = null;
      nodeId = null;
      total = 0;
      document.body.classList.remove('stage-open');

      var back = window.XZ.router.returnPath();
      if (back && back.indexOf('#/scene') !== 0) {
        if (location.hash === back) window.XZ.router.dispatch();
        else location.hash = back;
      } else {
        window.XZ.router.go('home');
      }
    },

    isOpen: function () { return !!(root && sc && root.classList.contains('on')); }
  };

  window.XZ = window.XZ || {};
  window.XZ.scene = api;

  // 路由接管（脚本位于 body 末尾，DOM 已就绪）
  window.XZ.router.on('scene', function (param) {
    if (param) api.start(param);
  });
})();
