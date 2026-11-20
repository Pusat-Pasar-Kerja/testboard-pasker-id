import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error'

export const ToastContext = createContext<{ show: (message: string, tone?: ToastTone) => void }>({
  show: () => undefined,
})

export function useToast() {
  return useContext(ToastContext)
}
