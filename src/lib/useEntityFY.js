import { useState, useEffect } from 'react'
import { useEntity } from './EntityContext'
import { getFY, fyOptions } from './accountingLib'

const storageKey = (id) => `ac_fy_${id}`

/**
 * Entity-linked FY state — Tally-like behaviour:
 * • On entity switch, restores the last-used FY for that entity
 *   (falls back to the entity's fy_start, then the current calendar FY)
 * • Manual FY changes are persisted per entity in sessionStorage
 * • FY option list starts from the entity's fy_start year
 */
export function useEntityFY() {
  const { currentEntity, currentEntityId } = useEntity()

  const [fy, _setFy] = useState(() => {
    if (currentEntityId) {
      return (
        sessionStorage.getItem(storageKey(currentEntityId)) ||
        currentEntity?.fy_start ||
        getFY()
      )
    }
    return getFY()
  })

  const [fyOpen, setFyOpen] = useState(false)

  // Restore last-used FY whenever the active entity changes
  useEffect(() => {
    if (!currentEntityId) return
    const stored = sessionStorage.getItem(storageKey(currentEntityId))
    _setFy(stored || currentEntity?.fy_start || getFY())
  }, [currentEntityId, currentEntity?.fy_start])

  // Persist FY selection per entity
  function setFy(newFy) {
    _setFy(newFy)
    if (currentEntityId) sessionStorage.setItem(storageKey(currentEntityId), newFy)
  }

  const FYS = fyOptions(currentEntity?.fy_start)

  return { fy, setFy, fyOpen, setFyOpen, FYS }
}
