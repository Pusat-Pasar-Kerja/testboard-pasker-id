import { Camera, CircleAlert, ImagePlus, LoaderCircle, X } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { usePhotoUploads } from './use-photo-uploads'

export function PhotoPicker({ uploads }: { uploads: ReturnType<typeof usePhotoUploads> }) {
  const { t } = useTranslation()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const pick = (input: HTMLInputElement | null) => {
    if (input?.files?.length) uploads.add(input.files)
    if (input) input.value = ''
  }
  return (
    <div>
      <p className="text-lg font-semibold">{t('easy.photo.title')}</p>
      <p className="text-sm text-ink-muted">{t('easy.photo.hint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => camera.current?.click()}
          className="inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-brand-200 bg-brand-50 px-5 text-lg font-semibold text-brand-800 hover:bg-brand-100"
        >
          <Camera aria-hidden="true" className="size-6" />
          {t('easy.photo.camera')}
        </button>
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 text-lg font-semibold hover:bg-neutral-soft"
        >
          <ImagePlus aria-hidden="true" className="size-6" />
          {t('easy.photo.gallery')}
        </button>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => pick(e.currentTarget)}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label={t('easy.photo.gallery')}
          onChange={(e) => pick(e.currentTarget)}
        />
      </div>
      {uploads.photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {uploads.photos.map((photo) => (
            <li key={photo.key} className="relative overflow-hidden rounded-xl border border-line">
              <img
                src={photo.localUrl}
                alt={photo.name}
                className="aspect-square w-full object-cover"
              />
              <span
                className={`absolute inset-x-0 bottom-0 flex items-center gap-1 px-2 py-1 text-xs font-semibold ${
                  photo.state === 'ready'
                    ? 'bg-success-soft text-success'
                    : photo.state === 'failed'
                      ? 'bg-danger-soft text-danger'
                      : 'bg-surface/90 text-ink'
                }`}
                role="status"
              >
                {photo.state === 'failed' ? (
                  <CircleAlert aria-hidden="true" className="size-3.5" />
                ) : photo.state !== 'ready' ? (
                  <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                ) : null}
                {t(`easy.photo.state.${photo.state}`)}
              </span>
              <button
                type="button"
                onClick={() => uploads.remove(photo.key)}
                className="absolute top-1 right-1 inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow"
              >
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">{t('easy.photo.remove', { name: photo.name })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
