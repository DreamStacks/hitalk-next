-- Local playground demo only. All identities, comments and likes are fictional.
-- Stable IDs make this additive and repeatable; existing rows are never replaced.
INSERT INTO pages(path, title) VALUES('/playground', 'Hitalk 开发示例')
ON CONFLICT(path) DO NOTHING;

WITH seed(id, nick, content_md, age, is_pinned, is_admin) AS (VALUES
  ('demo-playground-01', 'Hitalk', '**欢迎来到留言小院 🌿**

这里的昵称、评论和点赞均为虚构的演示数据，用来体验评论界面。你可以在下方留言，也可以试试回复、表情和点赞。', '-5 minutes', 1, 1),
  ('demo-playground-02', '林间', '今天把手机放进口袋，沿着河边走了一小段路。才发现树叶已经悄悄换了颜色。🍃', '-20 minutes', 0, 0),
  ('demo-playground-03', '小满', '试试 **Markdown**：

- 一本还没读完的书
- 一杯刚好温热的茶
- 一个可以慢慢说话的地方

你今天的小确幸是什么？', '-45 minutes', 0, 0),
  ('demo-playground-04', '阿澈', '分享一个小片段：

```js
const greeting = "你好，世界"
console.log(greeting)
```

也试一下行内代码 `hello()`，看看代码在留言中是什么样子。', '-2 hours', 0, 0),
  ('demo-playground-05', '南风', '> 把今天值得记住的小事，留在这里。

这是一条引用样式的演示。偶尔写下来，会发现普通的一天也很丰富。', '-3 hours', 0, 0),
  ('demo-playground-06', '橙子', '测试一下熟悉的表情：@(呵呵) @(爱心) #(高兴)

文字之外，也可以用一个小表情打招呼。', '-4 hours', 0, 0),
  ('demo-playground-07', '山茶', '这一条用来看看长留言的阅读体验。

周末去了一家很小的书店。窗边放着两把椅子，阳光落在书页上，店里安静得能听见翻书声。

原本只想停留十分钟，最后却坐了一个下午。没有特别的计划，只是翻翻书，看看窗外的人经过。

后来想，生活里那些很舒服的时刻，往往不是提前安排好的。它们可能藏在一条绕远的路上，也可能是一句偶然听见的问候。

如果你也有一个喜欢的小地方，欢迎在回复里分享。

这段文字稍长，可以用来检查正文折叠、展开，以及回复时输入框的位置。', '-5 hours', 0, 0),
  ('demo-playground-08', '木木', '给今天留一个小目标：把手头的一件事认真做完，然后去散步。', '-7 hours', 0, 0),
  ('demo-playground-09', '晴川', '手机上也来留一句。想看看窄屏下的换行和回复布局，读起来是不是一样轻松。', '-9 hours', 0, 0),
  ('demo-playground-10', '知夏', '午后的风有一点凉，刚好适合打开窗。☀️', '-12 hours', 0, 0),
  ('demo-playground-11', '一禾', '翻到第二页了。这条留言用来验证“加载更多”，看看之前的评论会不会保留。', '-1 day', 0, 0),
  ('demo-playground-12', '远山', '留一个最简单的问候：你好呀。', '-2 days', 0, 0)
)
INSERT INTO comments(id, page_id, nick, content_md, created_at, updated_at, is_pinned, is_admin)
SELECT seed.id, pages.id, seed.nick, seed.content_md,
       datetime('now', seed.age), datetime('now', seed.age), seed.is_pinned, seed.is_admin
FROM seed JOIN pages ON pages.path = '/playground'
WHERE true
ON CONFLICT(id) DO NOTHING;

INSERT INTO comments(id, page_id, parent_id, nick, content_md, created_at, updated_at)
SELECT 'demo-playground-r1', id, 'demo-playground-02', '小满', '走慢一点，真的能看到平时忽略的风景。🍃', datetime('now', '-15 minutes'), datetime('now', '-15 minutes')
FROM pages WHERE path = '/playground'
ON CONFLICT(id) DO NOTHING;

INSERT INTO comments(id, page_id, parent_id, nick, content_md, created_at, updated_at)
SELECT 'demo-playground-r2', id, 'demo-playground-r1', '林间', '是呀，下次准备带上相机。', datetime('now', '-10 minutes'), datetime('now', '-10 minutes')
FROM pages WHERE path = '/playground'
ON CONFLICT(id) DO NOTHING;

INSERT INTO comments(id, page_id, parent_id, nick, content_md, created_at, updated_at)
SELECT 'demo-playground-r3', id, 'demo-playground-03', '南风', '我的小确幸是今天买到了刚出炉的面包。', datetime('now', '-30 minutes'), datetime('now', '-30 minutes')
FROM pages WHERE path = '/playground'
ON CONFLICT(id) DO NOTHING;

INSERT INTO comments(id, page_id, parent_id, nick, content_md, created_at, updated_at)
SELECT 'demo-playground-r4', id, 'demo-playground-07', '阿澈', '我喜欢家附近的小公园，傍晚的光很好看。', datetime('now', '-1 hour'), datetime('now', '-1 hour')
FROM pages WHERE path = '/playground'
ON CONFLICT(id) DO NOTHING;

-- Let database triggers calculate like_count and page comment_count.
INSERT INTO comment_likes(comment_id, ip_hash) VALUES
  ('demo-playground-01', 'demo-reader-1'),
  ('demo-playground-01', 'demo-reader-2'),
  ('demo-playground-01', 'demo-reader-3'),
  ('demo-playground-02', 'demo-reader-1'),
  ('demo-playground-02', 'demo-reader-2'),
  ('demo-playground-03', 'demo-reader-1'),
  ('demo-playground-03', 'demo-reader-2'),
  ('demo-playground-07', 'demo-reader-1'),
  ('demo-playground-07', 'demo-reader-2'),
  ('demo-playground-r1', 'demo-reader-1')
ON CONFLICT(comment_id, ip_hash) DO NOTHING;

-- Synthetic UA samples for demo rows only; never replace a populated UA.
WITH demo_ua(id, ua) AS (VALUES
  ('demo-playground-01', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36'),
  ('demo-playground-02', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
  ('demo-playground-03', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'),
  ('demo-playground-04', 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'),
  ('demo-playground-05', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'),
  ('demo-playground-07', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'),
  ('demo-playground-r1', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
  ('demo-playground-r2', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36'),
  ('demo-playground-r3', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'),
  ('demo-playground-r4', 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')
)
UPDATE comments
SET ua = (SELECT ua FROM demo_ua WHERE demo_ua.id = comments.id)
WHERE ua IS NULL AND id IN (SELECT id FROM demo_ua);
