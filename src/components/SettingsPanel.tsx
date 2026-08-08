import { useState, useEffect, useRef } from 'react'
import { Download, Upload, Database, Github, CheckCircle2, AlertCircle, RefreshCw, CloudUpload, CloudDownload, GitMerge, ShieldCheck, Lock, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  hasAiAccess,
  clearAiAccess,
  AI_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_SIGNUP,
  getAiProvider,
  setAiProvider,
  getApiKeyForProvider,
  setApiKeyForProvider,
  clearApiKeyForProvider,
  getModelForProvider,
  setModelForProvider,
  getProviderDefaultModel,
  providerSupportsVision,
  type AiProvider,
} from '@/lib/ai-service'
import { exportAllData, importAllData, clearOldRecords } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/useAppStore'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  getSyncConfig,
  setSyncConfig,
  clearSyncConfig,
  getLastSyncTime,
  syncData,
  forceUpload,
  forceDownload,
  verifyConfig,
  type GitHubSyncConfig,
} from '@/lib/github-sync'

export function SettingsPanel() {
  const [importJson, setImportJson] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // GitHub 同步配置
  const [ghToken, setGhToken] = useState('')
  const [ghOwner, setGhOwner] = useState('')
  const [ghRepo, setGhRepo] = useState('')
  const [ghConfigured, setGhConfigured] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [aiUnlocked, setAiUnlocked] = useState(false)
  const [provider, setProvider] = useState<AiProvider>('dashscope')
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [aiKeySet, setAiKeySet] = useState(false)
  const [aiModelInput, setAiModelInput] = useState('')

  const userId = useAppStore((s) => s.user?.uid ?? '')
  const qc = useQueryClient()
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    setAiUnlocked(hasAiAccess())
    const p = getAiProvider()
    setProvider(p)
    setAiKeyInput(getApiKeyForProvider(p) || '')
    setAiKeySet(!!getApiKeyForProvider(p))
    setAiModelInput(getModelForProvider(p) || '')
    const cfg = getSyncConfig()
    if (cfg) {
      setGhToken(cfg.token)
      setGhOwner(cfg.owner)
      setGhRepo(cfg.repo)
      setGhConfigured(true)
    }
  }, [])

  const loadProviderState = (p: AiProvider) => {
    setProvider(p)
    setAiKeyInput(getApiKeyForProvider(p) || '')
    setAiKeySet(!!getApiKeyForProvider(p))
    setAiModelInput(getModelForProvider(p) || '')
  }

  const handleSwitchProvider = (p: AiProvider) => {
    setAiProvider(p)
    loadProviderState(p)
  }

  const handleExport = async () => {
    try {
      const data = await exportAllData()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const filename = `exam-prep-backup-${new Date().toISOString().slice(0, 10)}.json`

      // 方式1：创建可见的下载链接并点击
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // 延迟清理，确保下载已触发
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 2000)

      // 方式2：如果方式1失败，在新标签页打开
      setTimeout(() => {
        window.open(url, '_blank')
      }, 500)

      toast.success('数据已导出，请查看下载文件夹', {
        description: `文件名：${filename}`,
        duration: 5000,
      })
    } catch (e: any) {
      toast.error('导出失败：' + (e.message || '未知错误'))
    }
  }

  const handleImport = async () => {
    if (!importJson.trim()) {
      toast.warning('请粘贴备份数据')
      return
    }
    try {
      const data = JSON.parse(importJson)
      await importAllData(data)
      toast.success('数据已恢复，请刷新页面')
      setImportJson('')
    } catch {
      toast.error('数据格式错误')
    }
  }

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImportJson(reader.result as string)
    reader.readAsText(file)
    // 重置 input 值，允许重复选择同一文件
    e.target.value = ''
  }

  const handleLockAi = () => {
    clearAiAccess()
    setAiUnlocked(false)
    toast.success('AI 功能已锁定，下次使用需重新输入密码')
  }

  const handleSaveAiKey = () => {
    const v = aiKeyInput.trim()
    if (!v) {
      toast.warning('请填写 API Key')
      return
    }
    setApiKeyForProvider(provider, v)
    setAiKeySet(true)
    toast.success(`${PROVIDER_LABELS[provider]} API Key 已保存到本机浏览器（不会上传到任何服务器）`)
  }

  const handleClearAiKey = () => {
    clearApiKeyForProvider(provider)
    setAiKeyInput('')
    setAiKeySet(false)
    toast.success('已清除本地 API Key')
  }

  const handleSaveAiModel = () => {
    setModelForProvider(provider, aiModelInput)
    toast.success('模型设置已保存（留空则使用默认模型）')
  }

  // GitHub 同步
  const handleSaveGhConfig = async () => {
    if (!ghToken || !ghOwner || !ghRepo) {
      toast.warning('请填写完整信息')
      return
    }
    const config: GitHubSyncConfig = { token: ghToken, owner: ghOwner, repo: ghRepo }
    const valid = await verifyConfig(config)
    if (!valid) {
      toast.error('验证失败，请检查 Token 和仓库地址')
      return
    }
    setSyncConfig(config)
    setGhConfigured(true)
    toast.success('GitHub 同步配置已保存')
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncData()
      if (result.action === 'conflict') {
        toast.error(result.message)
      } else if (result.action === 'merge') {
        toast.success(result.message, { description: result.details, duration: 6000 })
      } else {
        toast.success(result.message)
      }
    } catch (e: any) {
      toast.error(e.message || '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const handleForceUpload = async () => {
    setSyncing(true)
    try {
      const result = await forceUpload()
      if (result.action === 'conflict') {
        toast.error(result.message)
      } else {
        toast.success(result.message)
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleForceDownload = async () => {
    setSyncing(true)
    try {
      const result = await forceDownload()
      if (result.action === 'conflict') {
        toast.error(result.message)
      } else {
        toast.success(result.message + '，请刷新页面')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleClearGhConfig = () => {
    clearSyncConfig()
    setGhToken('')
    setGhOwner('')
    setGhRepo('')
    setGhConfigured(false)
    toast.success('已清除 GitHub 配置')
  }

  const handleClearRecords = async () => {
    setClearing(true)
    try {
      const res = await clearOldRecords(userId)
      await qc.invalidateQueries({ queryKey: ['dailyPlans'] })
      await qc.invalidateQueries({ queryKey: ['mistakes'] })
      await qc.invalidateQueries({ queryKey: ['reviews'] })
      toast.success(
        `已清除：完成计划 ${res.plans} 项 · 已掌握错题 ${res.mistakes} 项 · 一月前复盘 ${res.reviews} 条`
      )
      setClearOpen(false)
    } catch (e: any) {
      toast.error(e.message || '清除失败')
    } finally {
      setClearing(false)
    }
  }

  const lastSync = getLastSyncTime()

  return (
    <>
      <div className="space-y-4 px-4 py-4">
      <div>
        <h2 className="text-xl font-bold">设置</h2>
        <p className="text-xs text-muted-foreground">AI 隐私 · 数据备份 · 多设备同步</p>
      </div>

      {/* AI 隐私保护 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" />
            AI 功能隐私保护
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            AI 功能使用你自己的 API Key（支持 通义千问 / DeepSeek / OpenAI 三家，可随时切换）。密钥只保存在本机浏览器，不会写入代码、也不会上传到任何服务器。临时离开设备时可「锁定 AI」防止他人使用。
          </p>

          {/* 服务商选择 */}
          <div className="space-y-1.5">
            <Label className="text-xs">AI 服务商</Label>
            <div className="flex gap-2">
              {AI_PROVIDERS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={provider === p ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => handleSwitchProvider(p)}
                >
                  {PROVIDER_LABELS[p]}
                </Button>
              ))}
            </div>
          </div>

          {/* 当前服务商的 API Key */}
          <div className="space-y-1.5 rounded-lg border border-border p-2.5">
            <Label className="text-xs">{PROVIDER_LABELS[provider]} API Key（仅存本机）</Label>
            <Input
              type="password"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              placeholder="sk-..."
              className="font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveAiKey} size="sm" className="gap-1.5 text-xs">
                <CheckCircle2 className="size-3.5" />
                保存密钥
              </Button>
              {aiKeySet && (
                <Button onClick={handleClearAiKey} variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive">
                  清除
                </Button>
              )}
              {aiKeySet && (
                <span className="ml-auto flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 className="size-3.5" />
                  已配置
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              申请地址：
              <a href={PROVIDER_SIGNUP[provider]} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {PROVIDER_LABELS[provider]} 官方控制台 → API Key
              </a>
            </p>
          </div>

          {/* 自定义模型（可选） */}
          <div className="space-y-1.5 rounded-lg border border-border p-2.5">
            <Label className="text-xs">模型名称（可选，留空用默认）</Label>
            <div className="flex gap-2">
              <Input
                value={aiModelInput}
                onChange={(e) => setAiModelInput(e.target.value)}
                placeholder={getProviderDefaultModel(provider)}
                className="font-mono text-sm"
              />
              <Button onClick={handleSaveAiModel} size="sm" variant="outline" className="shrink-0 text-xs">
                保存
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              默认模型：{getProviderDefaultModel(provider)}（
              {providerSupportsVision(provider) ? '支持图片识别' : '不支持图片识别，含图功能不可用'}）
            </p>
          </div>

          {!providerSupportsVision(provider) && (
            <p className="rounded-lg bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              提示：{PROVIDER_LABELS[provider]} 暂不支持图片识别。涉及上传题目图片的功能（如图片批改、图片复盘）将无法使用，建议改用「通义千问」或「OpenAI」。
            </p>
          )}

          <div className="flex items-center gap-2">
            {aiUnlocked ? (
              <>
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 className="size-3.5" />
                  AI 功能已解锁
                </span>
                <Button onClick={handleLockAi} variant="outline" size="sm" className="ml-auto gap-1.5 text-xs">
                  <Lock className="size-3.5" />
                  锁定 AI
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertCircle className="size-3.5" />
                AI 功能未解锁，使用时需输入密码
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* GitHub 多设备同步 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Github className="size-4 text-primary" />
            GitHub 多设备同步
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!ghConfigured ? (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                绑定你的 GitHub 仓库，实现多设备数据同步。同步时自动合并两端数据，不会丢失任何记录。<b className="text-foreground">建议用「私有仓库」</b>保存学习数据，只有你能查看；Token 仅存本机浏览器，不会写入代码。
              </p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">GitHub Token</Label>
                  <Input
                    type="password"
                    value={ghToken}
                    onChange={(e) => setGhToken(e.target.value)}
                    placeholder="ghp_..."
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      点此创建 Fine-grained Token
                    </a>
                    ，仅授权你的私有同步仓库（Contents 读写），权限最小最安全
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">用户名</Label>
                    <Input
                      value={ghOwner}
                      onChange={(e) => setGhOwner(e.target.value)}
                      placeholder="你的 GitHub 用户名"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">仓库名</Label>
                    <Input
                      value={ghRepo}
                      onChange={(e) => setGhRepo(e.target.value)}
                      placeholder="如 exam-prep"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
              <Button onClick={handleSaveGhConfig} size="sm" className="w-full">保存并验证</Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-success/5 p-2.5 text-xs">
                <CheckCircle2 className="size-4 text-success shrink-0" />
                <span className="text-success">
                  已绑定 <b>{ghOwner}/{ghRepo}</b>
                </span>
              </div>

              {lastSync && (
                <p className="text-xs text-muted-foreground">
                  上次同步：{lastSync.toLocaleString('zh-CN')}
                </p>
              )}

              {/* 一键同步 */}
              <Button
                onClick={handleSync}
                disabled={syncing}
                className="w-full gap-2"
              >
                {syncing ? <RefreshCw className="size-4 animate-spin" /> : <GitMerge className="size-4" />}
                {syncing ? '同步中...' : '一键同步'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                自动合并本地和远程数据，不丢失任何记录
              </p>

              {/* 高级操作 */}
              <div className="flex gap-2 border-t border-border pt-3">
                <Button
                  onClick={handleForceUpload}
                  disabled={syncing}
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                >
                  <CloudUpload className="size-3.5" />
                  强制上传
                </Button>
                <Button
                  onClick={handleForceDownload}
                  disabled={syncing}
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                >
                  <CloudDownload className="size-3.5" />
                  强制下载
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                强制上传：用本地数据覆盖远程 / 强制下载：用远程数据覆盖本地
              </p>

              <Button onClick={handleClearGhConfig} variant="ghost" size="sm" className="w-full text-xs">
                解除绑定
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* 本地备份与恢复 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-primary" />
            本地备份与恢复
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            导出数据到下载文件夹，或从备份文件恢复。导出的文件在浏览器的「下载」目录中。
          </p>
          <Button onClick={handleExport} variant="outline" className="w-full gap-2">
            <Download className="size-4" />
            导出全部数据
          </Button>

          <div className="border-t border-border pt-3">
            <Label className="mb-2 block">下载项目源码（用于发布到 GitHub Pages）</Label>
            <a
              href="./exam-prep-source.zip"
              download="exam-prep-source.zip"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <Download className="size-4" />
              下载源码 zip（约 0.5MB）
            </a>
            <p className="mt-2 text-[11px] text-muted-foreground">
              在电脑上下载后，按发布教程推送到 GitHub 即可独立部署。
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <Label className="mb-2 block">从备份文件恢复</Label>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={handleFileImport}
              className="hidden"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" />
                选择文件
              </Button>
            </div>
            {importJson && (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={importJson.slice(0, 200) + '...'}
                  readOnly
                  className="min-h-16 text-xs"
                  placeholder="备份数据预览"
                />
                <Button onClick={handleImport} size="sm" variant="destructive">
                  确认恢复（将覆盖现有数据）
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 清除记录 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="size-4 text-destructive" />
            清除记录
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            一键清理历史冗余数据：<b className="text-foreground">已完成的计划</b>、<b className="text-foreground">已掌握的错题</b>、以及 <b className="text-foreground">一个月前的每日复盘</b>。未完成的计划、未掌握的错题和近期复盘都会保留。
          </p>
          <Button
            variant="destructive"
            className="w-full gap-2"
            onClick={() => setClearOpen(true)}
          >
            <Trash2 className="size-4" />
            清除记录
          </Button>
        </CardContent>
      </Card>
    </div>

  <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          <Trash2 className="size-5 text-destructive" />
          确认清除记录？
        </AlertDialogTitle>
        <AlertDialogDescription className="text-sm leading-relaxed">
          将永久删除：已完成的所有计划、已掌握的所有错题、以及一个月前的每日复盘记录。此操作不可撤销，建议先到上方「导出全部数据」备份。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="gap-2">
        <AlertDialogCancel disabled={clearing}>取消</AlertDialogCancel>
        <AlertDialogAction
          onClick={(e) => {
            e.preventDefault()
            handleClearRecords()
          }}
          disabled={clearing}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {clearing ? '清除中...' : '确认清除'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  </>
)
}
