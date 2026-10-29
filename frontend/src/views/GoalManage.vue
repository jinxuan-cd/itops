<template>
  <div class="it-page">
    <div class="it-between" style="margin-bottom:14px">
      <h3 class="it-section-title" style="margin:0">月度目标管理</h3>
      <div>
        <el-date-picker v-model="month" type="month" value-format="YYYY-MM" placeholder="选择月份" @change="load" style="margin-right:10px" />
        <el-button type="primary" @click="openAdd"><el-icon><Plus /></el-icon> 新增目标</el-button>
      </div>
    </div>

    <div class="it-card">
      <el-tabs v-model="tab" @tab-change="load">
        <el-tab-pane label="未完成" name="undone" />
        <el-tab-pane label="已完成" name="done" />
      </el-tabs>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column label="完成" width="70">
          <template #default="{ row }">
            <el-checkbox :model-value="!!row.is_finish" @change="(v) => toggle(row, v)" />
          </template>
        </el-table-column>
        <el-table-column prop="goal_content" label="目标内容" min-width="280" />
        <el-table-column label="权重分值" width="120">
          <template #default="{ row }"><el-tag size="small" type="primary">{{ row.weight_score }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="goal_month" label="归属月份" width="110" />
        <el-table-column prop="finish_month" label="完成月份" width="110">
          <template #default="{ row }">{{ row.finish_month || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.is_finish ? 'success' : 'info'">{{ row.is_finish ? '已完成' : '进行中' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" text type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新增月度目标" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="归属月份">
          <el-date-picker v-model="formMonth" type="month" value-format="YYYY-MM" style="width:100%" />
        </el-form-item>
        <el-form-item label="目标内容" required><el-input v-model="form.goal_content" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="权重分值"><el-input-number v-model="form.weight_score" :min="0" :max="100" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import R from '../api'

// 自动识别当前月份（本地时区）
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const month = ref(currentMonth())
const formMonth = ref(currentMonth())
const tab = ref('undone')
const rows = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ goal_content: '', weight_score: 0 })

async function load() {
  loading.value = true
  try { rows.value = await R.listGoals(month.value, tab.value === 'done') } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}
// 目标发生任何变更后广播，让右侧浮动面板「本月目标」与看板立即同步
function notifyChanged() {
  window.dispatchEvent(new CustomEvent('itops:todo-changed'))
}
async function toggle(row, v) {
  try {
    await R.updateGoal(row.goal_id, { is_finish: v ? 1 : 0 })
    ElMessage.success(v ? '已完成' : '已恢复未完成')
    notifyChanged()
    load() // 勾选后立即在 未完成/已完成 之间迁移
  } catch (e) { ElMessage.error(e.message) }
}
function openAdd() {
  // 弹窗里用独立的 formMonth：直接绑顶部筛选的 month 会在点「取消」后把筛选也改掉
  Object.assign(form, { goal_content: '', weight_score: 0 })
  formMonth.value = month.value
  dialogVisible.value = true
}
async function onSave() {
  if (!form.goal_content) { ElMessage.warning('请填写目标内容'); return }
  saving.value = true
  try {
    await R.createGoal({ goal_month: formMonth.value || month.value, goal_content: form.goal_content, weight_score: form.weight_score })
    ElMessage.success('已添加'); dialogVisible.value = false; notifyChanged(); load()
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function onDelete(row) {
  // 点「取消」时 confirm 会 reject，不接住会抛未捕获的 Promise 异常
  try { await ElMessageBox.confirm('确认删除该目标？', '提示', { type: 'warning' }) } catch { return }
  try { await R.deleteGoal(row.goal_id); ElMessage.success('已删除'); notifyChanged(); load() } catch (e) { ElMessage.error(e.message) }
}

onMounted(load)
</script>
