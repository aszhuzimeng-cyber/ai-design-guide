# 设计指引：AI 页面生成前置可视化设计指引工具

本项目面向缺乏专业设计训练的用户，探索生成式 AI 时代的人机协同设计。它在页面生成之前加入一层可视化的设计认知辅助：帮助用户澄清需求、确认设计意图、比较信息架构与视觉方案，再将选定的设计逻辑交给 AI 生成页面初稿。

项目关注的问题是：用户即使能用 AI 生成页面，也常常难以解释页面为什么这样组织，更难判断结果是否符合自己的目标。设计指引让用户在生成前参与关键决策，让 AI 成为支持理解、选择和修改的协作伙伴。

**[观看 51 秒项目介绍视频](docs/demo.mp4)**

## 使用流程

1. **描述需求**：用一句话说明要做什么页面，以及必须遵守的要求。
2. **确认设计意图**：围绕目标用户、页面重点和希望形成的印象，选择或补充判断。
3. **比较信息架构**：查看不同的首屏重点、内容顺序、浏览路径和低保真预览。
4. **选择视觉语法**：比较色彩、字体、卡片样式和内容密度，并查看推荐理由。
5. **生成并检查**：将用户确认的决策转成生成约束，得到可预览、可导出的单文件 HTML 页面草稿。

用户始终可以修改选项；AI 负责提供候选和解释，最终选择由用户确认。

## 运行项目

需要 Node.js、npm 和用于 AI 功能的 DeepSeek API Key。

```bash
npm ci
cp .env.example .env
# 在 .env 中设置 DEEPSEEK_API_KEY
npm run dev
```

打开终端显示的本地地址（默认 `http://127.0.0.1:5173/`）。在 Windows PowerShell 中可用 `Copy-Item .env.example .env` 代替 `cp`。`.env` 已被 Git 忽略；请勿把密钥写入前端 `VITE_` 变量。

```bash
npm run build
npm run preview
```

`npm run preview` 可在本机预览构建结果。AI 请求经过 Vite 的服务端 `/api/deepseek` 代理；**仅将静态文件放到 GitHub Pages 不会得到可用的 AI 生成功能**。公开在线体验需要另行部署同路径的服务端代理，并在服务端配置密钥。未配置密钥时，可以查看项目代码和介绍视频，AI 分析及页面生成不可用。

## 技术与结构

- React 18、TypeScript、Vite 5；画布与交互状态位于 `src/App.tsx` 和领域类型 `src/types.ts`。
- `src/ai/` 负责需求分析、方案推导、视觉选择、生成约束和 HTML 后处理。
- `design-reference/runtime/` 提供运行时设计判断参考；候选方案会结合用户输入生成，而不是直接照搬案例页面。
- `vite.config.ts` 提供本地 DeepSeek 代理及可选的 MasterGo 导出接口；MasterGo 画布导入需要本机客户端配合。
- 项目状态保存在浏览器 `localStorage`，没有用户账户或云端项目同步。

更详细的模块关系和当前边界见 [架构说明](docs/architecture.md)。

## 验证

```bash
npm run build
node scripts/verify-design-options.mjs
node scripts/verify-generation-layout.mjs
```

端到端 AI 验证需先配置密钥并启动开发服务，再运行 `node scripts/verify-ui-e2e.mjs`。

## 使用边界

当前是研究原型。生成结果是供判断和修改的页面草稿，不等同于已完成的正式网站；项目介绍视频展示的是一次完整的交互流程，界面细节可能与最新代码略有差异。

本仓库公开用于项目展示与评审，暂未授予代码复用许可。如需复用，请联系项目团队；仓库中保留的第三方资料遵循各自的许可说明。
