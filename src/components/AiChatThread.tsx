import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Send, Loader2, Bot, User, X, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { fileToDataUrl } from '@/lib/image'
import { toast } from 'sonner'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  /** 随该用户消息一起发送的图片（用于回显） */
  image?: string
}

export interface SendResult {
  text: string
  meta?: unknown
}

export interface AiChatThreadHandle {
  /** 发送一条消息（会显示在对话中） */
  send: (text: string, image?: string) => void
  /** 发送一条仅用于请求 AI、不显示在对话中的消息（用于后台指令） */
  sendHidden: (text: string, image?: string) => void
}

interface AiChatThreadProps {
  initialMessages?: ChatMsg[]
  /** 调用 AI 的函数：接收完整消息列表与可选的图片，返回回复文本（可附带 meta） */
  sendFn: (messages: ChatMsg[], image?: string) => Promise<SendResult>
  placeholder?: string
  /** 文件选择器接受的格式，默认仅图片 */
  accept?: string
  /** 助手回复后回传的结构化数据 */
  onMeta?: (meta: unknown) => void
  /** 助手回复后的原始文本 */
  onReply?: (text: string) => void
  /** 每次发送时回传本次发送的图片（用于父组件留存） */
  onSentImage?: (image?: string) => void
  /** 调用失败时回调，回传错误信息（用于父组件复位 loading 或弹出密码框） */
  onError?: (message: string) => void
  heightClass?: string
  className?: string
}

/** 清理 AI 返回的消息：移除 markdown 代码块标记、压缩多余空行 */
function formatMessage(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (match) =>
      match.replace(/```\w*\n?/g, '').replace(/```/g, ''),
    )
    .replace(/^```\w*\n?/gm, '')
    .replace(/\n```$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const AiChatThread = forwardRef<AiChatThreadHandle, AiChatThreadProps>(
  function AiChatThread(
    {
      initialMessages = [],
      sendFn,
      placeholder = '输入消息...',
      accept = 'image/*',
      onMeta,
      onReply,
      onSentImage,
      onError,
      heightClass = 'max-h-64',
      className,
    },
    ref,
  ) {
    const [messages, setMessages] = useState<ChatMsg[]>(initialMessages)
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [pendingImage, setPendingImage] = useState<string | undefined>(undefined)
    const fileRef = useRef<HTMLInputElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, [messages, loading])

    const runTurn = async (userMsg: ChatMsg, showUser: boolean, image?: string) => {
      // 先回传本次发送的图片，再清空待发送状态
      onSentImage?.(image)
      if (showUser) setMessages((prev) => [...prev, userMsg])
      const nextForApi = [...messages, userMsg]
      setInput('')
      setPendingImage(undefined)
      setLoading(true)
      try {
        const res = await sendFn(nextForApi, image)
        setMessages((prev) => [...prev, { role: 'assistant', content: res.text }])
        if (res.meta !== undefined) onMeta?.(res.meta)
        onReply?.(res.text)
      } catch (e: any) {
        const msg = e?.message || 'AI 回复失败'
        toast.error(msg)
        onError?.(msg)
      } finally {
        setLoading(false)
      }
    }

    const handleSend = () => {
      const text = input.trim()
      if (!text && !pendingImage) return
      const userMsg: ChatMsg = {
        role: 'user',
        content: text || '请看这张图片',
        image: pendingImage,
      }
      void runTurn(userMsg, true, pendingImage)
    }

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.type.startsWith('image/')) {
        if (file.size > 8 * 1024 * 1024) {
          toast.warning('图片大小不能超过 8MB')
          return
        }
        try {
          setUploading(true)
          setPendingImage(await fileToDataUrl(file))
        } catch {
          toast.error('图片读取失败，请重试')
        } finally {
          setUploading(false)
        }
      } else if (
        /^(image|text)\//.test(file.type) ||
        /\.(txt|md|json|csv)$/i.test(file.name)
      ) {
        // 文本类文件：读取内容并追加到输入框
        const reader = new FileReader()
        reader.onload = () => {
          const text = String(reader.result || '')
          setInput((prev) => (prev ? prev + '\n' + text : text).slice(0, 6000))
        }
        reader.readAsText(file)
        toast.success('已读取文件内容，可连同问题一起发送')
      } else {
        toast.warning('暂仅支持图片或文本（txt/md）文件')
      }
      if (fileRef.current) fileRef.current.value = ''
    }

    useImperativeHandle(ref, () => ({
      send: (text: string, image?: string) => {
        if (!text.trim() && !image) return
        const userMsg: ChatMsg = {
          role: 'user',
          content: text.trim() || '请看这张图片',
          image,
        }
        void runTurn(userMsg, true, image)
      },
      sendHidden: (text: string, image?: string) => {
        if (!text.trim() && !image) return
        const userMsg: ChatMsg = { role: 'user', content: text, image }
        void runTurn(userMsg, false, image)
      },
    }))

    return (
      <div className={cn('rounded-lg border bg-card', className)} onClick={(e) => e.stopPropagation()}>
        <div className={cn('space-y-2 overflow-y-auto p-3', heightClass)} ref={scrollRef}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-2 rounded-lg p-2 text-sm',
                m.role === 'user' ? 'bg-primary/5' : 'bg-muted/40',
              )}
            >
              {m.role === 'user' ? (
                <User className="mt-0.5 size-3.5 shrink-0 text-primary" />
              ) : (
                <Bot className="mt-0.5 size-3.5 shrink-0 text-info" />
              )}
              <div className="flex-1 space-y-1">
                {m.image && (
                  <img src={m.image} alt="附件" className="max-h-28 rounded-md border" />
                )}
                <p className="whitespace-pre-wrap break-any text-xs leading-relaxed">
                  {formatMessage(m.content)}
                </p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              AI 思考中...
            </div>
          )}
        </div>

        <div className="space-y-2 border-t p-2">
          {pendingImage && (
            <div className="relative inline-block">
              <img src={pendingImage} alt="待发送图片" className="max-h-24 rounded-md border" />
              <button
                onClick={() => setPendingImage(undefined)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white"
                aria-label="移除图片"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={handleFile}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => fileRef.current?.click()}
              title="上传图片/文件"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              className="min-h-0 h-9 resize-none text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={loading || (!input.trim() && !pendingImage)}
            >
              <Send className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    )
  },
)
