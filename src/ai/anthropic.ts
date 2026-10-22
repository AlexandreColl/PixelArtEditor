export const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

export interface AIEditRequest {
  apiKey: string
  model?: string
  imageBase64: string
  prompt: string
}

export interface AIEditResponse {
  pixels: string[][]
  width: number
  height: number
}

export async function editWithAnthropic(req: AIEditRequest): Promise<AIEditResponse> {
  const model = req.model || DEFAULT_MODEL

  const body = {
    model,
    max_tokens: 8192,
    system:
      'You are a pixel art editor. The user sends you a pixel art image and an edit request. ' +
      'Return ONLY valid JSON with this structure: ' +
      '{"pixels": [["#ff0000", "#00ff00", ...], [...]]} ' +
      'where pixels[y][x] is a hex color string for each pixel. ' +
      'Preserve the exact dimensions. Use the same color palette style. ' +
      'Respond with nothing except the JSON object. No markdown, no code fences.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: req.prompt },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: req.imageBase64 },
          },
        ],
      },
    ],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty response from Anthropic')

  const cleaned = text
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed.pixels || !Array.isArray(parsed.pixels) || !parsed.pixels.length) {
    throw new Error('Invalid response format from Anthropic')
  }
  const pixels: string[][] = []
  for (let y = 0; y < parsed.pixels.length; y++) {
    const row = parsed.pixels[y]
    if (!Array.isArray(row)) throw new Error('Invalid row format from Anthropic')
    pixels.push(row.map((c: unknown) => String(c)))
  }

  return {
    pixels,
    width: pixels[0]?.length ?? 0,
    height: pixels.length,
  }
}
