# 音频素材

## 背景音乐

大厅、个人资料、匹配和好友等待房使用 Kevin MacLeod 的 **Local Forecast - Elevator**；准备、对战、补猜及结算使用 **Sneaky Snitch**。返回大厅恢复大厅配乐，同场景重绘不重新播放。

| 文件 | 原曲 / ISRC | 循环长度 |
| --- | --- | --- |
| `assets/resources/audio/music-lobby.mp3` | Local Forecast - Elevator / USUAN1300012 | 46.829 秒 |
| `assets/resources/audio/music-battle.mp3` | Sneaky Snitch / USUAN1100772 | 44.138 秒 |

来源和许可：

- [Local Forecast - Elevator](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1300012)
- [Sneaky Snitch](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100772)
- 两首作者均为 **Kevin MacLeod (incompetech.com)**，根据 **Creative Commons Attribution 4.0** 使用：[许可](https://creativecommons.org/licenses/by/4.0/)。官网曲目页面的 Attribution Code 已核对。
- 修改：截取 16 小节、80 ms 首尾交叉淡化、响度归一化，编码为单声道 32 kHz、48 kbps MP3。点击游戏设置中「背景音乐」左侧的音符图标，弹出作者、曲名、来源、许可链接和修改说明；右侧开关仍只控制音乐开关，不增加额外文字行。
- 精确截取参数和原文件 SHA-256 见 `music-sources.json`。从官网将原 MP3 下载到仓库外并分别命名为 `lobby.mp3`、`battle.mp3` 后，可用 `python3 scripts/prepare-bgm.py /path/to/originals` 重建；依赖 ffmpeg。原始完整歌曲不放入游戏包。

只在用户首次操作后播放；音乐与音效可独立关闭，切后台暂停。音乐场景切换先淡出后淡入，异步加载完成不会覆盖当前目标曲目。自己的对战/补猜回合最后 5 秒，音乐从 0.28 降至 0.09，回合结束恢复。

循环 PCM 接缝经过交叉淡化；MP3 的设备解码和微信音频后端仍可能影响循环接缝，须在微信开发者工具及真机试听，不把本地导出当作真机音频验收。

## 原创音效

音效由 `scripts/generate-audio.py` 合成，不使用第三方采样，合成为 22050 Hz、16 bit、单声道 PCM 后，编码为 48 kbps MP3，以控制微信总包体积。
事件：tap 按键；submit 验证；ready 锁牌/入座；turn 自己回合；warning 剩余 5 秒；error 请求失败；hit0～hit4 命中反馈；win/lose/draw 结算。

旧 20 秒原创 `music.mp3` 及 WAV 音效已移出资源目录，避免重复打包；生成脚本仅生成 MP3 音效，不覆盖新配乐。
