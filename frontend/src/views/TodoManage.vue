<template>
  <div class="it-page">
    <div class="it-between" style="margin-bottom:14px">
      <h3 class="it-section-title" style="margin:0">待办任务管理</h3>
      <el-button type="primary" @click="openAdd"><el-icon><Plus /></el-icon> 新增待办</el-button>
    </div>

    <div class="it-card">
      <el-tabs v-model="tab" @tab-change="load">
        <el-tab-pane label="当日待办" name="today" />
        <el-tab-pane label="本周待办" name="week" />
        <el-tab-pane label="全部待办" name="all" />
        <el-tab-pane label="已完成" name="done" />
      </el-tabs>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column label="完成" width="70">
          <template #default="{ row }">
            <el-checkbox :model-value="!!row.is_finish" @change="(v) => toggle(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="待办标题" min-width="190">
          <template #default="{ row }">
            <span :class="{ 'todo-link': row.ticket_id }" @click="row.ticket_id && goTicket(row)">{{ row.todo_title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="todo_detail" label="详情" min-width="170" show-overflow-tooltip />
        <el-table-column prop="plan_date" label="计划日期" width="115" />
        <el-table-column label="来源" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="sourceMeta(row.source).type">{{ sourceMeta(row.source).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" class-name="col-ops">
          <template #default="{ row }">
            <el-button v-if="row.ticket_id" size="small" text type="primary" @click="goTicket(row)">查看工单</el-button>
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑待办' : '新增待办'" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题" required><el-input v-model="form.todo_title" /></el-form-item>
        <el-form-item label="详情"><el-input v-model="form.todo_detail" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="计划日期"><el-date-picker v-model="form.plan_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
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
import { useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import R from '../api'

const router = useRouter()

const tab = ref('today')
const rows = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const saving = ref(false)
const form = reactive({ todo_id: null, todo_title: '', todo_detail: '', plan_date: '' })

// 通知右侧浮动待办面板刷新
function notifyTodoChange() {
  window.dispatchEvent(new Event('itops:todo-changed'))
}

// 来源文案：待接单工单（员工报障自动生成）/ 日报生成 / 手动新增
function sourceMeta(s) {
  if (s === 'daily_report') return { label: '日报生成', type: 'success' }
  if (s === 'ticket') return { label: '待接单工单', type: 'warning' }
  return { label: '手动新增', type: 'info' }
}
// 点待办直接跳到工单详情
function goTicket(row) {
  if (!row.ticket_id) return
  router.push({ path: '/tickets', query: { open: row.ticket_id } })
}

async function load() {
  loading.value = true
  try { rows.value = await R.listTodos(tab.value) } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}

async function toggle(row, v) {
  try {
    await R.updateTodo(row.todo_id, { is_finish: v ? 1 : 0 })
    row.is_finish = v ? 1 : 0
    notifyTodoChange()
    // 勾选后从当前列表迁移：未完成视图立即移除，已完成视图进入列表
    load()
  } catch (e) { ElMessage.error(e.message) }
}

function openAdd() {
  editing.value = false
  Object.assign(form, { todo_id: null, todo_title: '', todo_detail: '', plan_date: '' })
  dialogVisible.value = true
}
function openEdit(row) {
  editing.value = true
  Object.assign(form, { todo_id: row.todo_id, todo_title: row.todo_title, todo_detail: row.todo_detail, plan_date: row.plan_date })
  dialogVisible.value = true
}
async function onSave() {
  if (!form.todo_title) { ElMessage.warning('请填写标题'); return }
  saving.value = true
  try {
    if (editing.value) await R.updateTodo(form.todo_id, { todo_title: form.todo_title, todo_detail: form.todo_detail, plan_date: form.plan_date })
    else await R.createTodo({ todo_title: form.todo_title, todo_detail: form.todo_detail, plan_date: form.plan_date })
    ElMessage.success('已保存')
    dialogVisible.value = false
    notifyTodoChange()
    load()
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function onDelete(row) {
  // 点「取消」时 confirm 会 reject，不接住会抛未捕获的 Promise 异常
  try { await ElMessageBox.confirm('确认删除该待办？', '提示', { type: 'warning' }) } catch { return }
  try { await R.deleteTodo(row.todo_id); ElMessage.success('已删除'); notifyTodoChange(); load() } catch (e) { ElMessage.error(e.message) }
}

onMounted(load)
</script>

<style scoped>
/* 待接单工单来源的待办可点开详情 */
.todo-link { color: var(--it-primary); cursor: pointer; }
.todo-link:hover { text-decoration: underline; }
/* 操作列按钮不换行、间距收紧，避免“删除”被挤到第二行 */
:deep(.col-ops .cell) { display: flex; flex-wrap: nowrap; align-items: center; gap: 2px; }
:deep(.col-ops .el-button) { margin-left: 0; padding: 0 3px; }
</style>
