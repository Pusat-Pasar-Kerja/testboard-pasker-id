import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataSource } from '../../services/use-data-source'

export interface PickedPhoto {
  key: string
  name: string
  localUrl: string
  fileId: string | null
  state: 'uploading' | 'checking' | 'ready' | 'failed'
}

const POLL_MS = 1000
const MAX_POLLS = 60

/**
 * Photos for Mode Mudah: uploaded right away through the normal evidence checks, then
 * polled until they are ready to attach. Older phones and slow venue Wi-Fi are expected,
 * so every state is shown in words next to the picture.
 */
export function usePhotoUploads() {
  const ds = useDataSource()
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const alive = useRef(true)
  const urls = useRef<string[]>([])

  useEffect(() => {
    alive.current = true
    const created = urls.current
    return () => {
      alive.current = false
      for (const url of created) URL.revokeObjectURL(url)
    }
  }, [])

  const patch = (key: string, change: Partial<PickedPhoto>) =>
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)))

  const add = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files).slice(0, 10)) {
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const localUrl = URL.createObjectURL(file)
        urls.current.push(localUrl)
        setPhotos((list) => [
          ...list,
          { key, name: file.name, localUrl, fileId: null, state: 'uploading' },
        ])
        void (async () => {
          try {
            const result = await ds.uploadWorkshopFile(file)
            const uploaded = result.files[0]
            if (!uploaded || uploaded.processing_status === 'REJECTED') {
              if (alive.current) patch(key, { state: 'failed' })
              return
            }
            if (alive.current) patch(key, { fileId: uploaded.id, state: 'checking' })
            for (let i = 0; i < MAX_POLLS && alive.current; i += 1) {
              const status = await ds.getWorkshopFileStatus(uploaded.id)
              if (status.processing_status === 'READY' && status.scan_status === 'CLEAN') {
                if (alive.current) patch(key, { state: 'ready' })
                return
              }
              if (['REJECTED', 'FAILED'].includes(status.processing_status)) break
              await new Promise((resolve) => setTimeout(resolve, POLL_MS))
            }
            if (alive.current) patch(key, { state: 'failed' })
          } catch {
            if (alive.current) patch(key, { state: 'failed' })
          }
        })()
      }
    },
    [ds],
  )

  return {
    photos,
    add,
    remove: (key: string) => setPhotos((list) => list.filter((p) => p.key !== key)),
    clear: () => setPhotos([]),
    busy: photos.some((p) => p.state === 'uploading' || p.state === 'checking'),
    evidence: () =>
      photos.filter((p) => p.state === 'ready' && p.fileId).map((p) => ({ file_id: p.fileId! })),
  }
}
