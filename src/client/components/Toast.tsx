import clsx from 'clsx';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastOptions {
  /** 「元に戻す」など、お知らせの右に出すボタン */
  action?: { label: string; onClick: () => void };
  error?: boolean;
}
interface ToastState extends ToastOptions {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string, opts?: ToastOptions) => void>(() => {});

/** 画面の下に短いお知らせを出す（Kakeibo の Toast に、ボタンとエラーの見た目を足したもの） */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const show = useCallback((message: string, opts: ToastOptions = {}) => {
    const id = ++seq.current;
    setToast({ id, message, ...opts });
    window.clearTimeout(timer.current);
    // ボタンがあるときは押す時間を長めにとる
    timer.current = window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), opts.action ? 5000 : 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role={toast.error ? 'alert' : 'status'}
          className="toast fixed bottom-[calc(env(safe-area-inset-bottom,0px)+150px)] left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 animate-fade-in items-center gap-2 rounded-full bg-ink py-2 pr-2 pl-4 text-sm font-medium text-bg shadow-float lg:bottom-6"
        >
          {toast.error ? <CircleAlert className="size-4 shrink-0 text-[#fca5a5]" /> : <CircleCheck className="size-4 shrink-0 text-[#fdba74]" />}
          <span className={clsx('min-w-0', !toast.action && 'pr-2')}>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="min-h-8 shrink-0 rounded-full px-3 font-semibold text-[#fdba74] hover:bg-white/10"
              onClick={() => {
                toast.action!.onClick();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
