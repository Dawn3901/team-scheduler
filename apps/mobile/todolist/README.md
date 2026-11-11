# 同频 TeamSync Android 客户端

基于现有 Android 工程的轻量 WebView 壳，在线复用 Web 的登录、团队、日历、任务和实时连接。不复制业务代码，不内置服务器或演示账号，不支持离线写入和后台推送；支持未来 7 天活动/任务的本地定时通知（W4）。

## 使用

1. Android Studio 打开此目录，等待 Gradle 同步，运行 app。
2. 默认直接打开 `http://127.0.0.1:5173/`，无顶部原生工具栏。修改 `app/src/main/java/com/qba/todolist/MainActivity.kt` 中 `serverUrl` 即可更换服务器。
3. 模拟器使用默认地址前，在电脑执行 `adb reverse tcp:5173 tcp:5173`，并保持 Web 和后端同时运行（后端在原仓库执行 `make dev-api`）。模拟器重启后可能需要重新执行端口转发。
4. Android 返回键优先返回网页历史；根页面退出。连接失败时点击错误提示重试。
5. 登录状态保存在 WebView 的站点存储中，重启保留；退出登录使用 Web 内的退出功能。
6. 首次进入团队会请求通知权限；Android 12+ 若未允许“闹钟和提醒”，本地通知会退化为非精确提醒。拒绝通知权限不影响网页使用。

推荐正式环境使用 HTTPS，同一站点反向代理 `/api`（含 WebSocket）到后端，并配置 SPA 路由回退到 index.html。TLS 证书错误由 WebView 拒绝，客户端不绕过证书验证。

局域网调试：电脑和手机连接同一网络，在原 Web 工程运行 `pnpm --filter @teamsync/web exec vite --host 0.0.0.0`，保持后端运行。修改客户端地址为电脑局域网 IP 和 5173 端口；模拟器也可用 `http://10.0.2.2:5173`。手机的 localhost 是手机自身。防火墙需允许该端口。现有 Vite 配置已代理 `/api`，无需修改后端 CORS。

## 构建与检查

```bash
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

APK：`app/build/outputs/apk/debug/app-debug.apk`。需要本机 Android SDK 37 和兼容的 JDK；沿用原工程 Gradle/依赖版本。发布签名需自行配置，debug APK 仅供开发测试。

## 实现与验证范围

使用系统 WebView，开启 JavaScript、DOM storage；关闭文件/内容访问。只暴露受限的 `TeamSyncAndroid` 通知桥（排程/取消/权限），不暴露文件、网络或任意原生能力；不申请存储、定位等权限。HTTP 为局域网调试开放，请仅连接可信服务器。外部站点链接交由系统浏览器，登录凭证不注入外部页面。禁用系统备份，避免复制登录存储。

自动测试覆盖地址校验和同源导航判断。真机还需检查：登录后重启、团队/活动/任务操作、软键盘、安全区域、返回、断网重试、WebSocket 重连以及 Web 在窄屏下的布局。系统 WebView 需保持更新。后台不保活，Web 通知中心只在页面在线时工作；本地通知由 `AlarmManager` 排程，不依赖后台服务。

本机本次构建：默认 aapt2 下载发生 TLS 握手失败，临时使用已安装的 SDK 工具完成 APK 和单元测试（未把机器路径写入 Gradle 配置）：

```bash
./gradlew :app:assembleDebug :app:testDebugUnitTest --offline --no-configuration-cache -Pandroid.aapt2FromMavenOverride=/home/qba/Android/Sdk/build-tools/36.0.0/aapt2
```

上述命令通过。Lint 因缺少 `com.android.tools.lint:lint-gradle:32.5.0` 离线缓存而未完成，网络恢复后运行标准检查命令。未进行真机验收。

## 本地通知（W4，待编译/真机验证）

`MainActivity` 通过 `addJavascriptInterface(..., "TeamSyncAndroid")` 暴露四个方法：`schedule`、`cancel`、`permission`、`requestPermission`。Web 在团队页计算未来 7 天提醒（活动开始前 15 分钟、本人任务截止前 1 小时），按 team+kind 整批传入；原生用 AlarmManager 排程，`SharedPreferences` 保存，重启由 `BootReceiver` 恢复。

新增文件：`NotificationScheduler.kt`、`NotificationReceiver.kt`、`BootReceiver.kt`、`ScheduledNotification.kt`。Manifest 增加 `POST_NOTIFICATIONS`、`SCHEDULE_EXACT_ALARM`、`RECEIVE_BOOT_COMPLETED`，Activity 改 `singleTop` 以处理通知点击深链。

**当前环境没有 JDK/Android SDK，W4 的 Kotlin/Manifest 改动尚未执行 `assembleDebug` 或真机验证**；首次用 Android Studio 打开时先修编译错误，再按 `docs/ai/05` §6.3 打勾。
