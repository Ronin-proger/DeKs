from openai import AsyncOpenAI

from intelligence_config import OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL

SYSTEM_PROMPT = (
    "Ты помощник продукта. Отвечай на языке пользователя; "
    "если язык неясен — на русском. Опирайся на контекст сообщения. "
    "Пиши кратко, обычным Markdown."
)

# Ollama exposes an OpenAI-compatible API under /v1 and ignores the key.
ai_client = AsyncOpenAI(base_url=f"{OLLAMA_BASE_URL.rstrip('/')}/v1", api_key="ollama")


async def send_message(message: str) -> str:
    completion = await ai_client.chat.completions.create(
        model=OLLAMA_CHAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        temperature=0.4,
        max_tokens=512,
        stream=False,
    )
    return completion.choices[0].message.content.strip()
