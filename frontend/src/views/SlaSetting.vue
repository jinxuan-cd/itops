<template>
  <div class="it-page">
    <div class="it-between page-head">
      <div>
        <h3 class="it-section-title" style="margin:0">SLA 时效策略</h3>
        <div class="page-sub">按问题类别设定响应与解决时限，超时工单会在工时列表和看板中标红</div>
      </div>
      <div class="head-actions">
        <el-button size="small" :loading="recalcing" @click="onRecalc">按当前策略重算历史工单</el-button>
        <el-button type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon> 新增策略</el-button>
      </div>
    </div>

    <el-alert type="info" :closable="false" show-icon style="margin-bottom:14px">
      <template #title>
        匹配优先级：问题类别 + 优先级精确匹配 &gt; 仅问题类别 &gt; 默认策略（*）。未单独配置的类别一律走默认策略。
      </template>
    </el-alert>

    <div class="it-card">
      <el-table :data="rows" stripe border v-loading="loading" empty-text="暂无策略">
        <el-table-column label="问题类别" width="180">
          <template #default="{ row }">
            <el-tag v-if="row.problem_type === '*'" type="info" size="small">默认策略</el-tag>
            <span v-else>{{ row.problem_type }}</span>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="120">
          <template #default="{ row }">{{ row.priority ? priorityLabel(row.priority) : '不限' }}</template>
        </el-table-column>
        <el-table-column label="响应时限" width="140">
          <template #default="{ row }"><b class="num">{{ row.respond_hours }}</b> 小时</template>
        </el-table-column>
        <el-table-column label="解决时限" width="140">
          <template #default="{ row }"><b class="num">{{ row.resolve_hours }}</b> 小时</template>
        </el-table-column>
        <el-table-column prop="remark" label="说明" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.problem_type !== '*'" size="small" text type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="formVisible" :title="form.policy_id ? '编辑策略' : '新增策略'" width="520px">
      <el-form :model="form" label-width="96px">
        <el-form-item label="问题类别">
          <el-select v-model="form.problem_type" filterable allow-create style="width:100%" placeholder="选字典项或输入自定义">
            <el-option label="* 默认策略（兜底）" value="*" />
            <el-option v-for="d in dicts.problem_type" :key="d.dict_id" :label="d.dict_label" :value="d.dict_label" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="form.priority" clearable placeholder="不限" style="width:100%">
            <el-option label="紧急" value="urgent" />
            <el-option label="高" value="high" />
            <el-option label="普通" value="normal" />
            <el-option label="低" value="low" />
          </el-select>
        </el-form-item>
        <el-form-item label="响应时限">
          <el-input-number v-model="form.respond_hours" :min="0.5" :step="0.5" :precision="1" /> <span class="unit">小时</span>
        </el-form-item>
        <el-form-item label="解决时限">
          <el-input-number v-model="form.resolve_hours" :min="0.5" :step="0.5" :precision="1" /> <span class="unit">小时</span>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
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

const rows = ref([])
const loading = ref(false)
const recalcing = ref(false)
const dicts = reactive({ problem_type: [] })
const formVisible = ref(false)
const saving = ref(false)
const form = reactive({})

function priorityLabel(p) {
  return { urgent: '紧急', high: '高', normal: '普通', low: '低' }[p] || p
}

async function load() {
  loading.value = true
  try { rows.value = await R.listSla() } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}

function openCreate() {
  Object.keys(form).forEach(k => delete form[k])
  form.problem_type = '*'
  form.respond_hours = 4
  form.resolve_hours = 24
  formVisible.value = true
}
function openEdit(row) {
  Object.keys(form).forEach(k => delete form[k])
  Object.assign(form, row)
  formVisible.value = true
}
async function onSave() {
  saving.value = true
  try {
    if (form.policy_id) await R.updateSla(form.policy_id, form)
    else await R.createSla(form)
    ElMessage.success('已保存')
    formVisible.value = false
    load()
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function onDelete(row) {
  try {
    await ElMessageBox.confirm('确认删除该策略？删除后相关工单会回落到默认策略。', '提示', { type: 'warning' })
  } catch { return }
  try {
    await R.deleteSla(row.policy_id)
    ElMessage.success('已删除')
    load()
  } catch (e) { ElMessage.error(e.message) }
}
async function onRecalc() {
  recalcing.value = true
  try {
    const r = await R.recalcSla()
    ElMessage.success(`已重算 ${r.updated} 条工单的时效`)
  } catch (e) { ElMessage.error(e.message) } finally { recalcing.value = false }
}

onMounted(async () => {
  load()
  try {
    const d = await R.getDicts(false)
    dicts.problem_type = d.problem_type
  } catch { /* ignore */ }
})
</script>

<style scoped>
@media (min-width: 1200px) { .it-page { padding-right: 272px; } }
.page-head { margin-bottom: 14px; }
.page-sub { font-size: 12px; color: var(--it-text-sub); margin-top: 4px; }
.head-actions { display: flex; gap: 10px; }
.num { color: var(--it-primary); font-size: 15px; }
.unit { color: var(--it-text-sub); font-size: 12px; margin-left: 6px; }
</style>
