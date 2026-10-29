/* ============================================================
   features/quiz.js — 方言小游戏（答题闯关）
   ------------------------------------------------------------
   数据全部来自 window.ATLAS：关卡 → levelWords() → 四选一。
   作答正确的词条通过 store.unlockWords() 解锁，
   关卡结算通过 store.completeLevel() 写入，地图 pin 随之改态。
   ============================================================ */
(function () {
  'use strict';

  var A = window.ATLAS;
  var act = window.XZ.actions;
  var sel = window.XZ.selectors;

  var root = null;      // #stage
  var q = null;         // 当前局
  var KEY = ['A', 'B', 'C', 'D'];

  /* ---------------- 语音 ---------------- */
  var audio = {
    speak: function (text, rate) {
      try {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = rate || 0.8;
        u.pitch = 0.92;
        window.speechSynthesis.speak(u);
      } catch (e) { }
    }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 出题 ---------------- */
  function buildQuestions(levelId) {
    var pool = sel.levelWords(levelId);
    if (!pool.length) return [];
    var all = A.words;

    // 每关最多 6 题，词多的关卡随机抽取
    return shuffle(pool.slice()).slice(0, 6).map(function (item) {
      var sameCat = all.filter(function (w) { return w.id !== item.id && w.cat === item.cat; });
      var sameDiff = all.filter(function (w) { return w.id !== item.id && w.difficulty === item.difficulty; });
      var rest = all.filter(function (w) { return w.id !== item.id; });

      var cand = sameCat.concat(sameDiff, rest);
      var picked = [], used = {};
      used[item.meaning] = 1;

      for (var i = 0; i < cand.length && picked.length < 3; i++) {
        var c = cand[i];
        if (used[c.meaning]) continue;
        used[c.meaning] = 1;
        picked.push(c);
      }

      var opts = shuffle([item].concat(picked)).map(function (o) {
        return { text: o.meaning, right: o.id === item.id };
      });

      return { item: item, opts: opts };
    });
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!q) return;
    var cur = q.qs[q.i];
    var item = cur.item;
    var lv = q.level;
    var d = sel.district(lv.districtId);
    var cat = A.wordCats[item.cat] || { label: item.cat };

    var dots = q.qs.map(function (_, i) {
      if (i < q.results.length) return '<i class="' + (q.results[i] ? 'ok' : 'no') + '"></i>';
      return '<i class="' + (i === q.i ? 'now' : '') + '"></i>';
    }).join('');

    var opts = cur.opts.map(function (o, i) {
      return '<button class="q-opt" data-i="' + i + '">' +
        '<span class="q-k">' + KEY[i] + '</span>' +
        '<span class="q-t">' + esc(o.text) + '</span>' +
        '<span class="q-mk"></span></button>';
    }).join('');

    root.innerHTML =
      '<div class="stage-inner">' +
      '<div class="q-head">' +
      '<button class="q-close" data-close aria-label="退出">✕</button>' +
      '<div class="q-head-txt">' +
      '<b>第 ' + lv.id + ' 关 · ' + esc(lv.name) + '</b>' +
      '<span>' + (d ? esc(d.name) + ' · ' : '') + esc(lv.place) + '</span>' +
      '</div>' +
      '<div class="q-head-val">' + S0().value + '<small>方言值</small></div>' +
      '</div>' +

      '<div class="q-dots">' + dots + '</div>' +

      '<div class="q-body">' +
      '<div class="q-tags"><span>' + esc(cat.label) + '</span>' +
      '<span class="q-diff">' + '★'.repeat(item.difficulty) + '</span></div>' +
      '<div class="q-word">' + esc(item.w) + '</div>' +
      '<div class="q-py">' + esc(item.py || '') + '</div>' +
      '<button class="q-play" data-play>' +
      '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>' +
      '<span>听发音</span></button>' +
      '<div class="q-ask">这句徐州话的意思是？</div>' +
      '</div>' +

      '<div class="q-opts">' + opts + '</div>' +
      '<div class="q-reveal"></div>' +
      '<div class="q-foot"><button class="q-next" data-next hidden>下一题</button></div>' +
      '</div>';

    q.locked = false;
    bind();
    setTimeout(function () { if (q && !q.locked) audio.speak(item.w, 0.72); }, 260);
  }

  function S0() { return window.XZ.store.get(); }

  function bind() {
    var close = root.querySelector('[data-close]');
    if (close) close.addEventListener('click', api.close);

    var play = root.querySelector('[data-play]');
    if (play) play.addEventListener('click', function () {
      audio.speak(q.qs[q.i].item.w, 0.7);
      play.classList.add('on');
      setTimeout(function () { play.classList.remove('on'); }, 900);
    });

    Array.prototype.forEach.call(root.querySelectorAll('.q-opt'), function (b) {
      b.addEventListener('click', function () { answer(+b.dataset.i, b); });
    });
  }

  function answer(idx, btn) {
    if (!q || q.locked) return;
    q.locked = true;

    var cur = q.qs[q.i];
    var item = cur.item;
    var ok = cur.opts[idx].right;

    Array.prototype.forEach.call(root.querySelectorAll('.q-opt'), function (b, i) {
      b.disabled = true;
      if (cur.opts[i].right) {
        b.classList.add('ok');
        b.querySelector('.q-mk').textContent = '✓';
      } else if (i === idx) {
        b.classList.add('no');
        b.querySelector('.q-mk').textContent = '✗';
      } else {
        b.classList.add('dim');
      }
    });

    q.results[q.i] = ok;
    if (ok) {
      q.right++;
      act.unlockWords([item.id]);
      var dot = root.querySelectorAll('.q-dots i')[q.i];
      if (dot) dot.className = 'ok';
    } else {
      var dot2 = root.querySelectorAll('.q-dots i')[q.i];
      if (dot2) dot2.className = 'no';
    }

    if (btn) {
      var r = btn.getBoundingClientRect();
      floatScore(ok ? '+10' : '×', r.right - 36, r.top + 6);
    }

    var rv = root.querySelector('.q-reveal');
    rv.innerHTML =
      '<div class="q-rv ' + (ok ? '' : 'bad') + '">' +
      '<div class="q-rv-h"><b>' + esc(item.w) + '</b>' +
      '<i>' + esc(item.py || '') + '</i>' +
      '<span class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 答对 · +10' : '✗ 记一下') + '</span></div>' +
      '<div class="q-rv-m"><em>释义</em>' + esc(item.meaning) + '</div>' +
      '<div class="q-rv-e">' + esc(item.example) + '</div>' +
      '</div>';
    rv.classList.add('on');

    var nx = root.querySelector('[data-next]');
    nx.hidden = false;
    nx.textContent = (q.i >= q.qs.length - 1) ? '完成本关' : '下一题';
    nx.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var hv = root.querySelector('.q-head-val');
    if (hv) hv.innerHTML = S0().value + '<small>方言值</small>';
  }

  function next() {
    if (!q) return;
    q.i++;
    if (q.i >= q.qs.length) { finish(); return; }
    render();
    var body = root.querySelector('.q-body');
    if (body) body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function finish() {
    var lv = q.level;
    var total = q.qs.length;
    var right = q.right;
    var rate = Math.round(right / total * 100);
    var stars = rate >= 100 ? 3 : rate >= 80 ? 2 : 1;

    var res = act.completeLevel(lv.id, stars, right, total);
    var tier = sel.tier();
    var book = sel.bookProgress();

    root.innerHTML =
      '<div class="stage-inner q-result">' +
      '<div class="qr-eyebrow">第 ' + lv.id + ' 关 · ' + esc(lv.name) + '</div>' +
      '<div class="qr-stars">' + '★'.repeat(stars) + '<i>' + '★'.repeat(3 - stars) + '</i></div>' +
      '<div class="qr-num">' + right + '<span>/' + total + '</span></div>' +
      '<div class="qr-tier">' + esc(tier.name) + '</div>' +
      '<div class="qr-stats">' +
      '<div><b>+' + (right * 10 + (res.first ? 20 : 0)) + '</b><span>本次得分</span></div>' +
      '<div><b>' + S0().value + '</b><span>累计方言值</span></div>' +
      '<div><b>' + book.unlocked + '/' + book.total + '</b><span>已解锁词条</span></div>' +
      '</div>' +
      (res.first ? '<div class="qr-badge">首次通关 · 该区方言点已点亮</div>' : '<div class="qr-badge dim">重玩不加分 · 只刷新星级</div>') +
      '<div class="qr-acts">' +
      '<button class="q-btn ghost" data-retry>再玩一次</button>' +
      '<button class="q-btn primary" data-close2>回到地图</button>' +
      '</div>' +
      '</div>';

    root.querySelector('[data-close2]').addEventListener('click', api.close);
    root.querySelector('[data-retry]').addEventListener('click', function () {
      api.start(lv.id);
    });
  }

  function floatScore(txt, x, y) {
    var d = document.createElement('div');
    d.className = 'q-float';
    d.textContent = txt;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 1000);
  }

  /* ---------------- 对外 ---------------- */
  var api = {
    el: function () { return root; },

    start: function (levelId) {
      var lv = sel.level(levelId);
      if (!lv) { api.close(); return; }
      var qs = buildQuestions(lv.id);
      if (!qs.length) { api.close(); return; }

      root = document.getElementById('stage');
      root.className = 'stage on';

      q = { level: lv, qs: qs, i: 0, right: 0, results: [], locked: false };
      act.startLevel(lv.id);
      render();
      document.body.classList.add('stage-open');
    },

    close: function () {
      if (!root) return;
      root.className = 'stage';
      root.innerHTML = '';
      q = null;
      document.body.classList.remove('stage-open');

      var back = window.XZ.router.returnPath();
      if (back && back.indexOf('#/quiz') !== 0) {
        if (location.hash === back) window.XZ.router.dispatch();
        else location.hash = back;
      } else {
        window.XZ.router.go('home');
      }
    },

    isOpen: function () { return !!(q && root && root.classList.contains('on')); }
  };

  window.XZ = window.XZ || {};
  window.XZ.quiz = api;

  // 路由接管（脚本位于 body 末尾，DOM 已就绪，直接注册）
  window.XZ.router.on('quiz', function (param) {
    api.start(Number(param) || 1);
  });
})();
