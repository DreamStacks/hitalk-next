import type { HitalkPlugin, PluginContext, PluginHooks } from '@hitalk/shared'

/**
 * 插件管理器
 */
export class PluginManager {
  private plugins: HitalkPlugin[] = []

  /**
   * 注册插件
   */
  register(plugin: HitalkPlugin) {
    console.log(`[PluginManager] Registering plugin: ${plugin.name}`)
    this.plugins.push(plugin)
  }

  /**
   * 触发钩子
   */
  async trigger<K extends keyof PluginHooks>(
    hook: K,
    ctx: PluginContext,
    ...args: any[]
  ) {
    for (const plugin of this.plugins) {
      const fn = plugin[hook]
      if (typeof fn === 'function') {
        try {
          // @ts-ignore
          await fn(ctx, ...args)
        } catch (error) {
          console.error(
            `[PluginManager] Error in plugin ${plugin.name} hook ${hook}:`,
            error
          )
        }
      }
    }
  }
}

// 单例模式导出
export const pluginManager = new PluginManager()
