import type { EvidenceRef, FileDto, FileFailureReason } from '@testboard/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDataSource } from '../../services/use-data-source'

export type UploadPhase = 'uploading' | 'processing' | 'ready' | 'rejected' | 'failed' | 'error'

export interface UploadItem {
  key: string
  name: string
  size: number
  /** Local preview of an image before/while uploading (object URL, revoked on removal). */
  previewUrl: string | null
  phase: UploadPhase
  progress: number
  dto: FileDto | null
  reason: FileFailureReason | null
  caption: string
  stepNumber: number | null
}

const IMAGE = /\.(png|jpe?g|webp)$/i
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function phaseOf(dto: FileDto): UploadPhase {
  if (dto.processing_status === 'PROCESSING') return 'processing'
  if (dto.processing_status === 'READY' && dto.scan_status === 'CLEAN') return 'ready'
  return dto.processing_status === 'REJECTED' ? 'rejected' : 'failed'
}

/** Pasted screenshots arrive as "image.png"; give them a readable, unique name. */
export function namePasted(file: File, index: number): File {
  if (!/^image\.(png|jpe?g|webp)$/i.test(file.name)) return file
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const ext = file.name.split('.').pop()
  return new File([file], `tempel-${stamp}${index > 0 ? `-${index + 1}` : ''}.${ext}`, {
    type: file.type,
  })
}

/**
 * Upload state for one form: each file is uploaded on its own (own progress, retry and
 * cancel), then polled until the server pipeline has checked it (doc 07). Only READY +
 * CLEAN files become references that can be attached.
 */
export function useEvidenceUploads(projectCode: string) {
  const ds = useDataSource()
  const [items, setItems] = useState<UploadItem[]>([])
  const files = useRef(new Map<string, File>())
  const controllers = useRef(new Map<string, AbortController>())
  const alive = useRef(true)
  const current = useRef<UploadItem[]>([])
  useEffect(() => {
    current.current = items
  }, [items])

  useEffect(() => {
    alive.current = true
    const ctrl = controllers.current
    return () => {
      alive.current = false
      for (const controller of ctrl.values()) controller.abort()
    }
  }, [])

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    if (!alive.current) return
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }, [])

  const poll = useCallback(
    async (key: string, fileId: string) => {
      for (let i = 0; i < 150 && alive.current; i++) {
        await sleep(i < 5 ? 300 : 1000)
        try {
          const dto = await ds.getFileStatus(projectCode, fileId)
          if (dto.processing_status !== 'PROCESSING') {
            update(key, { dto, phase: phaseOf(dto), reason: dto.failure_reason })
            return
          }
        } catch {
          // transient network error: keep polling
        }
      }
      update(key, { phase: 'failed', reason: 'PROCESSING_ERROR' })
    },
    [ds, projectCode, update],
  )

  const start = useCallback(
    async (key: string) => {
      const file = files.current.get(key)
      if (!file) return
      const controller = new AbortController()
      controllers.current.set(key, controller)
      update(key, { phase: 'uploading', progress: 0, reason: null })
      try {
        const result = await ds.uploadFile(projectCode, file, {
          signal: controller.signal,
          onProgress: (progress) => update(key, { progress }),
        })
        const dto = result.files[0]
        if (!dto) {
          update(key, {
            phase: 'rejected',
            reason: result.rejected[0]?.failure_reason ?? 'TYPE_NOT_ALLOWED',
          })
          return
        }
        update(key, { dto, phase: phaseOf(dto), reason: dto.failure_reason, progress: 1 })
        if (dto.processing_status === 'PROCESSING') void poll(key, dto.id)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        update(key, { phase: 'error' })
      } finally {
        controllers.current.delete(key)
      }
    },
    [ds, projectCode, poll, update],
  )

  const add = useCallback(
    (incoming: File[]) => {
      const created = incoming.map((file): UploadItem => {
        const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        files.current.set(key, file)
        const canPreview = IMAGE.test(file.name) && typeof URL.createObjectURL === 'function'
        return {
          key,
          name: file.name,
          size: file.size,
          previewUrl: canPreview ? URL.createObjectURL(file) : null,
          phase: 'uploading',
          progress: 0,
          dto: null,
          reason: null,
          caption: '',
          stepNumber: null,
        }
      })
      setItems((list) => [...list, ...created])
      for (const item of created) void start(item.key)
    },
    [start],
  )

  const release = (item: UploadItem) => {
    controllers.current.get(item.key)?.abort()
    files.current.delete(item.key)
    if (item.previewUrl && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(item.previewUrl)
    }
  }

  /** Remove from the form; an uploaded, unattached file is deleted on the server too. */
  const remove = useCallback(
    (key: string) => {
      const item = current.current.find((i) => i.key === key)
      if (!item) return
      release(item)
      if (item.dto && item.phase !== 'rejected') {
        void ds.deleteFile(projectCode, item.dto.id).catch(() => undefined)
      }
      setItems((list) => list.filter((i) => i.key !== key))
    },
    [ds, projectCode],
  )

  /** After the files were attached: forget them without deleting anything. */
  const clear = useCallback(() => {
    current.current.forEach(release)
    setItems([])
  }, [])

  const retry = useCallback((key: string) => void start(key), [start])
  const setCaption = useCallback(
    (key: string, caption: string) => update(key, { caption }),
    [update],
  )
  const setStep = useCallback(
    (key: string, stepNumber: number | null) => update(key, { stepNumber }),
    [update],
  )

  return useMemo(() => {
    const ready = items.filter((i) => i.phase === 'ready' && i.dto)
    const refs: EvidenceRef[] = ready.map((i) => ({
      file_id: (i.dto as FileDto).id,
      caption: i.caption.trim() || null,
      step_number: i.stepNumber,
    }))
    return {
      items,
      add,
      remove,
      retry,
      clear,
      setCaption,
      setStep,
      refs,
      readyCount: ready.length,
      busy: items.some((i) => i.phase === 'uploading' || i.phase === 'processing'),
    }
  }, [items, add, remove, retry, clear, setCaption, setStep])
}

export type EvidenceUploads = ReturnType<typeof useEvidenceUploads>
