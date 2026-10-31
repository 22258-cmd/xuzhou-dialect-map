/* ============================================================
   core/store.js — 单一状态源 + 派生选择器 + 事件总线
   ------------------------------------------------------------
   设计原则：
   1. 只有一份持久化状态（key: xzdt.v2），地图 / 搜索 / 详情卡 /
      小游戏全部读写它，不各自持有副本。
   2. value（方言值）是派生量，由已解锁词条、通关关卡等重算，
      绝不做两套计分相加 —— 避免旧档迁移时重复计分。
   3. 视图只读 selectors，不自己算规则。
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'xzdt.v2';
  var OLD_B = 'xzdialect_v1';   // 小游戏旧档
  var OLD_A = 'xzdt_state_v1';  // 地图旧档

  var ATLAS = window.ATLAS;

  /* ---------------- 索引 ---------------- */
  var byId = { district: {}, spot: {}, word: {}, level: {} };
  ATLAS.districts.forEach(function (d) { byId.district[d.id] = d; });
  ATLAS.spots.forEach(function (s) { byId.spot[s.id] = s; });
  ATLAS.words.forEach(function (w) { byId.word[w.id] = w; });
  ATLAS.levels.forEach(function (l) { byId.level[l.id] = l; });

  /* ---------------- 默认状态 ---------------- */
  function defaults() {
    return {
      version: 2,
      value: 0,
      words: { unlocked: [], seen: [] },
      spots: { explored: [] },
      levels: { done: [], stars: {}, active: 0 },
      scenes: { done: [], best: {} },
      daily: { days: [] },
      flags: { posterShared: false },
      lastQuiz: null
    };
  }

  var S = defaults();

  /* ---------------- 事件 ---------------- */
  var listeners = [];
  function emit(reason) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](reason, S); } catch (e) { console.warn('[store] listener error', e); }
    }
  }
  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ---------------- 计分（唯一口径） ---------------- */
  function recompute() {
    var v = 0;
    v += S.words.unlocked.length * 10;             // 每词首次解锁
    v += S.levels.done.length * 20;                // 每关首次通关
    Object.keys(S.scenes.best).forEach(function (k) {
      v += S.scenes.best[k] || 0;                  // 每场景最高分（不累加）
    });
    v += S.daily.days.length * 5;                  // 每日打卡
    if (S.flags.posterShared) v += 30;             // 首次生成海报
    S.value = v;
    return v;
  }

  /* ---------------- 持久化 ---------------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /**
   * 把任意形状的存档收敛成合法全形档。
   *
   * 为什么不能 `Object.assign(defaults(), o)`：那是**浅**合并，
   * 存档里只要带了 `words: {unlocked:[...]}` 而缺 `seen`，整个 `S.words` 就被替换成缺字段的那份，
   * 之后 `addUnique(S.words.seen, id)` 直接抛 TypeError（实测复现）。
   * 于是「加字段时忘了升 version」或「旧构建留下的档」都会让用户在第一次解锁时崩掉。
   * 这里逐字段验类型、验 id 是否还存在，任何不合格的都退回默认值 —— 宁可少几个进度，
   * 也不能让一个坏字段把整个应用打死。
   */
  function hydrate(input) {
    var arr = function (v, ok) {
      return Array.isArray(v) ? v.filter(ok) : null;
    };
    var obj = function (v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; };
    var isWord = function (id) { return !!byId.word[id]; };
    var o = obj(input) || {};
    var out = defaults();

    var w = obj(o.words);
    if (w) {
      out.words.unlocked = arr(w.unlocked, isWord) || [];
      out.words.seen = arr(w.seen, isWord) || [];
    }

    var sp = obj(o.spots);
    if (sp) out.spots.explored = arr(sp.explored, function (id) { return !!byId.spot[id]; }) || [];

    var lv = obj(o.levels);
    if (lv) {
      out.levels.done = arr(lv.done, function (id) { return !!byId.level[id]; }) || [];
      var stars = obj(lv.stars) || {};
      Object.keys(stars).forEach(function (k) {
        if (byId.level[k] && typeof stars[k] === 'number') out.levels.stars[k] = stars[k];
      });
    }
    // active 一律归零：它是「正在进行中」的瞬时标记，不该跨会话存活。
    // 存档里带 active 的，全都是退出答题没清掉的那类坏状态（见 abandonLevel）。
    out.levels.active = 0;

    var sc = obj(o.scenes);
    if (sc) {
      out.scenes.done = arr(sc.done, function (id) { return typeof id === 'string'; }) || [];
      var best = obj(sc.best) || {};
      Object.keys(best).forEach(function (k) {
        if (typeof best[k] === 'number') out.scenes.best[k] = best[k];
      });
    }

    var dy = obj(o.daily);
    if (dy) out.daily.days = arr(dy.days, function (v) { return typeof v === 'string'; }) || [];

    var fl = obj(o.flags);
    if (fl) out.flags.posterShared = !!fl.posterShared;

    var lq = obj(o.lastQuiz);
    if (lq && byId.level[lq.levelId]) out.lastQuiz = lq;

    return out;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { }
    if (raw) {
      try {
        var o = JSON.parse(raw);
        if (o && o.version === 2) {
          S = hydrate(o);
          // value 是派生量：过滤掉不存在的 id 之后必须重算，否则顶栏会显示虚高的分数
          recompute();
          save();
          return 'restore';
        }
      } catch (e) { }
    }
    var m = migrate();
    return m || 'fresh';
  }

  /* ---------------- 旧档迁移 ----------------
     两张旧档的分值口径不同，不能相加。
     只取「已解锁词条 / 已完成关卡 / 场景 / 打卡」这些事实数据，
     再按新口径 recompute() 出唯一的 value。
     ------------------------------------------ */
  function migrate() {
    var b = null, a = null, touched = false;
    try { b = JSON.parse(localStorage.getItem(OLD_B) || 'null'); } catch (e) { }
    try { a = JSON.parse(localStorage.getItem(OLD_A) || 'null'); } catch (e) { }

    S = defaults();

    if (b && typeof b === 'object') {
      touched = true;
      (b.unlocked || []).forEach(function (id) {
        if (byId.word[id] && S.words.unlocked.indexOf(id) < 0) S.words.unlocked.push(id);
      });
      (b.completed || []).forEach(function (n) {
        if (byId.level[n] && S.levels.done.indexOf(n) < 0) S.levels.done.push(n);
      });
      (b._scenes || []).forEach(function (id) {
        if (S.scenes.done.indexOf(id) < 0) S.scenes.done.push(id);
      });
      if (b.shared) S.flags.posterShared = true;
      if (b.dailyDate) S.daily.days = [String(b.dailyDate)];
    }

    if (a && typeof a === 'object') {
      touched = true;
      (a.explored || []).forEach(function (id) {
        if (byId.spot[id] && S.spots.explored.indexOf(id) < 0) {
          S.spots.explored.push(id);
          // 看过的点，其词条记为「见过」，但不等于解锁
          var sp = byId.spot[id];
          if (sp) (sp.wordIds || []).forEach(function (wid) {
            if (S.words.seen.indexOf(wid) < 0) S.words.seen.push(wid);
          });
        }
      });
    }

    if (!touched) return null;

    recompute();
    save();
    return 'migrate';
  }

  /* ---------------- 写入动作 ---------------- */
  function addUnique(arr, v) {
    if (v === null || v === undefined) return false;
    if (arr.indexOf(v) >= 0) return false;
    arr.push(v);
    return true;
  }

  var actions = {
    /** 解锁词条，返回真正新增的 id */
    unlockWords: function (ids) {
      var added = [];
      (ids || []).forEach(function (id) {
        if (!byId.word[id]) return;
        if (addUnique(S.words.unlocked, id)) {
          added.push(id);
          addUnique(S.words.seen, id);
        }
      });
      if (added.length) { recompute(); save(); emit('words'); }
      return added;
    },

    markSeen: function (ids) {
      var changed = false;
      (ids || []).forEach(function (id) {
        if (byId.word[id] && addUnique(S.words.seen, id)) changed = true;
      });
      if (changed) { save(); emit('seen'); }
    },

    /**
     * 打开方言点详情：默认只记「见过」，不解锁。
     *
     * 例外是显式声明 `unlockOnVisit: true` 的词条 —— 它们没有任何其他解锁通路
     * （既不在关卡池，也没有场景节点 unlock 它们），到访就是唯一的路。
     * 目前只有「呱嗒」属于这类；不给全部词开这个口子，否则图鉴失去收集意义。
     */
    exploreSpot: function (id) {
      if (!byId.spot[id]) return false;
      var sp = byId.spot[id];
      var isNew = addUnique(S.spots.explored, id);
      var newlyUnlocked = [];
      (sp.wordIds || []).forEach(function (wid) {
        addUnique(S.words.seen, wid);
        var wd = byId.word[wid];
        if (wd && wd.unlockOnVisit && addUnique(S.words.unlocked, wid)) newlyUnlocked.push(wid);
      });
      if (isNew) { save(); emit('spots'); }
      // value 是派生量：解锁了东西必须重算，否则方言值停在旧数字上
      if (newlyUnlocked.length) { recompute(); save(); emit('words'); }
      return isNew;
    },

    /** 进入关卡：标记进行中，供四态机使用 */
    startLevel: function (id) {
      if (!byId.level[id]) return;
      S.levels.active = id;
      save(); emit('level:start');
    },

    /**
     * 中途退出：只清「进行中」标记，不计分。
     *
     * 为什么必须有它：`levels.active` 会被 save() 持久化，而四态机（spotState/districtState）
     * 直接读它判 'playing'。此前只有 completeLevel 会清零，于是「进关后 ✕ 退出」把
     * 一个坏状态永久留在存档里 —— 那个区县从此一直显示「进行中」，刷新也修不好。
     */
    abandonLevel: function () {
      if (!S.levels.active) return false;
      S.levels.active = 0;
      save(); emit('level:abort');
      return true;
    },

    /** 通关（首次才加分，重玩只刷新星级） */
    completeLevel: function (id, stars, correct, total) {
      if (!byId.level[id]) return { first: false, gained: 0 };
      var first = S.levels.done.indexOf(id) < 0;
      if (first) S.levels.done.push(id);
      S.levels.stars[id] = Math.max(S.levels.stars[id] || 0, stars || 1);
      S.levels.active = 0;
      S.lastQuiz = { levelId: id, correct: correct || 0, total: total || 0, at: Date.now() };
      recompute(); save(); emit('level:done');
      return { first: first, gained: first ? 20 : 0 };
    },

    finishScene: function (id, score) {
      S.scenes.best[id] = Math.max(S.scenes.best[id] || 0, score || 0);
      if (S.scenes.done.indexOf(id) < 0) S.scenes.done.push(id);
      recompute(); save(); emit('scene:done');
    },

    claimDaily: function (dateStr) {
      if (S.daily.days.indexOf(dateStr) >= 0) return false;
      S.daily.days.push(dateStr);
      recompute(); save(); emit('daily');
      return true;
    },

    markPosterShared: function () {
      if (S.flags.posterShared) return false;
      S.flags.posterShared = true;
      recompute(); save(); emit('poster');
      return true;
    },

    reset: function () {
      S = defaults();
      save(); emit('reset');
    }
  };

  /* ---------------- 选择器 ---------------- */
  var sel = {
    raw: function () { return S; },

    tier: function (v) {
      var val = (v === undefined) ? S.value : v;
      var t = ATLAS.tiers[0];
      for (var i = 0; i < ATLAS.tiers.length; i++) {
        if (val >= ATLAS.tiers[i].min) t = ATLAS.tiers[i];
      }
      return t;
    },

    nextTier: function () {
      for (var i = 0; i < ATLAS.tiers.length; i++) {
        if (S.value < ATLAS.tiers[i].min) return ATLAS.tiers[i];
      }
      return null;
    },

    tierProgress: function () {
      var t = sel.tier(), n = sel.nextTier();
      if (!n) return { pct: 100, text: '已达满级', range: S.value + ' 分' };
      var span = n.min - t.min;
      var got = S.value - t.min;
      return {
        pct: Math.max(0, Math.min(100, Math.round(got / span * 100))),
        text: '再得 ' + (n.min - S.value) + ' 分升「' + n.name + '」',
        range: S.value + ' / ' + n.min
      };
    },

    district: function (id) { return byId.district[id] || null; },
    spot: function (id) { return byId.spot[id] || null; },
    word: function (id) { return byId.word[id] || null; },
    level: function (id) { return byId.level[id] || null; },

    districtByName: function (name) {
      for (var i = 0; i < ATLAS.districts.length; i++) {
        if (ATLAS.districts[i].name === name) return ATLAS.districts[i];
      }
      return null;
    },

    districtSpots: function (did) {
      return ATLAS.spots.filter(function (s) { return s.districtId === did; });
    },

    levelWords: function (lid) {
      return ATLAS.words.filter(function (w) { return w.levelId === lid; });
    },

    /** 该区县对应的关卡（没有则 null） */
    levelOfDistrict: function (did) {
      for (var i = 0; i < ATLAS.levels.length; i++) {
        if (ATLAS.levels[i].districtId === did) return ATLAS.levels[i];
      }
      return null;
    },

    isWordUnlocked: function (id) { return S.words.unlocked.indexOf(id) >= 0; },
    isSpotExplored: function (id) { return S.spots.explored.indexOf(id) >= 0; },
    isLevelDone: function (id) { return S.levels.done.indexOf(id) >= 0; },
    isSceneDone: function (id) { return S.scenes.done.indexOf(id) >= 0; },

    /* ---- 四态机 ---- */
    spotState: function (sid) {
      var sp = byId.spot[sid];
      if (!sp) return 'locked';
      var explored = sel.isSpotExplored(sid);
      var lv = sel.levelOfDistrict(sp.districtId);

      var wordsDone = (sp.wordIds || []).length > 0 &&
        (sp.wordIds || []).every(function (w) { return sel.isWordUnlocked(w); });

      if (lv && sel.isLevelDone(lv.id)) return 'done';
      if (wordsDone) return 'done';
      if (lv && S.levels.active === lv.id) return 'playing';
      if (explored) return 'unlocked';
      return 'locked';
    },

    districtState: function (did) {
      var lv = sel.levelOfDistrict(did);
      if (lv && sel.isLevelDone(lv.id)) return 'done';
      if (lv && S.levels.active === lv.id) return 'playing';
      var spots = sel.districtSpots(did);
      if (spots.some(function (s) { return sel.isSpotExplored(s.id); })) return 'unlocked';
      return 'locked';
    },

    districtProgress: function (did) {
      var spots = sel.districtSpots(did);
      var seen = spots.filter(function (s) { return sel.isSpotExplored(s.id); }).length;
      var done = spots.filter(function (s) { return sel.spotState(s.id) === 'done'; }).length;
      return { total: spots.length, seen: seen, done: done };
    },

    bookProgress: function () {
      return {
        total: ATLAS.words.length,
        unlocked: S.words.unlocked.length,
        pct: Math.round(S.words.unlocked.length / ATLAS.words.length * 100)
      };
    },

    exploredCount: function () { return S.spots.explored.length; },
    totalSpots: function () { return ATLAS.spots.length; },

    /** 搜索索引：区县 / 方言点 / 词条 / 关卡 */
    searchIndex: function () {
      var out = [];
      ATLAS.districts.forEach(function (d) {
        var p = sel.districtProgress(d.id);
        out.push({
          kind: 'district', group: '区县', id: d.id, label: d.name,
          sub: d.type + ' · ' + p.total + ' 处方言点 · ' + d.note,
          glyph: d.name.charAt(0)
        });
      });
      ATLAS.spots.forEach(function (s) {
        var d = byId.district[s.districtId];
        var cat = ATLAS.spotCategories[s.category];
        out.push({
          kind: 'spot', group: '方言点', id: s.id, label: s.name,
          sub: (d ? d.name : '') + ' · ' + (cat ? cat.label : '') + ' · ' + s.tag,
          glyph: s.name.charAt(0)
        });
      });
      ATLAS.words.forEach(function (w) {
        var d = byId.district[w.districtId];
        out.push({
          kind: 'word', group: '方言词', id: w.id, label: w.w,
          sub: w.meaning + (d ? '（' + d.name + '）' : ''),
          glyph: w.w.charAt(0)
        });
      });
      ATLAS.levels.forEach(function (l) {
        out.push({
          kind: 'level', group: '关卡', id: l.id, label: '第 ' + l.id + ' 关 · ' + l.name,
          sub: l.desc + ' · ' + l.place,
          glyph: String(l.id)
        });
      });
      return out;
    }
  };

  /* ---------------- UI 临时态（不持久化） ---------------- */
  var ui = {
    route: 'home',
    param: null,
    selectedDistrict: null,
    selectedSpot: null,
    stage: null,        // 'quiz' | null
    from: null          // 进入 stage 前的路由，用于返回
  };
  var uiListeners = [];
  function setUI(patch) {
    Object.assign(ui, patch);
    for (var i = 0; i < uiListeners.length; i++) {
      try { uiListeners[i](ui); } catch (e) { }
    }
  }
  function onUI(fn) { uiListeners.push(fn); }

  /* ---------------- 导出 ---------------- */
  window.XZ = window.XZ || {};
  window.XZ.store = {
    KEY: KEY,
    init: load,
    get: function () { return S; },
    save: save,
    subscribe: subscribe,
    emit: emit,
    recompute: recompute,
    reset: actions.reset,
    ui: ui,
    setUI: setUI,
    onUI: onUI
  };
  window.XZ.actions = actions;
  window.XZ.selectors = sel;
  window.XZ.byId = byId;

  var bootMode = load();
  window.XZ.store.bootMode = bootMode;
  console.info('[store] boot:', bootMode, '| value:', S.value, '| words:', S.words.unlocked.length);
})();
