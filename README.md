# Agrotis

从一颗地球，探索整个宇宙。交互天文科普项目：此时此地的公开卫星、月相几何、理想光传播与火星双期影像测量。

这是从完整开发版提取的清洁技术源码，不包含私人材料或旧 Git 历史。

在线体验：[agrotis.pages.dev](https://agrotis.pages.dev)。目标域名 `agrotis.infoark.xyz` 尚待域名绑定。

## 本地运行

需要 Node.js 22+、pnpm 与 Python 3.12+。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
# 另一个终端
cd technical
pnpm install --frozen-lockfile
pnpm dev --port 5174 --strictPort
```

前端构建：`cd technical && pnpm build`。科学/API 检查：从根目录运行 `.venv/bin/python -m pytest -q`。

## 科学范围

卫星由公开 OMM 元素经 SGP4 推算；不是遥测，也不保证肉眼可见。超过元素历元 ±72 小时不绘制位置，需成功刷新来源。位置只留浏览器会话。

月相为理想球体正交几何，不是今日月相或光度；光传播为理想点源的平方反比模型，不是照度/温度。火星两期 NASA 发布图只支持手动表观位移及局部容差，总配准误差未知；不是风速或科研级测量。

静态托管不能提供原 Python/Astropy API、来源刷新与独立科学核对；Pages 候选脚本明确返回 503，不伪造实时数据。自动化检查不替代实体设备或学习效果验收。

## 素材与缺失模型

本快照暂不分发 ESA 67P、DigitalSpace 哈勃及 Bennu 模型，相关具体再分发边界待核验。本地浏览这些对象可能显示模型不可用；不得用假模型冒充。来源和署名保留在 `technical/public/assets/sources.json` 及模型清单，官方链接可查阅，来源存在不等于授予本项目重新许可的权利。

NASA ISS/LRO/Mars 素材用于教育展示，按原政策署名；地球纹理为 CC BY 4.0，字体为 OFL，Draco 为 Apache-2.0。原创代码 MIT 不覆盖第三方数据、模型、图片、字体及依赖。详见 THIRD_PARTY_NOTICES.md。

### 托管缓存与刷新

FastAPI 部署入口为 `backend.main:app`，仅 API 使用 Vercel；前端由 Pages 提供并同源转发 `/api/`。托管时源码只读，临时文件写入 `/tmp`；成功快照压缩保存到独立 Agrotis 命名空间的区域 Runtime Cache。它是可驱逐缓存，非永久数据库；缓存丢失时重新请求公开来源，失败保留来源时间并继续逐颗遵守 ±72 小时展示窗口。GET 请求会检查刷新间隔（轨道两小时、事件一小时），页面活跃时每五分钟检查一次，无人访问时不运行后台定时器。并行冷启动可能重复一次上游请求，进程锁不能当成分布式锁。Hobby 免费额度耗尽会暂停，不自动升级付费。
