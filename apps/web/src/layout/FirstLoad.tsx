import { LoadingState } from '../components/ui/States'

/** Shown while the first page of a visit is still downloading. */
export function FirstLoad() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <LoadingState rows={4} />
    </div>
  )
}
