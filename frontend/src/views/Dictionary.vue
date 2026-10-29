<template>
  <div class="it-page">
    <h3 class="it-section-title">基础字典维护（部门 / 应用系统 / 问题类别）</h3>

    <div class="it-card">
      <el-tabs v-model="activeType" @tab-change="load">
        <el-tab-pane label="部门" name="dept" />
        <el-tab-pane label="应用系统" name="app_system" />
        <el-tab-pane label="问题类别" name="problem_type" />
      </el-tabs>

      <div class="it-between" style="margin-bottom:12px">
        <span class="it-text-sub">共 {{ rows.length }} 项</span>
        <el-button type="primary" @click="openAdd"><el-icon><Plus /></el-icon> 新增{{ typeLabel }}</el-button>
      </div>

      <el-table :data="rows" stripe border>
        <el-table-column prop="dict_label" label="名称" min-width="180" />
        <el-table-column prop="sort" label="排序" width="90" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.is_enable ? 'success' : 'info'">{{ row.is_enable ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text :type="row.is_enable ? 'warning' : 'success'" @click="toggleEnable(row)">
              {{ row.is_enable ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" text type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑' : '新增' + typeLabel" width="420px">
      <el-form :model="form" label-width="70px">
        <el-form-item label="名称" required><el-input v-model="form.dict_label" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import R from '../api'

const activeType = ref('dept')
const typeLabel = computed(() => ({ dept: '部门', app_system: '应用系统', problem_type: '问题类别' }[activeType.value]))
const rows = ref([])
const dialogVisible = ref(false)
const editing = ref(false)
const saving = ref(false)
const form = reactive({ dict_id: null, dict_label: '', sort: 0 })

async function load() {
  try {
    const data = await R.getDicts(true)
    rows.value = data[activeType.value] || []
  } catch (e) { ElMessage.error(e.message) }
}
function openAdd() {
  editing.value = false
  Object.assign(form, { dict_id: null, dict_label: '', sort: 0 })
  dialogVisible.value = true
}
function openEdit(row) {
  editing.value = true
  Object.assign(form, { dict_id: row.dict_id, dict_label: row.dict_label, sort: row.sort })
  dialogVisible.value = true
}
async function onSave() {
  if (!form.dict_label) { ElMessage.warning('请填写名称'); return }
  saving.value = true
  try {
    if (editing.value) await R.updateDict(activeType.value, form.dict_id, { dict_label: form.dict_label, sort: form.sort })
    else await R.createDict(activeType.value, { dict_label: form.dict_label, sort: form.sort })
    ElMessage.success('已保存'); dialogVisible.value = false; load()
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function toggleEnable(row) {
  try {
    await R.updateDict(activeType.value, row.dict_id, { is_enable: row.is_enable ? 0 : 1 })
    ElMessage.success('已更新'); load()
  } catch (e) { ElMessage.error(e.message) }
}
async function onDelete(row) {
  // 点「取消」时 confirm 会 reject，不接住会抛未捕获的 Promise 异常
  try { await ElMessageBox.confirm('确认删除该项？历史工单中该值仍保留。', '提示', { type: 'warning' }) } catch { return }
  try { await R.deleteDict(activeType.value, row.dict_id); ElMessage.success('已删除'); load() } catch (e) { ElMessage.error(e.message) }
}

onMounted(load)
</script>
