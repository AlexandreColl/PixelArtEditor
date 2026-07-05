import { useState, useCallback } from 'react'
import { editWithOpenAI } from '../ai/openai'
import { editWithAnthropic } from '../ai/anthropic'
import { editWithGemini } from '../ai/gemini'

type AIProvider = 'openai' | 'anthropic' | 'groq' | 'gemini'

interface AIChatProps {
  isOpen: boolean
  onToggle: () => void
  extractCanvasAsBase64: () => string
  applyPixels: (pixels: string[][]) => void
}

const providerLabels: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  groq: 'Groq',
  gemini: 'Gemini',
}

const modelOptions: Record<AIProvider, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  groq: [
    { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout (gratis)' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
}

export default function AIChat({ isOpen, onToggle, extractCanvasAsBase64, applyPixels }: AIChatProps) {
  const [provider, setProvider] = useState<AIProvider>(
    () => (localStorage.getItem('ai_provider') as AIProvider) || 'openai',
  )
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(`ai_key_${provider}`) || '')
  const [model, setModel] = useState(() => localStorage.getItem(`ai_model_${provider}`) || modelOptions[provider][0].value)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleProviderChange = useCallback((p: AIProvider) => {
    setProvider(p)
    localStorage.setItem('ai_provider', p)
    setApiKey(localStorage.getItem(`ai_key_${p}`) || '')
    const savedModel = localStorage.getItem(`ai_model_${p}`)
    setModel(savedModel || modelOptions[p][0].value)
  }, [])

  const handleModelChange = useCallback(
    (m: string) => {
      setModel(m)
      localStorage.setItem(`ai_model_${provider}`, m)
    },
    [provider],
  )

  const handleKeyChange = useCallback(
    (key: string) => {
      setApiKey(key)
      localStorage.setItem(`ai_key_${provider}`, key)
    },
    [provider],
  )

  const handleSend = useCallback(async () => {
    if (!apiKey.trim()) {
      setError(`Enter your ${providerLabels[provider]} API key first`)
      return
    }
    if (!prompt.trim()) {
      setError('Describe what you want to edit')
      return
    }

    setLoading(true)
    setError('')

    try {
      const base64 = extractCanvasAsBase64()
      if (!base64) {
        setError('Could not extract canvas')
        setLoading(false)
        return
      }

      const groqSystemPrefix =
        'You are a pixel art editor. The user sends you a pixel art image and an edit request. ' +
        'Return ONLY valid JSON with this structure: ' +
        '{"pixels": [["#ff0000", "#00ff00", ...], [...]]} ' +
        'where pixels[y][x] is a hex color string for each pixel. ' +
        'Preserve the exact dimensions. Use the same color palette style. ' +
        'Respond with nothing except the JSON object.\n\n'

      const params = {
        apiKey: apiKey.trim(),
        imageBase64: base64,
        prompt: prompt.trim(),
        model: model || undefined,
      }

      let result
      if (provider === 'openai') {
        result = await editWithOpenAI(params)
      } else if (provider === 'groq') {
        result = await editWithOpenAI({
          ...params,
          baseUrl: 'https://api.groq.com/openai/v1',
          useJsonMode: false,
          systemPrompt: '',
          prompt: groqSystemPrefix + params.prompt,
        })
      } else if (provider === 'gemini') {
        result = await editWithGemini(params)
      } else {
        result = await editWithAnthropic(params)
      }

      applyPixels(result.pixels)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [apiKey, prompt, provider, model, extractCanvasAsBase64, applyPixels])

  if (!isOpen) return null

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid #555',
    background: '#1e1e1e',
    color: '#e0e0e0',
    fontSize: 13,
  }

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
        <button
          onClick={onToggle}
          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <label style={{ fontSize: 11, color: '#888' }}>Provider</label>
        <select value={provider} onChange={e => handleProviderChange(e.target.value as AIProvider)} style={selectStyle}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="groq">Groq (gratis)</option>
          <option value="gemini">Gemini (gratis)</option>
        </select>

        <label style={{ fontSize: 11, color: '#888' }}>Model</label>
        <select value={model} onChange={e => handleModelChange(e.target.value)} style={selectStyle}>
          {modelOptions[provider].map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 11, color: '#888' }}>{providerLabels[provider]} API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => handleKeyChange(e.target.value)}
          placeholder={
            provider === 'openai'
              ? 'sk-...'
              : provider === 'anthropic'
                ? 'sk-ant-...'
                : provider === 'groq'
                  ? 'gsk_...'
                  : 'AIza...'
          }
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

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe what you want to do with the image..."
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
          disabled={loading}
          style={{
            padding: '10px',
            borderRadius: 6,
            border: 'none',
            background: loading ? '#555' : '#4fc3f7',
            color: loading ? '#888' : '#fff',
            cursor: loading ? 'default' : 'pointer',
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
