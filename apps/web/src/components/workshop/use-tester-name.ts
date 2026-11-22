import { useState } from 'react'
import { readTesterName, storeTesterName } from '../../lib/workshop'

/** The name on this device ("Yang mengisi"), remembered per table; text only. */
export function useTesterName(tableId: string) {
  const [name, setName] = useState<string | null>(() => readTesterName(tableId))
  return {
    name,
    choose: (value: string | null) => {
      storeTesterName(tableId, value)
      setName(value)
    },
  }
}
