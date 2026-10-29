// 工单流转配置（服务台是否启用）：全局共享一份，避免各页面重复请求
import { reactive } from 'vue'
import R from '../api'

export const workflow = reactive({ service_desk_enable: false, loaded: false })

export async function loadWorkflow(force = false) {
  if (workflow.loaded && !force) return workflow
  try {
    Object.assign(workflow, await R.getWorkflowSettings(), { loaded: true })
  } catch (e) {
    workflow.loaded = true
  }
  return workflow
}
