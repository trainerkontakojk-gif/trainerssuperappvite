# AI Provider Gemini/OpenAI Only

**Status:** docs/config sync and Thermo remediation.

## Summary

- Backend AI runtime uses direct Gemini + direct OpenAI only for active dispatch.
- Newly added text IDs are documented separately; existing direct Gemini choices remain supported. Telefun's realtime registry remains separate. OpenRouter and DeepSeek are retained only as legacy selection aliases in docs/history.
- API service uses its own `OPENAI_API_KEY` for direct OpenAI text generation.
- Telefun keeps a separate OpenAI key/flag boundary for realtime.
- KETIK review uses Gemini-first, then OpenAI fallback.
- PDKT image generation stays Gemini-native only.

## Notes

Thermo remediation updated the API env contract, hardened the direct OpenAI wrapper, and strengthened KETIK/PDKT routing tests. No migrations were added.
