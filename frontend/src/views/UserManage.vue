<template>
  <div class="it-page">
    <div class="it-between" style="margin-bottom:14px">
      <h3 class="it-section-title" style="margin:0">账号管理</h3>
      <el-button type="primary" @click="openAdd"><el-icon><Plus /></el-icon> 新增账号</el-button>
    </div>

    <div class="it-card">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:14px"
        title="账号用于多用户隔离管理：普通用户只能查看/编辑自己的工单、待办、目标、知识库；管理员可查看全部并维护字典与账号。" />
      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="username" label="登录账号" width="160" />
        <el-table-column prop="real_name" label="姓名" width="140" />
        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="roleType(row.role)">{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.is_enable ? 'success' : 'info'">{{ row.is_enable ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="170" />
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text :type="row.is_enable ? 'warning' : 'success'" @click="toggleEnable(row)">
              {{ row.is_enable ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" text type="danger" :disabled="row.user_id === userStore.userId" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑账号' : '新增账号'" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="登录账号" required>
          <el-input v-model="form.username" :disabled="editing" placeholder="用于登录" />
        </el-form-item>
        <el-form-item :label="editing ? '重置密码' : '密码'" :required="!editing">
          <el-input v-model="form.password" type="password" show-password :placeholder="editing ? '留空则不修改' : '请设置登录密码'" />
        </el-form-item>
        <el-form-item label="姓名"><el-input v-model="form.real_name" /></el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="form.role">
            <el-radio value="user">运维工程师</el-radio>
            <el-radio value="service">服务台（派单）</el-radio>
            <el-radio value="auditor">审计员（只读全公司）</el-radio>
            <el-radio value="admin">管理员</el-radio>
          </el-radio-group>
          <div class="role-tip">
            运维工程师：接取工单、处理自己负责的单（默认新工单会推给全部运维，抢单制）。
            <br />服务台：可选角色，可查看全部工单并派单/转单（需在「系统设置 - 工单流转」里开启服务台派单）。
            <br />审计员：只读查看全公司数据，不能新增或修改任何业务数据，适合领导或内审。
          </div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_enable" />
        </el-form-item>
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
import { useUserStore } from '../store/user'

const userStore = useUserStore()
const rows = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const saving = ref(false)
const form = reactive({ user_id: null, username: '', password: '', real_name: '', role: 'user', is_enable: true })

// 角色文案与配色（admin 管理员 / service 服务台 / auditor 审计员 / user 运维工程师）
function roleLabel(r) {
  return r === 'admin' ? '管理员' : r === 'service' ? '服务台' : r === 'auditor' ? '审计员' : '运维工程师'
}
function roleType(r) {
  return r === 'admin' ? 'danger' : r === 'service' ? 'warning' : r === 'auditor' ? 'warning' : 'primary'
}

async function load() {
  loading.value = true
  try { rows.value = await R.listUsers() } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}
function openAdd() {
  editing.value = false
  Object.assign(form, { user_id: null, username: '', password: '', real_name: '', role: 'user', is_enable: true })
  dialogVisible.value = true
}
function openEdit(row) {
  editing.value = true
  Object.assign(form, { user_id: row.user_id, username: row.username, password: '', real_name: row.real_name, role: row.role, is_enable: !!row.is_enable })
  dialogVisible.value = true
}
async function onSave() {
  if (!editing.value && (!form.username || !form.password)) { ElMessage.warning('请填写登录账号和密码'); return }
  saving.value = true
  try {
    if (editing.value) {
      const d = { real_name: form.real_name, role: form.role, is_enable: form.is_enable ? 1 : 0 }
      if (form.password) d.password = form.password
      await R.updateUser(form.user_id, d)
    } else {
      await R.createUser({ username: form.username, password: form.password, real_name: form.real_name, role: form.role })
    }
    ElMessage.success('已保存'); dialogVisible.value = false; load()
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function toggleEnable(row) {
  try {
    await R.updateUser(row.user_id, { is_enable: row.is_enable ? 0 : 1 })
    ElMessage.success('已更新'); load()
  } catch (e) { ElMessage.error(e.message) }
}
async function onDelete(row) {
  // 点「取消」时 confirm 会 reject，不接住会抛未捕获的 Promise 异常
  try { await ElMessageBox.confirm(`确认删除账号「${row.username}」？`, '提示', { type: 'warning' }) } catch { return }
  try { await R.deleteUser(row.user_id); ElMessage.success('已删除'); load() } catch (e) { ElMessage.error(e.message) }
}

onMounted(load)
</script>

<style scoped>
.role-tip { font-size: 12px; color: var(--it-text-sub); line-height: 1.7; margin-top: 4px; }
</style>
