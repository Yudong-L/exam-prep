import { useState } from 'react'
import { Lock, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { verifyAiPassword } from '@/lib/ai-service'

interface AiPasswordDialogProps {
  open: boolean
  onClose: () => void
  onVerified: () => void
}

export function AiPasswordDialog({ open, onClose, onVerified }: AiPasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleVerify = () => {
    setLoading(true)
    setTimeout(() => {
      if (verifyAiPassword(password)) {
        setPassword('')
        setError(false)
        setLoading(false)
        onVerified()
        onClose()
      } else {
        setError(true)
        setLoading(false)
      }
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            AI 功能解锁
          </DialogTitle>
          <DialogDescription className="text-xs">
            请输入 6 位密码以使用 AI 批改和对话功能
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password.length === 6) handleVerify()
            }}
            placeholder="请输入 6 位密码"
            className="text-center text-lg tracking-[0.5em] font-mono"
            autoFocus
          />
          {error && (
            <p className="text-xs text-destructive text-center">密码错误，请重试</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleVerify} disabled={password.length !== 6 || loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
