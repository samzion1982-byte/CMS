/* ═══════════════════════════════════════════════════════════════
   EntityContext.jsx — Accounting entity (book) context
   Provides the currently selected accounting entity across all
   accounting pages. Selection persists in sessionStorage.
   Default entity persists in localStorage.
   ═══════════════════════════════════════════════════════════════ */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const EntityContext = createContext(null)

const SESSION_KEY = 'ac_entity_id'
const DEFAULT_KEY = 'ac_default_entity_id'

export function EntityProvider({ children }) {
  const [entities,        setEntities]        = useState([])
  const [currentEntityId, setCurrentEntityId] = useState(
    () => sessionStorage.getItem(SESSION_KEY) || null
  )
  const [defaultEntityId, setDefaultEntityId] = useState(
    () => localStorage.getItem(DEFAULT_KEY) || null
  )
  const [loading, setLoading] = useState(true)

  const loadEntities = useCallback(async () => {
    const { data } = await supabase
      .from('accounting_entities')
      .select('*')
      .order('created_at', { ascending: true })
    const list = data || []
    setEntities(list)

    // Priority: sessionStorage → localStorage default → first active entity
    const stored    = sessionStorage.getItem(SESSION_KEY)
    const defaultId = localStorage.getItem(DEFAULT_KEY)

    const validStored  = stored    && list.find(e => e.id === stored    && e.is_active)
    const validDefault = defaultId && list.find(e => e.id === defaultId && e.is_active)

    if (validStored) {
      setCurrentEntityId(stored)
    } else if (validDefault) {
      setCurrentEntityId(defaultId)
      sessionStorage.setItem(SESSION_KEY, defaultId)
    } else if (list.length > 0) {
      const first = list.find(e => e.is_active) || list[0]
      setCurrentEntityId(first.id)
      sessionStorage.setItem(SESSION_KEY, first.id)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadEntities() }, [loadEntities])

  function switchEntity(id) {
    setCurrentEntityId(id)
    sessionStorage.setItem(SESSION_KEY, id)
  }

  function setDefaultEntity(id) {
    localStorage.setItem(DEFAULT_KEY, id)
    setDefaultEntityId(id)
  }

  const currentEntity = entities.find(e => e.id === currentEntityId) || null

  return (
    <EntityContext.Provider value={{
      entities, currentEntity, currentEntityId,
      defaultEntityId, setDefaultEntity,
      switchEntity, loading, reload: loadEntities,
    }}>
      {children}
    </EntityContext.Provider>
  )
}

export function useEntity() {
  const ctx = useContext(EntityContext)
  if (!ctx) throw new Error('useEntity must be used inside <EntityProvider>')
  return ctx
}
