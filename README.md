# 管！徐州 · 徐州方言数字地图

> Dialect Atlas of Xuzhou — 一个可旋转、可探索的徐州方言 3D 数字地图

以 3D 彭城为核心，承载徐州 10 个区县、20 处方言点的方言词条、方言点与方言小游戏。纯前端实现，**无需构建、无需安装依赖**，双击 `index.html` 即可运行。

## 功能

- **3D 地图**：基于 Three.js 构建的可旋转、可缩放的徐州城区模型，支持自动旋转与视角复位
- **方言点**：20 处方言点分类展示（语气词、亲属称谓等类型），点击查看详情
- **搜索**：顶部搜索框支持按区县、方言点、方言词检索（按 `/` 快速聚焦）
- **方言挑战**：词条测验模块，答对累计「方言值」与等级
- **方言图鉴**：已解锁词条一览
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
│   ├── quiz.js / quiz.css  # 方言挑战（测验）模块
├── core/
│   ├── router.js           # 路由
│   └── store.js            # 状态管理与进度持久化
├── data/
│   ├── atlas.js            # 方言词条与方言点数据
│   └── geo.xuzhou.js       # 徐州地理边界数据
├── js/
│   └── app.js              # 应用主逻辑
├── assets/thumbs/          # 各区县缩略图（SVG）
└── vendor/
    ├── three.min.js        # Three.js
    └── OrbitControls.js    # 轨道控制器
```

## 相关仓库

- [xz-dialect-geo-data](https://github.com/22258-cmd/xz-dialect-geo-data) — 地理边界数据源与处理脚本
- [xuzhou-dialect-duel](https://github.com/22258-cmd/xuzhou-dialect-duel) — 徐州方言对决小游戏

## 说明

方言资料整理自公开的地方志与民俗资料，仅供学习与文化展示参考，具体读音与用法请以当地使用者为准。
