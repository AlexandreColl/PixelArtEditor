import { useState, useCallback } from 'react'
import type { Selection } from '../types'
import { editWithOpenAI } from '../ai/openai'

interface AIChatProps {
  isOpen: boolean
  onToggle: () => void
  selection: Selection | null
  extractRegionAsBase64: () => string | null
  applyRegionPixels: (x: number, y: number, pixels: string[][]) => void
}

export default function AIChat({ isOpen, onToggle, selection, extractRegionAsBase64, applyRegionPixels }: AIChatProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_api_key') || '')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleKeyChange = useCallback((key: string) => {
    setApiKey(key)
    localStorage.setItem('openai_api_key', key)
  }, [])

  const handleSend = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Enter your OpenAI API key first')
      return
    }
    if (!selection) {
      setError('Select a region first (use the Selection tool)')
      return
    }
    if (!prompt.trim()) {
      setError('Describe what you want to edit')
      return
    }

    setLoading(true)
    setError('')

    try {
      const base64 = extractRegionAsBase64()
      if (!base64) {
        setError('Could not extract selection')
        setLoading(false)
        return
      }

      const result = await editWithOpenAI({
        apiKey: apiKey.trim(),
        imageBase64: base64,
        prompt: prompt.trim(),
      })

      applyRegionPixels(selection.x, selection.y, result.pixels)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [apiKey, selection, prompt, extractRegionAsBase64, applyRegionPixels])

  if (!isOpen) return null

  return (
    <div
      style={{
        width: 320,
        background: '#2d2d2d',
        borderLeft: '1px solid #444',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #444',
          color: '#e0e0e0',
          fontWeight: 600,
          fontSize: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        AI Agent
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>
          ✕
        </button>
      </div>

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <label style={{ fontSize: 11, color: '#888' }}>OpenAI API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => handleKeyChange(e.target.value)}
          placeholder="sk-..."
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: 6,
            border: '1px solid #555',
            background: '#1e1e1e',
            color: '#e0e0e0',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />

        <label style={{ fontSize: 11, color: '#888' }}>
          Selection {selection ? `(${selection.width}x${selection.height})` : '(none)'}
        </label>

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={selection ? 'Describe the edit...' : 'Select a region first, then describe the edit...'}
          rows={4}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: 6,
            border: '1px solid #555',
            background: '#1e1e1e',
            color: '#e0e0e0',
            fontSize: 13,
            resize: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />

        {error && (
          <div style={{ color: '#ef5350', fontSize: 12, padding: '6px 8px', background: '#3a1a1a', borderRadius: 4 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={loading || !selection}
          style={{
            padding: '10px',
            borderRadius: 6,
            border: 'none',
            background: loading ? '#555' : '#4fc3f7',
            color: loading ? '#888' : '#fff',
            cursor: loading || !selection ? 'default' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {loading ? 'Editing...' : 'Apply Edit'}
        </button>
      </div>
    </div>
  )
}
