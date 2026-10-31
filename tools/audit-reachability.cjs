#!/usr/bin/env node
'use strict';
/**
 * tools/audit-reachability.cjs
 *
 * 静态可达性审计：查出「data/atlas.js 里有、运行时没有任何路径能拿到」的词条。
 *
 * 为什么需要它：
 *   本项目 54 个词条的解锁通路有三条（关卡答题 / 拉呱场景 / 到访方言点），
 *   全部靠数据里的字段间接表达。任何一条通路「数据写好了、代码没实现」，
 *   图鉴就会永久差几个词，而控制台一声不吭。这类缺口只能靠静态断言拦。
 *
 * 用法（放在 xuzhou-dialect-map 仓库根）：
 *   node tools/audit-reachability.cjs          # 人读
 *   node tools/audit-reachability.cjs --json   # 机器读
 *
 * 退出码：0 = 全部可达；1 = 存在不可达 / 悬空引用；2 = atlas 加载失败
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ---------- 载入 atlas.js（纯数据，无 DOM 依赖） ---------- */
function loadAtlas() {
  const sandbox = { console };
  sandbox.window = sandbox;            // atlas.js 只做 window.ATLAS = {...}
  vm.createContext(sandbox);
  vm.runInContext(read('data/atlas.js'), sandbox, { filename: 'data/atlas.js' });
  const A = sandbox.ATLAS || (sandbox.window && sandbox.window.ATLAS);
  if (!A || !Array.isArray(A.words)) throw new Error('data/atlas.js 没有产出 window.ATLAS.words');
  return A;
}

/* ---------- 场景对话树里声明的 unlock ---------- */
function collectSceneUnlocks(A) {
  const map = new Map();               // wordId -> [sceneId, ...]
  (A.scenes || []).forEach((sc) => {
    Object.keys(sc.nodes || {}).forEach((k) => {
      (sc.nodes[k].opts || []).forEach((o) => {
        (o.unlock || []).forEach((wid) => {
          if (!map.has(wid)) map.set(wid, []);
          if (map.get(wid).indexOf(sc.id) < 0) map.get(wid).push(sc.id);
        });
      });
    });
  });
  return map;
}

/**
 * 三条通路目前是否真的接通。全部用「代码里有没有这个关键字/文件」判定，
 * 不猜、不靠人记：改好了就绿，谁改回去就红。
 *
 * 场景通路要求 4 件事齐全，其中 `sceneInUi` 是本次补的：
 * 只有播放器、路由和 script 标签，但界面上没有任何地方指向 `#/scene/x`，
 * 用户照样走不到 —— 通路"技术上存在"而体验上仍不可达。这类缺口必须一起拦。
 */
function detectImplementation() {
  const sceneFile   = exists('features/scene.js');
  const sceneInHtml = exists('index.html') && /features\/scene\.js/.test(read('index.html'));
  const sceneInRouter = exists('core/router.js') && /['"]scene['"]/.test(read('core/router.js'));
  const sceneInUi   = exists('js/app.js') && /go\(\s*['"]scene['"]/.test(read('js/app.js'));
  const visitInStore  = exists('core/store.js') && /unlockOnVisit/.test(read('core/store.js'));

  return {
    quiz: true,                        // levelId 通路与生俱来
    scene: sceneFile && sceneInHtml && sceneInRouter && sceneInUi,
    visit: visitInStore,
    detail: { sceneFile, sceneInHtml, sceneInRouter, sceneInUi, visitInStore }
  };
}

function main() {
  const wantJson = process.argv.includes('--json');

  let A;
  try { A = loadAtlas(); }
  catch (e) { console.error('[audit] 加载 atlas 失败: ' + e.message); process.exit(2); }

  const levelIds = new Set(A.levels.map((l) => l.id));
  const spotIds  = new Set(A.spots.map((s) => s.id));
  const wordIds  = new Set(A.words.map((w) => w.id));

  const sceneUnlocks = collectSceneUnlocks(A);
  const impl = detectImplementation();

  const rows = A.words.map((w) => {
    const declared = [];
    if (w.levelId && levelIds.has(w.levelId)) declared.push('quiz');
    if (sceneUnlocks.has(w.id))               declared.push('scene');
    if (w.unlockOnVisit && w.spotId && spotIds.has(w.spotId)) declared.push('visit');

    const live = declared.filter((p) => impl[p] === true);
    return {
      id: w.id, w: w.w, levelId: w.levelId, districtId: w.districtId,
      declared, live, reachable: live.length > 0
    };
  });

  const dead = rows.filter((r) => !r.reachable);
  const dangling = [...sceneUnlocks.keys()].filter((id) => !wordIds.has(id));
  // 场景入口是按 districtId 挂到区县 / 方言点面板上的：归属区县不存在 = 入口永远渲染不出来
  const districtIds = new Set(A.districts.map((d) => d.id));
  const orphanScenes = (A.scenes || [])
    .filter((sc) => !districtIds.has(sc.districtId))
    .map((sc) => sc.id + '(' + sc.districtId + ')');

  if (wantJson) {
    console.log(JSON.stringify({
      total: rows.length,
      reachable: rows.length - dead.length,
      dead, dangling, orphanScenes, impl
    }, null, 2));
  } else {
    console.log('词条总数        ' + rows.length);
    console.log('可达            ' + (rows.length - dead.length));
    console.log('不可达          ' + dead.length);
    console.log('通路实现状态    ' + JSON.stringify(impl.detail));

    if (dead.length) {
      console.log('\n不可达词条（图鉴里永远拿不到）：');
      dead.forEach((r) => {
        const why = r.declared.length
          ? '[' + r.declared.join(',') + '] 已声明但未实现'
          : '无任何通路';
        console.log('  - ' + String(r.id).padEnd(12) + String(r.w).padEnd(6) +
                    ' levelId=' + r.levelId + '  ' + why);
      });
    }
    if (dangling.length) {
      console.log('\n场景 unlock 指向不存在的词条：' + dangling.join(', '));
    }
    if (orphanScenes.length) {
      console.log('\n场景归属的区县不存在（入口渲染不出来）：' + orphanScenes.join(', '));
    }
  }

  if (dead.length || dangling.length || orphanScenes.length) {
    if (!wantJson) {
      console.error('\n[audit] FAIL —— 存在永远拿不到的词条，或场景引用了不存在的 id / 区县。');
    }
    process.exit(1);
  }
  if (!wantJson) console.log('\n[audit] OK —— 全部词条都至少有一条已实现的解锁通路。');
  process.exit(0);
}

main();
