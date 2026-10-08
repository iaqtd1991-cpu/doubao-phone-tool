# 部署到 Render，让手机独立联网使用

目标：得到一个 `https://...` 地址，手机直接打开后可以使用摄像头、麦克风、豆包语音视频沟通。

## 你需要准备

- 一个 Render 账号：https://render.com
- 一个 GitHub 账号：https://github.com
- 火山方舟 API Key

## 第一步：上传到 GitHub

如果你不会用 Git 命令，可以这样做：

1. 打开 GitHub，新建仓库，例如 `doubao-phone-tool`。
2. 进入仓库页面，点击 `Add file`。
3. 选择 `Upload files`。
4. 上传本目录里的全部文件：

```text
server.js
package.json
render.yaml
Dockerfile
README.md
DEPLOY_RENDER.md
.env.example
public/
```

如果 GitHub 不方便一次上传文件夹，可以上传压缩包里的文件，或先解压后拖入网页。

## 第二步：Render 创建服务

1. 打开 Render。
2. 点击 `New`。
3. 选择 `Web Service`。
4. 连接刚才的 GitHub 仓库。
5. 配置：

```text
Name: doubao-phone-tool
Environment: Node
Build Command: npm install --omit=dev
Start Command: npm start
```

6. 如果 Render 让你选择 Root Directory：

```text
如果仓库只放了本项目：留空
如果仓库是整个 iaqtd-AI：填 work/doubao-phone-tool
```

## 第三步：添加环境变量

在 Render 的 Environment 页面添加：

```text
ARK_API_KEY=你的火山方舟APIKey
ARK_MODEL=doubao-seed-2-1-pro-260628
ARK_VISION_MODEL=doubao-seed-2-1-pro-260628
```

不要把 `ARK_API_KEY` 写到前端代码里。

## 第四步：打开手机使用

部署完成后，Render 会给一个 HTTPS 地址，例如：

```text
https://doubao-phone-tool.onrender.com
```

手机打开这个地址：

```text
作业 -> 开视频 -> 允许摄像头 -> 语音问豆包 -> 允许麦克风
```

## 常见问题

### 摄像头或麦克风打不开

确认地址是 `https://` 开头。手机浏览器通常不允许普通 `http://` 页面使用摄像头和麦克风。

### 豆包没有真实回复

检查 Render 的环境变量里是否设置了 `ARK_API_KEY`，然后重新部署或重启服务。

### iPhone 语音识别不稳定

浏览器语音识别能力由手机系统和浏览器决定。安卓 Chrome 一般更稳定；iPhone 如遇到语音识别受限，可继续使用文字输入或后续接入云端 ASR。
