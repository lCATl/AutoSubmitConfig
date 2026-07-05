# AutoSubmitConfig

AutoSubmitConfig 是一个基于 WXT、Vue 3 和 TypeScript 开发的 Chrome 扩展，用于定时打开用户指定的网页，并采集该站点的 Cookie。

## 功能

- 创建和维护多个定时任务
- 按分钟设置任务执行周期
- 在后台标签页打开目标页面
- 等待页面加载后采集指定 Cookie，或采集当前站点全部 Cookie
- 可选择在采集完成后自动关闭标签页
- 支持立即手动执行任务
- 所有任务配置保存在浏览器本地

采集结果只会输出到扩展的 Service Worker 控制台，不会上传到远程服务器。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `alarms` | 根据用户设置的时间间隔触发任务 |
| `cookies` | 读取当前任务目标 URL 对应站点的 Cookie |
| `storage` | 在浏览器本地保存任务配置 |
| `tabs` | 打开目标页面、等待页面加载并按设置关闭标签页 |
| `<all_urls>` | 允许用户把任意 HTTP/HTTPS 网站设置为任务目标 |

扩展只在任务执行时查询目标 URL 对应的 Cookie，不会先读取其他网站的 Cookie。

## 本地开发

环境要求：

- Node.js 18 或更高版本
- npm

安装依赖并启动开发模式：

```bash
npm install
npm run dev
```

WXT 会启动开发浏览器并自动加载扩展。也可以打开 `chrome://extensions`，启用“开发者模式”，然后手动加载 WXT 生成的开发目录。

## 检查与构建

```bash
npm test
npm run compile
npm run build
npm run zip
```

生产构建位于：

```text
output/chrome-mv3
```

Chrome Web Store 上传包位于：

```text
output/auto-submit-config-extension-0.1.0-chrome.zip
```

## 使用方法

1. 点击扩展图标。
2. 点击“新增任务”。
3. 填写任务名称、目标页面 URL 和执行周期。
4. 选择采集指定 Cookie 或当前站点全部 Cookie。
5. 保存任务，等待定时执行或点击“立即执行”。
6. 在 `chrome://extensions` 中打开本扩展的 Service Worker 控制台查看采集结果。

## 隐私

- 任务配置保存在 `chrome.storage.local`。
- 扩展不会把 Cookie 或任务配置发送到第三方服务器。
- Cookie 仅在用户配置的任务执行期间读取。
- 删除扩展会一并清除扩展保存的本地数据。

## 项目结构

```text
src/
├── entrypoints/
│   ├── background/   # 定时调度和 Cookie 采集
│   ├── options/      # 任务编辑页面
│   └── popup/        # 任务列表
├── types/            # 类型定义
└── utils/            # 配置与本地存储
```
