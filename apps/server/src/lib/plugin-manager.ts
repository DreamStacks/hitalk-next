import type { HitalkPlugin, PluginContext, CommentRow, Page } from '../types'

export class PluginManager {
  private plugins = new Map<string, HitalkPlugin>()

  register(plugin: HitalkPlugin) {
    this.plugins.set(plugin.name, plugin)
  }

  async commentCreated(
    ctx: PluginContext,
    comment: CommentRow,
    page: Page,
    parent?: CommentRow
  ) {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.onCommentCreated?.(ctx, comment, page, parent)
      } catch (error) {
        console.error(`[PluginManager] ${plugin.name} failed:`, error)
      }
    }
  }
}

export const pluginManager = new PluginManager()
