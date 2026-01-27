/**
 * Hitalk v2 SDK 主入口
 */

import type { HitalkOptions } from '@hitalk/shared'
import { HitalkAPI } from './api'
import { Store } from './store'
import { Editor } from './ui/Editor'
import { Loading } from './ui/Loading'
import { CommentList } from './ui/CommentList'
import { check } from './utils'
import './styles.css'

export class Hitalk {
  private api: HitalkAPI
  private store: Store
  private container: HTMLElement
  private editor: Editor | null = null
  private editorContainer: HTMLElement | null = null
  private loading: Loading | null = null
  private commentList: CommentList | null = null
  private options: Required<HitalkOptions>

  constructor(selector: string | HTMLElement, options: HitalkOptions) {
    // 获取容器元素
    const el =
      typeof selector === 'string' ? document.querySelector(selector) : selector

    if (!el || !(el instanceof HTMLElement)) {
      throw new Error('Hitalk: 无法找到指定的容器元素')
    }

    this.container = el
    this.container.classList.add('Hitalk')

    // 合并配置
    this.options = {
      server: options.server,
      path: options.path || location.pathname.replace(/index\.(html|htm)$/, ''),
      title: options.title || document.title,
      placeholder: options.placeholder || '说点什么吧...',
      avatar: options.avatar || 'mm',
      pageSize: options.pageSize || 10,
    }

    // 初始化
    this.api = new HitalkAPI(this.options.server)
    this.store = new Store()

    // 渲染UI
    this.render()

    // 加载评论
    this.loadComments()

    // 订阅状态变化
    this.store.subscribe(() => {
      this.updateUI()
    })
  }

  /**
   * 渲染初始 UI
   */
  private render() {
    // 创建基本容器结构
    this.container.innerHTML = `
      <div class="editor-container"></div>
      <div class="info">
        <div class="count"></div>
      </div>
      <div class="loading-container"></div>
      <div class="comment-list-container"></div>
    `

    // 初始化 Editor 组件
    this.editorContainer = this.container.querySelector(
      '.editor-container'
    ) as HTMLElement
    if (this.editorContainer) {
      this.editor = new Editor(
        this.editorContainer,
        this.store.getUserInfo(),
        this.options.placeholder,
        data => this.handleSubmit(data),
        () => this.handleCancelReply()
      )
    }

    // 初始化 Loading 组件
    const loadingContainer = this.container.querySelector(
      '.loading-container'
    ) as HTMLElement
    if (loadingContainer) {
      this.loading = new Loading(loadingContainer)
    }

    // 初始化 CommentList 组件
    const commentListContainer = this.container.querySelector(
      '.comment-list-container'
    ) as HTMLElement
    if (commentListContainer) {
      this.commentList = new CommentList(
        commentListContainer,
        this.options.avatar,
        (id, nick) => this.handleReply(id, nick),
        id => this.handleLike(id)
      )
    }
  }

  /**
   * 加载评论
   */
  private async loadComments() {
    this.showLoading(true)

    try {
      const response = await this.api.fetchComments(this.options.path)
      this.store.setComments(response.comments)

      // 更新评论数
      const countEl = this.container.querySelector('.count')
      if (countEl) {
        countEl.innerHTML = `评论(<span class="num">${response.total}</span>)`
      }
    } catch (error) {
      console.error('加载评论失败:', error)
    } finally {
      this.showLoading(false)
    }
  }

  /**
   * 处理提交
   */
  private async handleSubmit(data: {
    nick: string
    email: string
    website: string
    content: string
  }) {
    const { nick: inputNick, email, website, content } = data
    const nick = inputNick || 'Guest'

    // 验证
    if (!content) {
      this.showAlert('好歹也写点文字嘛 ヾ(๑╹◡╹)ﾉ"', false)
      return
    }

    const emailCheck = check.mail(email)
    const websiteCheck = check.link(website)

    if (email && !emailCheck.k) {
      this.showAlert('您的邮箱格式不正确', false)
      return
    }

    if (website && !websiteCheck.k) {
      this.showAlert('您的网址格式不正确', false)
      return
    }

    // 提交
    this.showLoading(true)

    try {
      const replyTarget = this.store.getReplyTarget()

      const comment = await this.api.createComment({
        path: this.options.path,
        title: this.options.title,
        nick,
        email: email || undefined,
        website: website || undefined,
        content: replyTarget ? `@${replyTarget.nick} ${content}` : content,
        parent_id: replyTarget?.id,
      })

      // 先移动回顶部，防止 store 更新触发 updateUI 导致编辑器所在的 DOM 节点被销毁
      this.handleCancelReply()

      // 保存用户信息
      if (nick !== 'Guest') {
        this.store.setUserInfo({ nick, email, website })
      }

      // 清空表单
      this.editor?.clear()

      // 添加到列表
      this.store.addComment(comment)

      // 重新加载评论(刷新树结构)
      await this.loadComments()
    } catch (error: any) {
      console.error('提交评论失败:', error)
      this.showAlert(`提交失败: ${error.message}`, false)
    } finally {
      this.showLoading(false)
    }
  }

  /**
   * 更新 UI
   */
  private updateUI() {
    const comments = this.store.getComments()

    // 使用 CommentList 组件更新评论列表
    this.commentList?.update(comments)
  }

  /**
   * 处理回复
   */
  private handleReply(id: string, nick: string) {
    this.store.setReplyTarget({ id, nick })

    // 找到当前点击的评论
    const commentEl = this.container.querySelector(`.vcard#${id} > section`)
    if (commentEl && this.editorContainer) {
      // 移动编辑器到评论下方
      commentEl.appendChild(this.editorContainer)

      // 修改 placeholder 并聚焦
      const editorInput = this.editorContainer.querySelector(
        '.veditor'
      ) as HTMLTextAreaElement
      if (editorInput) {
        editorInput.placeholder = `回复 @${nick}`
        editorInput.focus()
      }

      // 显示取消按钮
      const cancelBtn = this.editorContainer.querySelector('.vcancel-reply')
      cancelBtn?.classList.remove('dn')
    }
  }

  /**
   * 取消回复，编辑器回到顶部
   */
  private handleCancelReply() {
    this.store.setReplyTarget(null)

    if (this.editorContainer) {
      // 移动回顶部
      const firstChild = this.container.firstChild
      if (firstChild && firstChild !== this.editorContainer) {
        this.container.insertBefore(this.editorContainer, firstChild)
      } else if (!firstChild) {
        this.container.appendChild(this.editorContainer)
      }

      // 重置 placeholder
      const editorInput = this.editorContainer.querySelector(
        '.veditor'
      ) as HTMLTextAreaElement
      if (editorInput) {
        editorInput.placeholder = this.options.placeholder
      }

      // 隐藏取消按钮
      const cancelBtn = this.editorContainer.querySelector('.vcancel-reply')
      cancelBtn?.classList.add('dn')
    }
  }

  /**
   * 处理点赞
   */
  private async handleLike(id: string) {
    try {
      const result = await this.api.likeComment(id)

      // 更新点赞数
      const likeEl = this.container.querySelector(
        `.vlike[data-id="${id}"] .vlike-count`
      )
      if (likeEl) {
        likeEl.textContent =
          result.like_count > 0 ? String(result.like_count) : ''
      }

      if (!result.success) {
        this.showAlert('您已经点过赞了', false)
      }
    } catch (error: any) {
      console.error('点赞失败:', error)
      this.showAlert(`点赞失败: ${error.message}`, false)
    }
  }

  /**
   * 显示/隐藏加载
   */
  private showLoading(show: boolean) {
    if (show) {
      this.loading?.show()
    } else {
      this.loading?.hide()
    }
  }

  /**
   * 显示提示
   */
  private showAlert(message: string, _showConfirm: boolean) {
    const mark = this.container.querySelector('.vmark')
    if (!mark) return

    mark.innerHTML = `
      <div class="valert">
        <div class="vtext">${message}</div>
        <div class="vbtns">
          <button class="vcancel vbtn">好的</button>
        </div>
      </div>
    `

    const cancelBtn = mark.querySelector('.vcancel')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        mark.classList.add('dn')
      })
    }

    mark.classList.remove('dn')
  }
}

/**
 * 全局挂载函数
 */
export function mount(
  selector: string | HTMLElement,
  options: HitalkOptions
): Hitalk {
  return new Hitalk(selector, options)
}
