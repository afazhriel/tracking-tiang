'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../lib/project-context'
import { api } from '../../lib/api'
import { ErrorNotice } from '../../components/ui/states'
import { cn } from '../../lib/utils'

const SUGGESTIONS = [
  'Progres proyek ini gimana?',
  'Lokasi mana yang belum mulai dikerjakan?',
  'Jelaskan kurva S proyek ini.',
  'Apa yang harus saya kerjakan hari ini?',
]

/* Semua hook ada di dalam konten — di bawah ProjectProvider yang dipasang
   AppShell — supaya useProject() tidak terpanggil di luar provider. */
function AsistenAiContent() {
  const { project, projectId } = useProject()
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Halo, saya Asisten AI Tracking Pekerjaan. Tanya soal progres proyek, kurva S, atau cara memakai fitur — saya jawab dari data proyek yang sedang aktif.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || busy) return

    setInput('')
    setError(null)
    const next = [...messages, { role: 'user', content: message }]
    setMessages(next)
    setBusy(true)

    try {
      const history = next
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(1, -1)
        .slice(-10)
      const res = await api.aiChat({
        message,
        project_id: projectId ?? null,
        history,
      })
      const reply = res?.data?.reply ?? res?.reply
      if (!reply) throw new Error('AI tidak memberikan jawaban.')
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err?.message || 'AI belum bisa menjawab. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Asisten AI"
      />

      <div className="flex flex-col gap-3 rounded-card border border-neutral-200 bg-paper p-3.5 shadow-card sm:p-4">
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <Sparkles className="h-4 w-4 text-brand-600" />
          Konteks: {project?.name ?? 'tidak ada proyek aktif'}
        </p>

        <div className="flex min-h-[12rem] flex-col gap-3 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-6',
                m.role === 'user'
                  ? 'self-end bg-brand-600 text-white'
                  : 'self-start bg-neutral-100 text-neutral-800',
              )}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="self-start rounded-2xl bg-neutral-100 px-3.5 py-2.5 text-sm text-neutral-500">
              Mengetik…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <ErrorNotice error={error} compact title="AI belum bisa menjawab" />

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-full border border-neutral-200 bg-canvas px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-brand-300 hover:text-neutral-900 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanya soal proyek aktif…"
            aria-label="Tulis pertanyaan"
            className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-canvas px-3.5 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Kirim pertanyaan"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

export default function AsistenAiPage() {
  return (
    <AppShell title="Asisten AI">
      <AsistenAiContent />
    </AppShell>
  )
}
