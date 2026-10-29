<template>
  <div class="it-page">
    <div class="it-between page-head">
      <div>
        <h3 class="it-section-title" style="margin:0">操作审计日志</h3>
        <div class="page-sub">谁在什么时候改了什么，全部留痕（累计 {{ summary.total }} 条）</div>
      </div>
      <div class="head-actions">
        <el-button size="small" @click="load"><el-icon><Refresh /></el-icon> 刷新</el-button>
      </div>
    </div>

    <el-row v-if="summary.top.length" :gutter="14" class="card-row">
      <el-col :span="24">
        <div class="it-card">
          <div class="top-wrap">
            <span class="top-title">近 30 天高频操作</span>
            <el-tag v-for="t in summary.top" :key="t.action" size="small" effect="plain" class="top-tag">
              {{ t.action }} <b>{{ t.count }}</b>
            </el-tag>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="it-card" style="margin-bottom:14px">
      <el-form :inline="true">
        <el-form-item label="时间">
          <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" />
        </el-form-item>
        <el-form-item label="操作人">
          <el-select v-model="filters.username" placeholder="全部" clearable filterable style="width:140px">
            <el-option v-for="u in users" :key="u.username" :label="`${u.username}（${u.count}）`" :value="u.username" />
          </el-select>
        </el-form-item>
        <el-form-item label="方式">
          <el-select v-model="filters.method" placeholder="全部" clearable style="width:100px">
            <el-option label="新增" value="POST" />
            <el-option label="修改" value="PUT" />
            <el-option label="删除" value="DELETE" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input v-model="filters.keyword" placeholder="动作/对象/IP" clearable style="width:170px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load"><el-icon><Search /></el-icon> 查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="it-card">
      <el-table :data="rows" stripe border v-loading="loading" :max-height="540" empty-text="暂无审计记录">
        <el-table-column prop="create_time" label="时间" width="160" />
        <el-table-column label="操作人" width="130">
          <template #default="{ row }">
            <span>{{ row.username || '—' }}</span>
            <el-tag v-if="row.role === 'admin'" size="small" type="danger" style="margin-left:4px">管理员</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="动作" width="150" />
        <el-table-column prop="path" label="接口" width="200" show-overflow-tooltip>
          <template #default="{ row }"><span class="mono">{{ row.method }} {{ row.path }}</span></template>
        </el-table-column>
        <el-table-column prop="detail" label="关键参数" min-width="240" show-overflow-tooltip>
          <template #default="{ row }"><span class="mono detail">{{ row.detail || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130" />
        <el-table-column label="结果" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status_code < 400 ? 'success' : 'danger'">{{ row.status_code }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import R from '../api'

const rows = ref([])
const users = ref([])
const loading = ref(false)
const range = ref([])
const filters = reactive({ username: '', method: '', keyword: '' })
const summary = reactive({ total: 0, top: [], daily: [] })

function params() {
  const p = { limit: 500 }
  if (range.value && range.value.length === 2) { p.start = range.value[0]; p.end = range.value[1] }
  Object.keys(filters).forEach(k => { if (filters[k]) p[k] = filters[k] })
  return p
}

async function load() {
  loading.value = true
  try {
    rows.value = await R.listAuditLogs(params())
  } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}

function resetFilters() {
  range.value = []
  Object.assign(filters, { username: '', method: '', keyword: '' })
  load()
}

onMounted(async () => {
  load()
  try {
    Object.assign(summary, await R.auditLogSummary())
    users.value = await R.auditLogUsers()
  } catch { /* ignore */ }
})
</script>

<style scoped>
@media (min-width: 1200px) { .it-page { padding-right: 272px; } }
.page-head { margin-bottom: 14px; }
.page-sub { font-size: 12px; color: var(--it-text-sub); margin-top: 4px; }
.head-actions { display: flex; gap: 10px; }
.card-row { margin-bottom: 14px; }
.top-wrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.top-title { font-size: 13px; color: var(--it-text-sub); margin-right: 4px; }
.top-tag b { color: var(--it-primary); margin-left: 2px; }
.mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.detail { color: var(--it-text-sub); }
</style>
