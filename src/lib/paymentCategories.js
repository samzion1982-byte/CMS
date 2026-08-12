import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'

export async function getCategories() {
  const { data, error } = await supabase
    .from('payment_categories')
    .select('id,name,is_active,sort_order')
    .order('sort_order', { ascending: true })
    .order('name',       { ascending: true })
  if (error) throw error
  return data || []
}

export async function getActiveCategories() {
  const { data, error } = await supabase
    .from('payment_categories')
    .select('id,name,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function updateCategory(id, name, sort_order) {
  const { data: cat, error } = await supabase
    .from('payment_categories')
    .update({ name: name.trim(), sort_order })
    .eq('id', id)
    .select('coa_account_id')
    .single()
  if (error) throw error

  // Keep COA account name in sync if this category is mapped
  if (cat?.coa_account_id) {
    await supabase
      .from('chart_of_accounts')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', cat.coa_account_id)
  }

  await logCmsAudit({
    action: 'updated',
    module: 'finance',
    entityType: 'payment_categories',
    entityId: id,
    entityLabel: name.trim(),
    summary: `Updated payment category “${name.trim()}”`,
  })
}

export async function toggleCategory(id, is_active) {
  const { data, error } = await supabase
    .from('payment_categories')
    .update({ is_active })
    .eq('id', id)
    .select('name')
    .maybeSingle()
  if (error) throw error
  await logCmsAudit({
    action: is_active ? 'activated' : 'deactivated',
    module: 'finance',
    entityType: 'payment_categories',
    entityId: id,
    entityLabel: data?.name || id,
    summary: `${is_active ? 'Activated' : 'Deactivated'} payment category “${data?.name || id}”`,
  })
}

export async function reorderCategory(id, sort_order) {
  const { error } = await supabase
    .from('payment_categories')
    .update({ sort_order })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id) {
  // Check if used in any receipt_items or declaration_items
  const [{ count: rCount }, { count: dCount }] = await Promise.all([
    supabase.from('receipt_items').select('id', { count: 'exact', head: true }).eq('category_id', id),
    supabase.from('declaration_items').select('id', { count: 'exact', head: true }).eq('category_id', id),
  ])
  if ((rCount || 0) + (dCount || 0) > 0) {
    throw new Error('Category has existing data — deactivate instead of deleting.')
  }
  const { data: cat } = await supabase
    .from('payment_categories')
    .select('name')
    .eq('id', id)
    .maybeSingle()
  const { error } = await supabase.from('payment_categories').delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'finance',
    entityType: 'payment_categories',
    entityId: id,
    entityLabel: cat?.name || id,
    summary: `Deleted payment category “${cat?.name || id}”`,
  })
}
