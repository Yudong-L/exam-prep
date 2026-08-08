import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Route } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedRoutes } from "@/components/AnimatedRoutes";
import { PageTransition } from "@/components/PageTransition";
import { AppLayout } from "@/components/AppLayout";
import { autoBackup, shouldRemindBackup } from "@/lib/auto-backup";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// 路由级懒加载：首屏只加载首页 + 公共依赖，其余页面按需加载，显著减小首屏体积
const Index = lazy(() => import('./pages/Index'));
const DailyPlan = lazy(() => import('./pages/DailyPlan'));
const AIGrading = lazy(() => import('./pages/AIGrading'));
const MistakeBook = lazy(() => import('./pages/MistakeBook'));
const QuizPractice = lazy(() => import('./pages/QuizPractice'));
const ReviewCenter = lazy(() => import('./pages/ReviewCenter'));
const MonthlyPlan = lazy(() => import('./pages/MonthlyPlan'));
const SpeedCalc = lazy(() => import('./pages/SpeedCalc'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/**
 * Configure TanStack Query client with optimized defaults
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

function App() {
  useEffect(() => {
    // 启动时自动备份一次
    autoBackup()
    // 如果超过24小时没导出过备份，提醒用户
    if (shouldRemindBackup()) {
      setTimeout(() => {
        toast.info('数据备份提醒', {
          description: '建议定期到「设置」导出数据备份，避免数据丢失',
          duration: 6000,
        })
      }, 3000)
    }
    // 每5分钟自动备份一次
    const interval = setInterval(autoBackup, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <HashRouter>
          <AppLayout>
            <AnimatedRoutes>
              <Route path="/" data-genie-key="Home" data-genie-title="首页" element={<PageTransition transition="fade"><LazyPage><Index /></LazyPage></PageTransition>} />
              <Route path="/daily-plan" data-genie-key="DailyPlan" data-genie-title="每日计划" element={<PageTransition transition="slide-up"><LazyPage><DailyPlan /></LazyPage></PageTransition>} />
              <Route path="/ai-grading" data-genie-key="AIGrading" data-genie-title="AI 批改" element={<PageTransition transition="slide-up"><LazyPage><AIGrading /></LazyPage></PageTransition>} />
              <Route path="/mistakes" data-genie-key="Mistakes" data-genie-title="错题本" element={<PageTransition transition="slide-up"><LazyPage><MistakeBook /></LazyPage></PageTransition>} />
              <Route path="/quiz" data-genie-key="Quiz" data-genie-title="刷题练习" element={<PageTransition transition="slide-up"><LazyPage><QuizPractice /></LazyPage></PageTransition>} />
              <Route path="/review" data-genie-key="Review" data-genie-title="复盘中心" element={<PageTransition transition="slide-up"><LazyPage><ReviewCenter /></LazyPage></PageTransition>} />
              <Route path="/speed-calc" data-genie-key="SpeedCalc" data-genie-title="速算练习" element={<PageTransition transition="slide-up"><LazyPage><SpeedCalc /></LazyPage></PageTransition>} />
              <Route path="/monthly-plan" data-genie-key="MonthlyPlan" data-genie-title="月计划" element={<PageTransition transition="slide-up"><LazyPage><MonthlyPlan /></LazyPage></PageTransition>} />
              <Route path="/settings" data-genie-key="Settings" data-genie-title="设置" element={<PageTransition transition="slide-up"><LazyPage><SettingsPage /></LazyPage></PageTransition>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" data-genie-key="NotFound" data-genie-title="Not Found" element={<PageTransition transition="fade"><LazyPage><NotFound /></LazyPage></PageTransition>} />
            </AnimatedRoutes>
          </AppLayout>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App
