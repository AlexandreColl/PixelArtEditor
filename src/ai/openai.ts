export const DEFAULT_MODEL = 'gpt-4o'

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

export async function editWithOpenAI(req: AIEditRequest): Promise<AIEditResponse> {
  const model = req.model || DEFAULT_MODEL

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a pixel art editor. The user sends you a pixel art image and an edit request. '
          + 'Return ONLY valid JSON with this structure: '
          + '{"pixels": [["#ff0000", "#00ff00", ...], [...]]} '
          + 'where pixels[y][x] is a hex color string for each pixel. '
          + 'Preserve the exact dimensions. Use the same color palette style. '
          + 'Respond with nothing except the JSON object.',
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
    response_format: { type: 'json_object' },
    temperature: 0.3,
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from OpenAI')

  const parsed = JSON.parse(text)
  if (!parsed.pixels || !Array.isArray(parsed.pixels)) {
    throw new Error('Invalid response format from OpenAI')
  }

  return {
    pixels: parsed.pixels as string[][],
    width: parsed.pixels[0]?.length ?? 0,
    height: parsed.pixels.length,
  }
}
