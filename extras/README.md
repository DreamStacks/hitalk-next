# 页脚小猫

可选的宿主页彩蛋，不属于评论 SDK，不读取身份或评论数据。

在页面 head 中加载 `secret-cat.css`，以 `defer` 加载 `secret-cat.js`，在页脚放置：

```html
<span class="hitalk-secret" data-hitalk-secret>
  <button type="button" aria-label="点亮小星星" title="点亮小星星">☆</button>
</span>
```

每次点击间隔不超过 1.8 秒，连续点击三次后小猫出现，3.2 秒后收起。再次点击或按 Escape 也可收起。按钮支持键盘操作，焦点保持不变；系统减少动态效果时直接显示和隐藏。没有声音、远端资源、背景循环动画或存储。

示例页直接引用此目录。博客将相同文件以内容摘要命名后随静态站发布，文件来源记录在博客 SDK manifest 的 `extras` 中。
