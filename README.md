# 管！徐州 · 徐州方言数字地图

> Dialect Atlas of Xuzhou — 一个可旋转、可探索的徐州方言 3D 数字地图

以 3D 彭城为核心，承载徐州 10 个区县、20 处方言点的方言词条、方言点与方言小游戏。纯前端实现，**无需构建、无需安装依赖**，双击 `index.html` 即可运行。

**许可**：代码以 MIT 授权；词条、拼音、例句、关卡与对话文本、缩略图以 CC BY-SA 4.0 授权；`data/geo.xuzhou.js` 的边界数据**来源待考、不主张授权**。详见 `LICENSE` 与 `NOTICE.md`。

## 功能

- **3D 地图**：基于 Three.js 构建的可旋转、可缩放的徐州城区模型，支持自动旋转与视角复位
- **方言点**：20 处方言点分类展示（语气词、亲属称谓等类型），点击查看详情
- **搜索**：顶部搜索框支持按区县、方言点、方言词检索（按 `/` 快速聚焦）
- **方言挑战**：词条测验模块，答对累计「方言值」与等级
- **拉呱场景**：3 段对话树（早点摊儿 / 街上问路 / 姥姥家吃饭），跟着话头接下去会解锁专属词条
- **方言图鉴**：已解锁词条一览（54 条全部可达）
- **探索进度**：底部队县导航 + 侧栏探索进度条

## 快速开始

```bash
# 直接打开，无需任何依赖
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

也可以用任意静态服务器：

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 目录结构

```
.
├── index.html              # 页面骨架
├── css/
│   └── style.css           # 主样式
├── features/
│   ├── quiz.js / quiz.css   # 方言挑战（测验）模块
│   └── scene.js / scene.css # 拉呱场景（对话树运行时）
├── core/
│   ├── router.js           # 路由
│   └── store.js            # 状态管理与进度持久化
├── data/
│   ├── atlas.js            # 方言词条与方言点数据
│   └── geo.xuzhou.js       # 徐州地理边界数据
├── js/
│   └── app.js              # 应用主逻辑
├── tools/
│   └── audit-reachability.cjs  # 静态守卫：有没有词条拿不到、场景有没有入口
├── assets/thumbs/          # 各区县缩略图（SVG）
└── vendor/
    ├── three.min.js        # Three.js
    └── OrbitControls.js    # 轨道控制器
```

## 自检

改数据或改解锁通路之后跑一次（零依赖，`node` 直接跑）：

```bash
node tools/audit-reachability.cjs   # 退出码 0 = 54 条词条全部有已实现的解锁通路
```

它盯三件事：词条是否至少有一条**已实现**的通路（关卡 / 场景 / 到访）、场景 `unlock`
是否指向存在的词条、场景归属的区县是否存在（区县不存在则入口渲染不出来）。

## 相关仓库

- [xz-dialect-geo-data](https://github.com/22258-cmd/xz-dialect-geo-data) — 地理边界数据（权威版与降采样版）
- [xuzhou-dialect-duel](https://github.com/22258-cmd/xuzhou-dialect-duel) — 徐州方言对决概念方案页

## 说明

方言资料整理自公开的地方志与民俗资料，仅供学习与文化展示参考，具体读音与用法请以当地使用者为准。
