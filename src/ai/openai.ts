export const DEFAULT_MODEL = 'gpt-4o'

export interface AIEditRequest {
  apiKey: string
  model?: string
  imageBase64: string
  prompt: string
  baseUrl?: string
  useJsonMode?: boolean
}

export interface AIEditResponse {
  pixels: string[][]
  width: number
  height: number
}

export async function editWithOpenAI(req: AIEditRequest): Promise<AIEditResponse> {
  const model = req.model || DEFAULT_MODEL
  const baseUrl = req.baseUrl || 'https://api.openai.com/v1'
  const useJson = req.useJsonMode !== false

  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a pixel art editor. The user sends you a pixel art image and an edit request. ' +
          'Return ONLY valid JSON with this structure: ' +
          '{"pixels": [["#ff0000", "#00ff00", ...], [...]]} ' +
          'where pixels[y][x] is a hex color string for each pixel. ' +
          'Preserve the exact dimensions. Use the same color palette style. ' +
          'Respond with nothing except the JSON object.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: req.prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${req.imageBase64}` },
          },
        ],
      },
    ],
    temperature: 0.3,
  }
  if (useJson) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response')

  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed.pixels || !Array.isArray(parsed.pixels) || !parsed.pixels.length) {
    throw new Error('Invalid response format')
  }
  const pixels: string[][] = []
  for (let y = 0; y < parsed.pixels.length; y++) {
    const row = parsed.pixels[y]
    if (!Array.isArray(row)) throw new Error('Invalid row format')
    pixels.push(row.map((c: unknown) => String(c)))
  }

  return {
    pixels,
    width: pixels[0]?.length ?? 0,
    height: pixels.length,
  }
}
