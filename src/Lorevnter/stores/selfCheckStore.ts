import { defineStore } from 'pinia';
import { ref } from 'vue';

// ── 类型定义 ──
export type CheckStatus = 'pending' | 'running' | 'success' | 'error';

export interface CheckStep {
  id: string;
  title: string;
  description: string;
  status: CheckStatus;
  resultMessage?: string;
  action: () => Promise<string | void>;
}

export const useSelfCheckStore = defineStore('lorevnter_selfcheck', () => {
  // ── 状态 ──
  const isRunning = ref(false);
  const isFinished = ref(false);
  const steps = ref<CheckStep[]>([]);
  const currentStepId = ref<string | null>(null);

  // ── 初始化检查流 ──
  function initSteps(presetSteps: Omit<CheckStep, 'status' | 'resultMessage'>[]) {
    steps.value = presetSteps.map(step => ({
      ...step,
      status: 'pending',
    }));
    isRunning.value = false;
    isFinished.value = false;
    currentStepId.value = null;
  }

  // ── 辅助延迟 ──
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // ── 执行检查 ──
  async function runCheck() {
    if (isRunning.value) return;
    
    isRunning.value = true;
    isFinished.value = false;

    for (const step of steps.value) {
      step.status = 'pending';
      step.resultMessage = '';
    }

    // 给 UI 一点进入动画的时间
    await delay(300);

    for (const step of steps.value) {
      currentStepId.value = step.id;
      step.status = 'running';

      try {
        const result = await step.action();
        step.status = 'success';
        if (result) {
          step.resultMessage = result;
        } else {
          step.resultMessage = '检查通过';
        }
      } catch (error) {
        step.status = 'error';
        step.resultMessage = error instanceof Error ? error.message : String(error);
        break; // 错误直接阻断
      }
      
      // 优雅的停顿，体现自检的节奏感
      await delay(400);
    }

    isRunning.value = false;
    isFinished.value = true;
    currentStepId.value = null;
  }

  return {
    isRunning,
    isFinished,
    steps,
    currentStepId,
    initSteps,
    runCheck,
  };
});
