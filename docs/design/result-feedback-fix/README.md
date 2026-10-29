# 结算和猜测反馈切图修复

遵循项目 design-ui-reconstruction：复用已批准源图的完整边框、皇冠、锁徽和统计分区。素材清单先写于 manifest.json，脚本为 scripts/repair-result-feedback.py。

- victory-title：从 12-end-feedback.png 提取完整皇冠与面板，替换之前横切中断的下边框；结果原因由原生文字填写。
- result-paper：从 06-defeat-result.png 恢复四个原稿分区，保留边框，移除样例次数、底牌及旧按钮。被标题遮挡的顶边用本面板底边翻转修复；动态留白以同源纸纹补齐并匹配边缘颜色，不称为无损切图。paper-master.png 为改动前的干净纸纹参考，不进入游戏包。
- own / own-gold：重新清理标题、命中数字、底部提示区域；保留完整锁徽、边框和计分区。运行时标题位于 -52、分数 50、提示 158，形成明确层次。
- 对手头像：原反馈图已包含金色头像框，运行时仅插入圆形头像，中心按原稿映射至 (-210.6, -7.3)，不再额外叠加另一套头像框。小屏反馈缩放与现有对局布局一致。

原有资源 .meta 和 UUID 保持不变。dark.jpg / light.jpg 是素材深浅底检查图；实际游戏截图见 docs/verification/result-feedback-fix/。
