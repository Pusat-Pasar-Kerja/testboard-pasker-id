import type { DragEvent } from 'react'

/**
 * Dragging feature folders onto a Fase folder in the left panel, like Google Drive (ADR 0020).
 * The buttons on every folder do the same for keyboard and touch screens.
 */
export const FEATURE_DRAG_TYPE = 'application/x-testboard-features'

export interface FeatureDrag {
  /** The Fase the folders come from; null = "Belum masuk Fase". */
  from: string | null
  features: { id: string; name: string }[]
}

export function startFeatureDrag(event: DragEvent, drag: FeatureDrag): void {
  event.dataTransfer.setData(FEATURE_DRAG_TYPE, JSON.stringify(drag))
  event.dataTransfer.effectAllowed = 'copyMove'
}

export function isFeatureDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(FEATURE_DRAG_TYPE)
}

export function readFeatureDrag(event: DragEvent): FeatureDrag | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(FEATURE_DRAG_TYPE)) as FeatureDrag
    return Array.isArray(value?.features) && value.features.length > 0 ? value : null
  } catch {
    return null
  }
}
