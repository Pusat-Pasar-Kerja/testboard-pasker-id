import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Multi-step user flows (type, save, navigate, refetch) need more than the 1s default; staff
// pages load on demand, which under a busy parallel run can take a few seconds.
configure({ asyncUtilTimeout: 8000 })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
