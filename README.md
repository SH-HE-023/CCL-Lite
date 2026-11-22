# CCL Lite（Communist Craft Launcher · 开源精简版）

我的世界 Java 版启动器（Windows 优先）。这是 **公开源码用的精简版**：只保留**启动**和**下载**，账户仅离线模式。

- 桌面框架：Electron 33（主进程负责文件、网络、进程，渲染层负责界面）
- 界面栈：React 18 + TypeScript + Vite + Tailwind CSS
- 视觉：三色体系（墨黑 `#0B0D0A` / 纸白 `#F0F1E8` / 强调绿 `#C6F24E`），主题固定不可切换
- 构建产物：Windows portable exe（`release/CCL-Lite-<version>.exe`）

## 功能范围

保留：
- 版本下载（Mojang 官方源，正式版 / 测试版 / 远古版本）
- 加载器（Fabric / Quilt / Forge / NeoForge）
- 内容下载（Modrinth：模组 / 整合包 / 资源包 / 数据包 / 光影包）
- 离线账户（按用户名解析正版皮肤，查不到回退默认史蒂夫）
- 启动（Java 自动检测 / 自动下载 Mojang 运行时、内存分配、日志与进度）
- 设置（游戏目录 / Java / 内存）

已移除：
- 微软正版登录（设备码流程）与外置登录（authlib-injector）
- 联机中心（局域网 / P2P / 隧道 / UPnP / 关闭正版验证）
- 第三方联机软件面板、帮助指南、启动器在线更新

## 开发

```bash
npm install
npm run dev        # Vite + Electron，热更新
npm run typecheck  # 类型检查
npm run build      # 构建渲染层 + 主进程
npm run package    # 打包 Windows portable exe
```

> 国内网络安装依赖或打包时，可先设置镜像：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
> `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`

## 目录结构

```
electron/
  main.ts        主窗口（无边框 + 自绘标题栏）、生产/开发加载
  preload.ts     contextBridge 暴露 window.qidonqi
  ipc.ts         IPC 路由（状态 / 设置 / 版本 / 启动 / 账户 / 皮肤 / 下载 / 窗口）
  store.ts       配置持久化（%APPDATA%\Qidonqi\config.json）
  net.ts         下载器（重试、并发池、进度）
  mojang.ts      版本清单、规则判断、原版安装（jar / libraries / assets / natives）
  launch.ts      继承链合并、参数占位符替换、Java 选择、进程启动
  java.ts        Java 检测（注册目录 / PATH / 内置运行时）与 Mojang 运行时下载
  loaders.ts     Fabric / Quilt（profile json）与 Forge / NeoForge（安装器）
  modrinth.ts    Modrinth 检索与模组 / 光影 / 整合包下载
  modpack.ts     整合包（mrpack）解析与安装
  skin.ts        皮肤解析（按 UUID 或用户名取 64x64 贴图，回退默认史蒂夫）
  versions.ts    已安装版本扫描与删除
  task.ts        任务进度 / 日志 / 完成事件
src/
  App.tsx        单行顶栏（CCL 字标 + 胶囊导航 + 账户 + 最小化/关闭）
  pages/         Home（启动）/ Download（下载）/ Settings（设置）
```

## 发布

打包后 `release/CCL-Lite-<version>.exe` 即可直接分发。本版不含自动更新模块，更新由发布者手动替换安装包。

## 说明

安装包名、`appId`、数据目录沿用 `Qidonqi`，与完整版共用；若需要完全隔离，改 `package.json` 的 `build.appId` / `productName` 与 `electron/main.ts` 的 `app.setName` 即可。
