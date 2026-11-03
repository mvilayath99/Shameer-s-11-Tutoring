import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useSettings } from '../../../lib/SettingsProvider'
import { Notice } from '../../../components/ui'
import type { ModuleRow } from '../../../lib/types'

export default function Modules() {
  const { modules, refresh } = useSettings()
  const [rows, setRows] = useState<ModuleRow[]>(modules)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => setRows(modules), [modules])

  const update = (i: number, patch: Partial<ModuleRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= rows.length) return
    const next = [...rows]; [next[i], next[j]] = [next[j], next[i]]
    setRows(next)
  }

  const save = async () => {
    setMsg(null)
    const payload = rows.map((r, i) => ({ key: r.key, display_name: r.display_name.trim() || r.key, enabled: r.enabled, sort_order: (i + 1) * 10, portals: r.portals, icon: r.icon }))
    const { error } = await supabase.from('modules').upsert(payload)
    if (error) setMsg({ kind: 'error', text: error.message })
    else { setMsg({ kind: 'success', text: 'Menus updated for everyone.' }); refresh() }
  }

  return (
    <div className="card flex flex-col gap-4">
      <p className="text-sm text-muted">Switch sections on or off, rename them, and change their order in the menus.</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map((m, i) => (
          <li key={m.key} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} aria-label="Move up" className="text-muted hover:text-ink"><ArrowUp className="h-4 w-4" /></button>
              <button onClick={() => move(i, 1)} aria-label="Move down" className="text-muted hover:text-ink"><ArrowDown className="h-4 w-4" /></button>
            </div>
            <input className="input max-w-xs flex-1" value={m.display_name} onChange={(e) => update(i, { display_name: e.target.value })} />
            <span className="text-xs text-muted">Shown to: {m.portals.join(', ')}</span>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={m.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
              {m.enabled ? 'On' : 'Off'}
            </label>
          </li>
        ))}
      </ul>
      <div><button className="btn-primary" onClick={save}>Save modules</button></div>
    </div>
  )
}
