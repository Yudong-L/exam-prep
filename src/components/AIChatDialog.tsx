import { Bot } from 'lucide-react'
import { AiChatThread, type ChatMsg } from '@/components/AiChatThread'
import { aiGradingChat } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string | { type: string; text?: string; image_url?: { url: string } }[]
}

interface AIChatDialogProps {
  /** 对话上下文（之前的批改对话） */
  history: Message[]
  moduleType: string
  /** 题目图片（data URL），提供后对话将启用视觉模型 */
  imageUrl?: string
}

/** 将批改对话的历史记录转换为统一消息结构（提取文本与图片） */
function toChatMsg(history: Message[]): ChatMsg[] {
  return history.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content }
    }
    const text = m.content
      .map((c) => (c.type === 'text' && c.text ? c.text : ''))
      .join('\n')
      .trim()
    const img = m.content.find((c) => c.type === 'image_url')?.image_url?.url
    return { role: m.role, content: text, image: img }
  })
}

export function AIChatDialog({ history, moduleType, imageUrl }: AIChatDialogProps) {
  const initialMessages = toChatMsg(history)

  const sendFn = async (msgs: ChatMsg[], image?: string) => {
    // 与原逻辑一致：若本次带图，则将图片附着在最后一条 user 消息上；
    // 否则沿用题目图片 imageUrl 作为视觉输入。
    let payload: { role: 'user' | 'assistant'; content: string | any[] }[] = msgs.map((m) => ({
      role: m.role,
      content: m.content,
    }))
    let sendImg: string | undefined
    if (image) {
      const last = payload[payload.length - 1]
      if (last && last.role === 'user') {
        last.content = [
          { type: 'image_url', image_url: { url: image } },
          { type: 'text', text: typeof last.content === 'string' ? last.content : '请看这张图片' },
        ]
      }
      sendImg = undefined
    } else {
      sendImg = imageUrl
    }
    const text = await aiGradingChat(payload as any, moduleType, sendImg)
    return { text }
  }

  return (
    <div className="space-y-2">
      <div className="px-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Bot className="size-3.5 text-info" />
          与 AI 老师对话
        </p>
        <p className="text-[10px] text-muted-foreground">可以追问评分依据、要求重新评估，也可上传图片/文件</p>
      </div>
      <AiChatThread
        initialMessages={initialMessages}
        sendFn={sendFn}
        placeholder="追问AI...如：我的论据为什么不够充分？"
        accept="image/*,text/*,.txt,.md,.json,.csv"
      />
    </div>
  )
}
