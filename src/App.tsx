import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './index.css'

interface SRSData {
  interval_days: number
  ease_factor: number
  due_date: string
  review_count: number
  lapse_count: number
  state: 'New' | 'Learning' | 'Review' | 'Relearning'
}

interface Word {
  id: string
  word: string
  meaning: string
  example: string
  created_at: string
  updated_at: string
  srs: SRSData
}

interface AppData {
  version: number
  words: Word[]
  settings: {
    theme: string
  }
}

type View = 'review' | 'vocabulary' | 'settings'

const srsStateLabel = (s: string) => {
  if (s === 'New') return 'New'
  if (s === 'Learning') return 'Learning'
  if (s === 'Relearning') return 'Relearning'
  return 'Review'
}

export default function App() {
  const [view, setView] = useState<View>('review')
  const [data, setData] = useState<AppData | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark')
    } else {
      root.removeAttribute('data-theme')
    }
  }, [theme])

  const loadData = async () => {
    try {
      const appData = await invoke<AppData>('get_data')
      setData(appData)
      if (appData.settings.theme === 'dark') {
        setTheme('dark')
      } else if (appData.settings.theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setTheme(prefersDark ? 'dark' : 'light')
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const handleSaveSettings = async (newTheme: string) => {
    try {
      const updated = await invoke<AppData>('save_settings', { theme: newTheme })
      setData(updated)
      if (newTheme === 'dark') {
        setTheme('dark')
      } else if (newTheme === 'light') {
        setTheme('light')
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setTheme(prefersDark ? 'dark' : 'light')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  const navItems: { key: View; label: string }[] = [
    { key: 'review', label: 'Review' },
    { key: 'vocabulary', label: 'Vocabulary' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Sidebar */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col border-r"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="px-5 pt-6 pb-4">
          <h1
            className="text-sm font-semibold tracking-wide uppercase"
            style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}
          >
            English Trainer
          </h1>
        </div>

        <nav className="flex-1 px-3">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all mb-0.5"
              style={{
                background: view === item.key ? 'var(--accent-soft)' : 'transparent',
                color: view === item.key ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {data?.words.length || 0} words
          </span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {view === 'review' && <ReviewView onRefresh={loadData} />}
        {view === 'vocabulary' && <VocabularyView data={data} onRefresh={loadData} />}
        {view === 'settings' && <SettingsView theme={theme} onSaveTheme={handleSaveSettings} />}
      </main>
    </div>
  )
}

// ─── Review ──────────────────────────────────────────────────────────────

type ReviewState = 'idle' | 'showing' | 'revealed'

function ReviewView({ onRefresh }: { onRefresh: () => void }) {
  const [dueWords, setDueWords] = useState<Word[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [state, setState] = useState<ReviewState>('idle')
  const [currentWord, setCurrentWord] = useState<Word | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [isPlayingRecording, setIsPlayingRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordedUrlRef = useRef<string | null>(null)

  useEffect(() => {
    loadDueWords()
    return () => {
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    }
  }, [])

  const loadDueWords = async () => {
    try {
      const words = await invoke<Word[]>('get_due_words')
      setDueWords(words)
      if (words.length > 0) {
        setCurrentWord(words[0])
        setCurrentIndex(0)
        setState('showing')
      } else {
        setState('idle')
      }
    } catch (error) {
      console.error('Failed to load due words:', error)
    }
  }

  const handleReveal = () => setState('revealed')

  const handleRemember = async () => {
    if (!currentWord) return
    cleanupRecording()
    try {
      await invoke('review_word', { wordId: currentWord.id, remembered: true })
      advanceToNext()
    } catch (error) {
      console.error('Failed to review word:', error)
    }
  }

  const handleForget = async () => {
    if (!currentWord) return
    cleanupRecording()
    try {
      await invoke('review_word', { wordId: currentWord.id, remembered: false })
      advanceToNext()
    } catch (error) {
      console.error('Failed to review word:', error)
    }
  }

  const advanceToNext = () => {
    const next = currentIndex + 1
    if (next < dueWords.length) {
      setCurrentIndex(next)
      setCurrentWord(dueWords[next])
      setState('showing')
    } else {
      setCurrentWord(null)
      setState('idle')
      onRefresh()
    }
  }

  const cleanupRecording = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl)
      recordedUrlRef.current = null
      setRecordedUrl(null)
    }
  }

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = 0.9
      window.speechSynthesis.speak(u)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        recordedUrlRef.current = url
        setRecordedUrl(url)
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      setIsRecording(true)
      cleanupRecording()
    } catch {
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const playRecording = () => {
    if (recordedUrl) {
      const audio = new Audio(recordedUrl)
      audioRef.current = audio
      setIsPlayingRecording(true)
      audio.onended = () => setIsPlayingRecording(false)
      audio.play().catch(() => setIsPlayingRecording(false))
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (state === 'showing' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault()
        handleReveal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state])

  // Empty state
  if (state === 'idle' || !currentWord) {
    return (
      <div className="h-full flex items-center justify-center animate-fadeIn">
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text)' }}>
            All caught up
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            No words to review right now. Add new words or come back later.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-center px-8 py-12">
      {/* Progress indicator */}
      <div className="mb-10">
        <div className="flex items-center gap-3">
          {dueWords.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                background: i < currentIndex ? 'var(--success)' : i === currentIndex ? 'var(--accent)' : 'var(--border)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Review Card */}
      <div
        className="w-full max-w-lg animate-fadeIn"
        key={currentWord.id}
      >
        {state === 'showing' && (
          <div className="text-center">
            <h1
              className="text-6xl font-semibold mb-8 tracking-tight"
              style={{ color: 'var(--text)' }}
            >
              {currentWord.word}
            </h1>

            <button
              onClick={() => speak(currentWord.word)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all mb-10"
              style={{
                color: 'var(--accent)',
                background: 'var(--accent-soft)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              Listen
            </button>

            <div>
              <button
                onClick={handleReveal}
                className="px-8 py-3 rounded-xl text-base font-medium text-white transition-all"
                style={{ background: 'var(--accent)' }}
              >
                Reveal Answer
              </button>
            </div>
            <p className="mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Press Space
            </p>
          </div>
        )}

        {state === 'revealed' && (
          <div className="animate-slideUp">
            {/* Word + Listen */}
            <div className="text-center mb-8">
              <h1
                className="text-4xl font-semibold mb-3 tracking-tight"
                style={{ color: 'var(--text)' }}
              >
                {currentWord.word}
              </h1>
              <button
                onClick={() => speak(currentWord.word)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={{
                  color: 'var(--accent)',
                  background: 'var(--accent-soft)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                Listen
              </button>
            </div>

            {/* Meaning + Example */}
            <div className="text-center mb-10">
              <p className="text-lg mb-3" style={{ color: 'var(--text)' }}>
                {currentWord.meaning}
              </p>
              {currentWord.example && (
                <p
                  className="text-sm italic leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  &ldquo;{currentWord.example}&rdquo;
                </p>
              )}
            </div>

            {/* Practice recording */}
            <div className="text-center mb-10">
              <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                Practice
              </p>
              <div className="flex items-center justify-center gap-3">
                {!isRecording && !recordedUrl && (
                  <button
                    onClick={startRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                    Record
                  </button>
                )}
                {isRecording && (
                  <button
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all"
                    style={{ background: 'var(--surface-hover)', color: 'var(--text)' }}
                  >
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--recording)' }} />
                    Recording...
                  </button>
                )}
                {recordedUrl && (
                  <button
                    onClick={playRecording}
                    disabled={isPlayingRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all"
                    style={{
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      opacity: isPlayingRecording ? 0.5 : 1,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    {isPlayingRecording ? 'Playing...' : 'Play Recording'}
                  </button>
                )}
              </div>
            </div>

            {/* Remember / Forget */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleRemember}
                className="px-8 py-3 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: 'var(--success)' }}
              >
                I Remember
              </button>
              <button
                onClick={handleForget}
                className="px-8 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'var(--surface-hover)', color: 'var(--text-secondary)' }}
              >
                I Forgot
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Vocabulary ──────────────────────────────────────────────────────────

function VocabularyView({ data, onRefresh }: { data: AppData | null; onRefresh: () => void }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingWord, setEditingWord] = useState<Word | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Word | null>(null)

  const wordList = data?.words || []

  const handleAdd = async (word: string, meaning: string, example: string) => {
    try {
      await invoke('add_word', { request: { word, meaning, example } })
      setShowAddForm(false)
      onRefresh()
    } catch (error) {
      console.error('Failed to add word:', error)
      alert('Failed to add word: ' + error)
    }
  }

  const handleUpdate = async (word: string, meaning: string, example: string) => {
    if (!editingWord) return
    try {
      await invoke('update_word', { request: { id: editingWord.id, word, meaning, example } })
      setEditingWord(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to update word:', error)
      alert('Failed to update word: ' + error)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await invoke('delete_word', { id: deleteConfirm.id })
      setDeleteConfirm(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to delete word:', error)
      alert('Failed to delete word: ' + error)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10 animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
          Vocabulary
        </h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
          style={{ background: 'var(--accent)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Word
        </button>
      </div>

      {/* Word list */}
      {wordList.length === 0 ? (
        <div className="text-center py-20">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No words yet. Add your first word to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {wordList.map((word) => (
            <div
              key={word.id}
              className="group px-5 py-4 rounded-xl border transition-all hover:shadow-sm"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                      {word.word}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: word.srs.state === 'New' ? 'var(--accent-soft)' : word.srs.state === 'Review' ? 'var(--success-soft)' : 'var(--surface-hover)',
                        color: word.srs.state === 'New' ? 'var(--accent)' : word.srs.state === 'Review' ? 'var(--success)' : 'var(--text-secondary)',
                      }}
                    >
                      {srsStateLabel(word.srs.state)}
                    </span>
                  </div>
                  <p className="text-sm mb-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {word.meaning}
                  </p>
                  {word.example && (
                    <p className="text-xs italic truncate" style={{ color: 'var(--text-tertiary)' }}>
                      &ldquo;{word.example}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingWord(word)}
                    className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(word)}
                    className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{ color: 'var(--danger)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-soft)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <WordForm title="Add Word" onSubmit={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}
      {editingWord && (
        <WordForm
          title="Edit Word"
          initialWord={editingWord.word}
          initialMeaning={editingWord.meaning}
          initialExample={editingWord.example}
          onSubmit={handleUpdate}
          onCancel={() => setEditingWord(null)}
        />
      )}
      {deleteConfirm && (
        <DeleteConfirm word={deleteConfirm.word} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} />
      )}
    </div>
  )
}

// ─── Forms ───────────────────────────────────────────────────────────────

function WordForm({
  title,
  initialWord = '',
  initialMeaning = '',
  initialExample = '',
  onSubmit,
  onCancel,
}: {
  title: string
  initialWord?: string
  initialMeaning?: string
  initialExample?: string
  onSubmit: (word: string, meaning: string, example: string) => void
  onCancel: () => void
}) {
  const [word, setWord] = useState(initialWord)
  const [meaning, setMeaning] = useState(initialMeaning)
  const [example, setExample] = useState(initialExample)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (word.trim() && meaning.trim()) {
      onSubmit(word.trim(), meaning.trim(), example.trim())
    }
  }

  const inputStyle = {
    background: 'var(--bg)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full max-w-md p-6 rounded-2xl shadow-2xl animate-scaleIn"
        style={{ background: 'var(--surface)' }}
      >
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text)' }}>
          {title}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Word
            </label>
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Meaning
            </label>
            <textarea
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none"
              style={inputStyle}
              rows={2}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Example Sentence
            </label>
            <input
              type="text"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm"
              style={inputStyle}
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteConfirm({
  word,
  onConfirm,
  onCancel,
}: {
  word: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full max-w-sm p-6 rounded-2xl shadow-2xl animate-scaleIn"
        style={{ background: 'var(--surface)' }}
      >
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
          Delete Word
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{word}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--danger)' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Settings ────────────────────────────────────────────────────────────

function SettingsView({
  theme,
  onSaveTheme,
}: {
  theme: 'light' | 'dark'
  onSaveTheme: (theme: string) => void
}) {
  return (
    <div className="max-w-lg mx-auto px-8 py-10 animate-fadeIn">
      <h2 className="text-2xl font-semibold mb-8" style={{ color: 'var(--text)' }}>
        Settings
      </h2>

      <div
        className="p-6 rounded-xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
          Appearance
        </h3>
        <div className="space-y-3">
          {(['light', 'dark', 'system'] as const).map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 cursor-pointer p-2 -mx-2 rounded-lg transition-colors"
              style={{ color: 'var(--text)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <input
                type="radio"
                name="theme"
                value={option}
                checked={
                  theme === option ||
                  (option === 'system' && theme !== 'light' && theme !== 'dark')
                }
                onChange={() => onSaveTheme(option)}
                className="w-4 h-4"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-sm capitalize">{option}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
