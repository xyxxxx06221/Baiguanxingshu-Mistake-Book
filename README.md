# 百官行述

一个本机优先的行测错题复盘工具。它把题卷导入、错题筛选、重新作答、错因记录、间隔复习和薄弱项分析放在同一个应用里，并附带“百化分”速算练习。

> 当前版本是早期公开版（`0.1.0`），主要面向 macOS 和本地个人使用。AI 识别结果可能出错，不能替代人工校对或官方答案。

## 功能

- 导入 PDF 或题目图片，通过 DeepSeek 视觉模型生成候选题
- 人工勾选并确认后才写入错题库
- 记录答案、确定度、错因、复盘、用时、收藏和重点标记
- 答错次日回池，答对后按 3/7 天间隔复习
- 按板块、题型、错因和重复错误查看分析
- 支持共享材料题组、原图区域和题干标注
- 导出/恢复本地 JSON 备份
- 内置 43 组“百化分”换算练习
- 可在浏览器运行，也可打包为 macOS 桌面应用

## 下载与运行

### 普通用户

当前尚未提供签名安装包。可以在 GitHub 仓库页面点击 **Code → Download ZIP**，解压后按下方“开发运行”操作。后续版本可在 GitHub Releases 提供经过测试的安装包。

### 开发运行

需要：

- Node.js 22.13 或更高版本
- pnpm 10
- macOS、Windows 或 Linux 上的现代浏览器

```bash
git clone https://github.com/xyxxxx06221/Baiguanxingshu-Mistake-Book.git
cd Baiguanxingshu-Mistake-Book/app
corepack enable
pnpm install
cp .env.example .env.local   # 可选；也可在应用设置页填写 Key
pnpm dev
```

打开终端显示的网址（通常是 `http://localhost:3000`）。在 macOS 上也可以双击根目录的 `启动行测错题本.command`。

### 桌面应用

```bash
cd app
pnpm desktop:pack
```

产物会生成在 `app/release/`。目前仅配置并验证过 macOS；未签名应用可能触发系统安全提示。

## DeepSeek API Key

题卷智能识别需要用户自己的 DeepSeek API Key；其余错题、复习、分析和百化分功能可离线使用。

可选配置方式：

1. 在“设置”页面输入。Key 会以明文保存在当前应用的本地存储中，并只在识别时发送给本机接口和 DeepSeek；请勿在公用电脑使用。
2. 将 `app/.env.example` 复制为 `app/.env.local`，填写 `DEEPSEEK_API_KEY`。

不要把 `.env.local`、截图中的 Key、备份文件或真实题卷提交到 GitHub。若 Key 曾经公开，应立即在服务商控制台撤销并重新生成。

## 数据与隐私

- 题库、作答、复盘和设置默认保存在浏览器/Electron 的 `localStorage`。
- 清理浏览器数据会导致记录丢失，请定期在设置页导出 JSON 备份。
- 导入 PDF 时会先在本机转换成图片；识别所需的图片及提示词会发送至 DeepSeek API。
- 本项目不提供账户、云同步或遥测。

## 常用命令

```bash
cd app
pnpm test       # 自动化测试
pnpm lint       # 代码规范检查
pnpm typecheck  # TypeScript 类型检查
pnpm build      # 生产构建
```

## 项目结构

```text
.
├── app/                         # Web 与 Electron 应用
│   ├── app/                     # 页面、样式、业务逻辑和 API 路由
│   ├── electron/                # 桌面端入口
│   ├── scripts/                 # 打包脚本
│   └── public/                  # 图标和静态资源
├── 行测错题本_PRD_v1.0.md       # 产品需求基线
├── 百化分练习_需求文档_v1.0.md  # 百化分功能说明
└── 阶段性总结_新会话交接_2026-08-30.md # 开发沿革和待办
```

## 项目状态与限制

- AI 生成的答案统一标记为“AI 推测·未确认”，使用者应自行核对。
- 当前自动化测试覆盖导入边界、材料清理和材料分组，尚未覆盖完整 UI 和真实 API 流程。
- 主页面和样式文件仍较集中，后续需要模块化整理。
- 桌面安装包尚未做 Apple 签名、公证和跨平台验证。
- 数据仅保存在本机，暂不支持多设备同步。

详细产品背景见 [产品需求文档](./行测错题本_PRD_v1.0.md) 和 [阶段性开发记录](./阶段性总结_新会话交接_2026-08-30.md)。

## 参与贡献与反馈

欢迎通过 GitHub Issues 报告问题、提出建议或讨论功能。提交前请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)；安全问题请按 [SECURITY.md](./SECURITY.md) 私下报告，不要公开真实 API Key、题卷或个人备份。

## 许可证

代码以 [MIT License](./LICENSE) 开源。示例题卷、第三方题目、商标和其他非原创内容不因本许可证而获得授权；贡献者应确保提交内容有权公开。
