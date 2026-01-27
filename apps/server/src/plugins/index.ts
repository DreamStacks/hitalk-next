import { pluginManager } from '../lib/plugin-manager'
import { mailPlugin } from './mail'

/**
 * 初始化并注册所有插件
 */
export function initPlugins() {
  // 可以根据环境变量或配置决定是否启用某个插件
  pluginManager.register(mailPlugin)

  // 以后可以在这里注册更多插件
  // pluginManager.register(webhookPlugin)
}
