# 页脚小猫

可选的宿主页彩蛋，不属于评论 SDK，不读取身份或评论数据。

在页面 head 中加载 `secret-cat.css`，以 `defer` 加载 `secret-cat.js`，在页脚放置：

```html
<span class="hitalk-secret" data-hitalk-secret>
  <button type="button" aria-label="叫小猫出来" title="叫小猫出来"></button>
</span>
```

默认只露出耳朵和半个脑袋，悬停时稍微探头、摆尾。点击一次小猫完整探出并回应「喵，叫我吗？」，4.8 秒后收起。再次点击或按 Escape 也可收起。按钮支持键盘操作，焦点保持不变；系统减少动态效果时直接显示和隐藏。没有声音、远端资源、背景循环动画或存储。

示例页直接引用此目录。博客将相同文件以内容摘要命名后随静态站发布，文件来源记录在博客 SDK manifest 的 `extras` 中。
