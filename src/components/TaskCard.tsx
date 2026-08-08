import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DailyPlan, TaskCategory } from '@/lib/types'

const CATEGORY_META: Record<TaskCategory, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  core: { label: '核心', variant: 'default' },
  normal: { label: '常规', variant: 'secondary' },
  extra: { label: '保温', variant: 'outline' },
}

interface TaskCardProps {
  plan: DailyPlan
  onToggle: (id: string, isCompleted: boolean) => void
  onEdit?: (plan: DailyPlan) => void
}

/**
 * 任务卡片：支持勾选完成，显示模块/分类/来源
 */
export function TaskCard({ plan, onToggle, onEdit }: TaskCardProps) {
  const cat = CATEGORY_META[plan.task_category]
  return (
    <Card
      className={cn(
        'flex items-start gap-3 border p-3 transition-all duration-200',
        plan.is_completed && 'bg-muted/40'
      )}
    >
      <Checkbox
        checked={plan.is_completed}
        onCheckedChange={(v) => onToggle(plan.id, v === true)}
        className="mt-0.5"
        aria-label={plan.task_title}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={cat.variant} className="shrink-0">
            {plan.module_name}
          </Badge>
          <Badge variant="outline" className="shrink-0 text-muted-foreground">
            {cat.label}
          </Badge>
          {plan.is_ai && (
            <Badge className="shrink-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">
              AI
            </Badge>
          )}
        </div>
        <p
          className={cn(
            'break-any mt-1.5 text-sm font-medium leading-snug',
            plan.is_completed && 'text-muted-foreground line-through'
          )}
        >
          {plan.task_title}
        </p>
        {plan.task_description ? (
          <p className="mt-1 text-xs text-muted-foreground">{plan.task_description}</p>
        ) : null}
      </div>
      {onEdit && (
        <button
          onClick={() => onEdit(plan)}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="编辑任务"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}
    </Card>
  )
}
