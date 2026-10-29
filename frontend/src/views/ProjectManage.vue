<template>
  <div class="it-page">
    <div class="it-between" style="margin-bottom:14px">
      <h3 class="it-section-title" style="margin:0">项目管理</h3>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新建项目</el-button>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-radio-group v-model="filter" @change="load">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="active">进行中</el-radio-button>
        <el-radio-button value="done">已完成</el-radio-button>
        <el-radio-button value="paused">已暂停</el-radio-button>
        <el-radio-button value="due">周期已到未完成</el-radio-button>
      </el-radio-group>
    </el-card>

    <el-table :data="rows" v-loading="loading" border stripe size="small">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="stage-panel">
            <div v-if="row.stages && row.stages.length" class="stage-steps">
              <el-steps :active="row.stage_done" finish-status="success" align-center>
                <el-step v-for="(s, i) in row.stages" :key="i" :title="s.name" />
              </el-steps>
            </div>
            <div v-else class="it-text-sub" style="padding:6px 16px">该项目暂未设置阶段（可编辑时添加或用默认阶段）</div>
            <div v-if="row.project_desc" class="stage-desc">描述：{{ row.project_desc }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="project_name" label="项目名称" min-width="150" />
      <el-table-column prop="project_desc" label="项目描述" min-width="180" show-overflow-tooltip />
      <el-table-column prop="start_date" label="开始日期" width="112" />
      <el-table-column prop="end_date" label="计划结束" width="112" />
      <el-table-column label="阶段进度" width="210">
        <template #default="{ row }">
          <el-progress :percentage="Number(row.progress) || 0" :stroke-width="14" :text-inside="true" />
          <div class="stage-sub" v-if="row.stage_total">
            已完成 {{ row.stage_done }}/{{ row.stage_total }}
            <span v-if="row.current_stage && row.progress < 100"> · 当前：{{ row.current_stage }}</span>
            <span v-else-if="row.progress >= 100"> · 全部完成</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="96">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button text type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="it-text-sub">暂无项目</span></template>
    </el-table>

    <el-dialog v-model="dialog" :title="form.project_id ? '编辑项目' : '新建项目'" width="560px">
      <el-form :model="form" label-width="90px" ref="formRef">
        <el-form-item label="项目名称" required>
          <el-input v-model="form.project_name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="form.project_desc" type="textarea" :rows="2" placeholder="项目目标、范围等" />
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />
        </el-form-item>
        <el-form-item label="计划结束">
          <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />
        </el-form-item>

        <!-- 阶段 / 生命周期 -->
        <el-form-item label="阶段">
          <div class="stage-editor">
            <div class="stage-actions">
              <el-button size="small" @click="applyDefaultStages">套用默认阶段</el-button>
              <el-button size="small" @click="addStage">添加阶段</el-button>
              <span class="stage-hint">勾选「完成」即推进进度条</span>
            </div>
            <div v-if="!form.stages.length" class="stage-empty">暂无阶段，可「套用默认阶段」或手动添加</div>
            <div v-for="(s, i) in form.stages" :key="i" class="stage-row">
              <span class="stage-no">{{ i + 1 }}</span>
              <el-input v-model="s.name" size="small" placeholder="阶段名称" style="flex:1" />
              <el-checkbox v-model="s.done">完成</el-checkbox>
              <el-button text type="danger" size="small" @click="removeStage(i)">删除</el-button>
            </div>
            <div class="stage-progress" v-if="form.stages.length">
              <el-progress :percentage="stageProgress" :stroke-width="12" />
              <span class="stage-cur" v-if="currentStageName">当前阶段：{{ currentStageName }}</span>
            </div>
          </div>
        </el-form-item>

        <!-- 无阶段时才允许手动设置进度 -->
        <el-form-item label="进度" v-if="!form.stages.length">
          <el-slider v-model="progressNum" :min="0" :max="100" show-input />
        </el-form-item>

        <el-form-item label="状态">
          <el-select v-model="form.status" style="width:100%">
            <el-option label="进行中" value="active" />
            <el-option label="已完成" value="done" />
            <el-option label="已暂停" value="paused" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import R from '../api'

const DEFAULT_STAGES = ['需求分析', '方案设计', '开发/实施', '测试验证', '上线部署', '验收交付']

const rows = ref([])
const loading = ref(false)
const filter = ref('all')
const dialog = ref(false)
const saving = ref(false)
const formRef = ref(null)

const emptyForm = () => ({
  project_id: null,
  project_name: '',
  project_desc: '',
  start_date: '',
  end_date: '',
  progress: 0,
  status: 'active',
  stages: []
})
const form = reactive(emptyForm())
const progressNum = computed({
  get: () => Number(form.progress) || 0,
  set: (v) => { form.progress = v }
})

// 由阶段完成比例计算进度
const stageProgress = computed(() => {
  const list = form.stages.filter(s => s.name && s.name.trim())
  if (!list.length) return 0
  return Math.round((list.filter(s => s.done).length / list.length) * 100)
})
const currentStageName = computed(() => {
  const list = form.stages.filter(s => s.name && s.name.trim())
  const idx = list.findIndex(s => !s.done)
  return idx === -1 ? (list.length ? list[list.length - 1].name : '') : list[idx].name
})

function statusType(s) {
  return s === 'done' ? 'success' : s === 'paused' ? 'info' : 'warning'
}
function statusText(s) {
  return s === 'done' ? '已完成' : s === 'paused' ? '已暂停' : '进行中'
}

async function load() {
  loading.value = true
  try {
    const params = {}
    if (filter.value === 'due') params.due = '1'
    else if (filter.value !== 'all') params.status = filter.value
    rows.value = await R.listProjects(params)
  } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}

function applyDefaultStages() {
  const existing = new Set(form.stages.map(s => s.name))
  DEFAULT_STAGES.forEach(name => {
    if (!existing.has(name)) form.stages.push({ name, done: false })
  })
}
function addStage() {
  form.stages.push({ name: '', done: false })
}
function removeStage(i) {
  form.stages.splice(i, 1)
}

function openCreate() {
  Object.assign(form, emptyForm())
  // 新建默认带一套阶段模板，可直接勾选推进
  form.stages = DEFAULT_STAGES.map(name => ({ name, done: false }))
  dialog.value = true
}
function openEdit(row) {
  Object.assign(form, {
    project_id: row.project_id,
    project_name: row.project_name,
    project_desc: row.project_desc || '',
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    progress: Number(row.progress) || 0,
    status: row.status || 'active',
    stages: Array.isArray(row.stages)
      ? row.stages.map(s => ({ name: s.name, done: !!s.done }))
      : []
  })
  dialog.value = true
}

async function save() {
  if (!form.project_name.trim()) { ElMessage.warning('请填写项目名称'); return }
  saving.value = true
  try {
    const stages = form.stages.filter(s => s.name && s.name.trim()).map(s => ({ name: s.name.trim(), done: !!s.done }))
    const payload = {
      project_name: form.project_name,
      project_desc: form.project_desc,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      stages
    }
    // 有阶段时进度由后端按阶段完成度自动计算；无阶段时才用手动进度
    if (!stages.length) payload.progress = form.progress

    if (form.project_id) {
      await R.updateProject(form.project_id, payload)
      ElMessage.success('更新成功')
    } else {
      await R.createProject(payload)
      ElMessage.success('创建成功')
    }
    dialog.value = false
    load()
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除项目「${row.project_name}」？`, '提示', { type: 'warning' })
  } catch (e) { return }
  try {
    await R.deleteProject(row.project_id)
    ElMessage.success('已删除')
    load()
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(() => load())
</script>

<style scoped>
.filter-card { margin-bottom: 14px; }
.stage-sub { font-size: 12px; color: var(--it-text-sub); margin-top: 4px; }
.stage-panel { padding: 14px 18px; background: var(--it-bg); }
.stage-steps { margin-bottom: 8px; }
.stage-desc { font-size: 12px; color: var(--it-text-sub); margin-top: 6px; }
.stage-editor { width: 100%; }
.stage-actions { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.stage-hint { font-size: 12px; color: var(--it-text-sub); }
.stage-empty { font-size: 12px; color: var(--it-text-sub); padding: 6px 0; }
.stage-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.stage-no {
  width: 20px; height: 20px; border-radius: 50%; background: var(--it-primary-light);
  color: var(--it-primary); font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.stage-progress { margin-top: 10px; }
.stage-cur { font-size: 12px; color: var(--it-text-sub); display: inline-block; margin-top: 4px; }
</style>
