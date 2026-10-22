# SelectSpeak · 划词朗读翻译

Chrome / Microsoft Edge 桌面浏览器扩展。选中网页里的英文单词，立即显示中文释义并自动朗读。

## 安装到 Chrome

1. 打开 `chrome://extensions`。
2. 开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目目录（包含 `manifest.json` 的这一层）。
4. 刷新已打开的网页，选中英文试用。建议将 SelectSpeak 固定到工具栏。

## 安装到 Edge

1. 打开 `edge://extensions`。
2. 开启「开发人员模式」。
3. 点击「加载解压缩的扩展」，选择同一个项目目录。
4. 刷新已打开的网页后使用。

也可以加载 `npm run package` 生成的 `dist/SelectSpeak` 目录。ZIP 需要先解压，再加载。无需安装 npm 依赖，也不需要启动服务器。

## 使用

- 双击英文单词或拖动选择英文短语：显示中文释义，默认自动朗读所选英文。
- 点击卡片喇叭：停止当前朗读，或再次播放。
- 按 Esc、点击页面空白或滚动网页：关闭卡片并停止该卡片的朗读。
- 点击工具栏图标：开关划词、开关自动朗读、开关在线补充、切换美式 / 英式英语、选择发音、调整语速。
- 点击设置面板底部「去试一试」：打开内置练习页。
- 设置自动保存；修改扩展代码后，在扩展管理页点击重新加载，并刷新网页。

## 翻译与发音

内置 ECDICT 的 36,884 个常用英文词条及 28,470 个词形变体，按首字母分片按需加载。单词查询优先在本地完成，显示中文释义和词库中已有的音标。音标来自词库，与实际选择的美式 / 英式语音可能不同。

词库未收录的内容通过 [MyMemory](https://mymemory.translated.net/doc/spec.php) 补充英文到简体中文翻译，无需 API Key。该服务有[免费额度](https://mymemory.translated.net/doc/usagelimits.php)，译文质量、可用性和延迟由服务提供方决定。关闭「在线补充翻译」后，全部查词在本地进行。在线结果只缓存在当前浏览器会话中，最多 200 条，重启浏览器后清除。

朗读使用 `chrome.tts` 和系统 / 浏览器中可用的英文语音。没有安装对应英语语音时，需要在操作系统的语音设置中添加。标注「在线」的语音需要联网。翻译不可用时仍可朗读。

支持普通 HTTP / HTTPS 网页以及其中可注入的 iframe。浏览器内部页面、扩展商店、内置 PDF 阅读器、图片文字或 Canvas 文本不支持；输入框和可编辑区域不会触发查词。每次最多选择 160 个字符且不超过 480 UTF-8 字节。词义为词典常见义项，当前不根据整句上下文消歧。

## 开发与检查

项目使用原生 JavaScript、Manifest V3 和 Shadow DOM，没有运行时第三方依赖。

```sh
npm test
npm run check
npm run package
```

已完成的自动测试、浏览器检查及未验证的平台见 [验证记录](VERIFICATION.md)。

更新词库：先将 ECDICT 的 `ecdict.csv` 下载至 `output/sources/ecdict.csv`，再运行 `python3 scripts/build-dictionary.py`。脚本校验来源 Git blob SHA，筛选考试词汇、牛津标记词及 BNC / FRQ 频次前 30,000 的词汇，并添加词形变体。来源版本见 `data/dictionary-meta.json`。

## 文件

- `manifest.json`：Chrome / Edge 共用的扩展配置。
- `src/content.js`：选区检测、翻译卡片、播放交互和页面样式隔离。
- `src/background.js`：消息处理、系统朗读、设置和在线翻译缓存。
- `src/dictionary.js` / `data/dictionary`：本地词典查询和词库。
- `popup.html` / `src/popup.*`：设置面板。
- `practice.html`：内置划词练习页。
- `PRIVACY.md` / `THIRD_PARTY_NOTICES.md`：数据处理说明和第三方许可。

本项目目前以本地开发者模式安装，尚未发布到 Chrome 或 Edge 扩展商店。
