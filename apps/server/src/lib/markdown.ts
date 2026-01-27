/**
 * Markdown 渲染与安全处理
 * 将 Markdown 转换为安全的 HTML
 */

import MarkdownIt from 'markdown-it'
import { full as emoji } from 'markdown-it-emoji'
import filterXSS from 'xss'

// 初始化 Markdown 渲染器
const md = new MarkdownIt({
  html: false, // 禁止原始 HTML 输入
  breaks: true, // 支持换行
  linkify: true, // 自动识别链接
  typographer: true,
})

// 添加 emoji 插件
md.use(emoji)

// 表情数据 (从 v1 迁移)
const emojiData = {
  泡泡: `呵呵|哈哈|吐舌|太开心|笑眼|花心|小乖|乖|捂嘴笑|滑稽|你懂的|不高兴|怒|汗|黑线|泪|真棒|喷|惊哭|阴险|鄙视|酷|啊|狂汗|what|疑问|酸爽|呀咩爹|委屈|惊讶|睡觉|笑尿|挖鼻|吐|犀利|小红脸|懒得理|勉强|爱心|心碎|玫瑰|礼物|彩虹|太阳|星星月亮|钱币|茶杯|蛋糕|大拇指|胜利|haha|OK|沙发|手纸|香蕉|便便|药丸|红领巾|蜡烛|音乐|灯泡|开心|钱|咦|呼|冷|生气|弱`,
  阿鲁: `高兴|小怒|脸红|内伤|装大款|赞一个|害羞|汗|吐血倒地|深思|不高兴|无语|亲亲|口水|尴尬|中指|想一想|哭泣|便便|献花|皱眉|傻笑|狂汗|吐|喷水|看不见|鼓掌|阴暗|长草|献黄瓜|邪恶|期待|得意|吐舌|喷血|无所谓|观察|暗地观察|肿包|中枪|大囧|呲牙|抠鼻|不说话|咽气|欢呼|锁眉|蜡烛|坐等|击掌|惊喜|喜极而泣|抽烟|不出所料|愤怒|无奈|黑线|投降|看热闹|扇耳光|小眼睛|中刀`,
}

// 表情正则
const paoRegex = new RegExp(
  `@\\(\\s*(${emojiData.泡泡.replace(/\|/g, '|')})\\s*\\)`,
  'g'
)
const aluRegex = new RegExp(
  `#\\(\\s*(${emojiData.阿鲁.replace(/\|/g, '|')})\\s*\\)`,
  'g'
)

// 检测高分屏
const suffix = '@2x'

/**
 * 转换表情语法为 img 标签
 * @(表情) → newpaopao
 * #(表情) → alu
 */
function convertEmoji(text: string): string {
  let result = text

  // 转换泡泡表情
  result = result.replace(paoRegex, (match, name) => {
    return `<img src="https://cdn.ihoey.com/newpaopao/${name}${suffix}.png" class="biaoqing newpaopao" height="30" width="30" alt="${name}" />`
  })

  // 转换阿鲁表情
  result = result.replace(aluRegex, (match, name) => {
    return `<img src="https://cdn.ihoey.com/alu/${name}${suffix}.png" class="biaoqing alu" height="33" width="33" alt="${name}" />`
  })

  return result
}

/**
 * 渲染 Markdown 为 HTML
 * @param markdown Markdown 文本
 * @returns 安全的 HTML
 */
export function renderMarkdown(markdown: string): string {
  // 1. Markdown → HTML
  let html = md.render(markdown)

  // 2. 转换表情语法
  html = convertEmoji(html)

  // 3. XSS 安全清洗
  const cleanHtml = filterXSS(html, {
    whiteList: {
      p: [],
      br: [],
      strong: [],
      em: [],
      u: [],
      del: [],
      code: [],
      pre: [],
      a: ['href', 'title', 'target', 'rel', 'class'],
      img: ['src', 'alt', 'class', 'height', 'width', 'title'],
      blockquote: [],
      ul: [],
      ol: [],
      li: [],
      h1: [],
      h2: [],
      h3: [],
      h4: [],
      h5: [],
      h6: [],
      span: ['class'],
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script'],
  })

  return cleanHtml
}

/**
 * 获取表情数据(供前端使用)
 */
export function getEmojiData() {
  return emojiData
}
