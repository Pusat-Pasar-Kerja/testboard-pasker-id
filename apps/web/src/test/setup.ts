import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Multi-step user flows (type, save, navigate, refetch) need more than the 1s default.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
