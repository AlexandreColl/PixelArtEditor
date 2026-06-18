import type { AIEditResponse } from './openai'

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

export interface GeminiEditRequest {
  apiKey: string
  model?: string
  imageBase64: string
  prompt: string
}

export async function editWithGemini(req: GeminiEditRequest): Promise<AIEditResponse> {
  const model = req.model || DEFAULT_GEMINI_MODEL

  const body = {
    system_instruction: {
      parts: [
        {
          text:
            'You are a pixel art editor. The user sends you a pixel art image and an edit request. ' +
            'Return ONLY valid JSON with this structure: ' +
            '{"pixels": [["#ff0000", "#00ff00", ...], [...]]} ' +
            'where pixels[y][x] is a hex color string for each pixel. ' +
            'Preserve the exact dimensions. Use the same color palette style. ' +
            'Respond with nothing except the JSON object.',
        },
      ],
    },
    contents: [
      {
        parts: [
          { text: req.prompt },
          {
            inline_data: {
              mime_type: 'image/png',
              data: req.imageBase64,
            },
          },
        ],
      },
    ],
    generation_config: {
      temperature: 0.3,
    },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${req.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')

  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed.pixels || !Array.isArray(parsed.pixels) || !parsed.pixels.length) {
    throw new Error('Invalid response format from Gemini')
  }
  const pixels: string[][] = []
  for (let y = 0; y < parsed.pixels.length; y++) {
    const row = parsed.pixels[y]
    if (!Array.isArray(row)) throw new Error('Invalid row format from Gemini')
    pixels.push(row.map((c: unknown) => String(c)))
  }

  return {
    pixels,
    width: pixels[0]?.length ?? 0,
    height: pixels.length,
  }
}
