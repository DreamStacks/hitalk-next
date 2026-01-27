/**
 * 状态管理(简单响应式实现)
 */

import type { Comment, UserInfo } from '@hitalk/shared'

type Listener = () => void

export class Store {
  private comments: Comment[] = []
  private userInfo: UserInfo | null = null
  private replyTarget: { id: string; nick: string } | null = null
  private loading: boolean = false
  private listeners: Set<Listener> = new Set()

  constructor() {
    // 从 localStorage 加载用户信息
    this.loadUserInfo()
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 触发更新
   */
  private notify() {
    this.listeners.forEach(listener => listener())
  }

  /**
   * 设置评论列表
   */
  setComments(comments: Comment[]) {
    this.comments = comments
    this.notify()
  }

  /**
   * 获取评论列表
   */
  getComments(): Comment[] {
    return this.comments
  }

  /**
   * 添加评论
   */
  addComment(comment: Comment) {
    this.comments.unshift(comment)
    this.notify()
  }

  /**
   * 设置用户信息
   */
  setUserInfo(info: UserInfo) {
    this.userInfo = info
    // 保存到 localStorage
    localStorage.setItem('HitalkCache', JSON.stringify(info))
    this.notify()
  }

  /**
   * 获取用户信息
   */
  getUserInfo(): UserInfo | null {
    return this.userInfo
  }

  /**
   * 加载用户信息
   */
  private loadUserInfo() {
    const cached = localStorage.getItem('HitalkCache')
    if (cached) {
      try {
        this.userInfo = JSON.parse(cached)
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * 设置回复目标
   */
  setReplyTarget(target: { id: string; nick: string } | null) {
    this.replyTarget = target
    this.notify()
  }

  /**
   * 获取回复目标
   */
  getReplyTarget() {
    return this.replyTarget
  }

  /**
   * 设置加载状态
   */
  setLoading(loading: boolean) {
    this.loading = loading
    this.notify()
  }

  /**
   * 获取加载状态
   */
  isLoading(): boolean {
    return this.loading
  }
}
