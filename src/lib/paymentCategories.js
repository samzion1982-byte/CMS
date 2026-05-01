import { supabase } from './supabase'

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
  const { error } = await supabase
    .from('payment_categories')
    .update({ name: name.trim(), sort_order })
    .eq('id', id)
  if (error) throw error
}

export async function toggleCategory(id, is_active) {
  const { error } = await supabase
    .from('payment_categories')
    .update({ is_active })
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
  const { error } = await supabase.from('payment_categories').delete().eq('id', id)
  if (error) throw error
}
