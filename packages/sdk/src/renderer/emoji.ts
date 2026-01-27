/**
 * 表情渲染器
 */

// 表情数据
const emojiData = {
  泡泡: `呵呵|哈哈|吐舌|太开心|笑眼|花心|小乖|乖|捂嘴笑|滑稽|你懂的|不高兴|怒|汗|黑线|泪|真棒|喷|惊哭|阴险|鄙视|酷|啊|狂汗|what|疑问|酸爽|呀咩爹|委屈|惊讶|睡觉|笑尿|挖鼻|吐|犀利|小红脸|懒得理|勉强|爱心|心碎|玫瑰|礼物|彩虹|太阳|星星月亮|钱币|茶杯|蛋糕|大拇指|胜利|haha|OK|沙发|手纸|香蕉|便便|药丸|红领巾|蜡烛|音乐|灯泡|开心|钱|咦|呼|冷|生气|弱`,
  阿鲁: `高兴|小怒|脸红|内伤|装大款|赞一个|害羞|汗|吐血倒地|深思|不高兴|无语|亲亲|口水|尴尬|中指|想一想|哭泣|便便|献花|皱眉|傻笑|狂汗|吐|喷水|看不见|鼓掌|阴暗|长草|献黄瓜|邪恶|期待|得意|吐舌|喷血|无所谓|观察|暗地观察|肿包|中枪|大囧|呲牙|抠鼻|不说话|咽气|欢呼|锁眉|蜡烛|坐等|击掌|惊喜|喜极而泣|抽烟|不出所料|愤怒|无奈|黑线|投降|看热闹|扇耳光|小眼睛|中刀`,
}

const suffix = '@2x'

/**
 * 渲染表情选择器
 */
export function renderEmojiPicker(): string {
  const categories = Object.keys(emojiData)
  let itemsHtml = ''
  let tabsHtml = ''

  categories.forEach((category, index) => {
    const emojis = emojiData[category as keyof typeof emojiData].split('|')
    const isActive = index === 0
    const prefix = category === '泡泡' ? '@' : '#'
    const className = category === '泡泡' ? 'newpaopao' : 'alu'

    const items = emojis
      .map(
        emoji => `
      <li class="smiles-item" title="${emoji}" data-input="${prefix}(${emoji})">
        <img class="biaoqing ${className}"
             title="${emoji}"
             src="https://cdn.ihoey.com/${className}/${emoji}${suffix}.png"
             alt="${emoji}"
        />
      </li>
    `
      )
      .join('')

    itemsHtml += `
      <ul class="smiles-items smiles-items-${className}${isActive ? ' smiles-items-show' : ''}" data-id="${index}">
        ${items}
      </ul>
    `

    tabsHtml += `<li class="smiles-name${isActive ? ' smiles-package-active' : ''}" data-id="${index}">
      <span>${category}</span>
    </li>`
  })

  return `
    <div class="smiles-body">
      ${itemsHtml}
      <div class="smiles-bar">
        <ul class="smiles-packages">${tabsHtml}</ul>
      </div>
    </div>
  `
}
