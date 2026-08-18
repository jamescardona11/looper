# Looper

Looper convierte audio en texto útil. El producto combina dictado rápido,
transcripción de archivos y reuniones, memoria textual opcional y un Recording
Assistant privado para consultar lo que el usuario grabó.

## Principio de producto

El audio es la entrada; el texto y las acciones son el resultado. Una función
pertenece a Looper cuando mejora al menos una de estas etapas:

1. capturar o importar audio;
2. transcribirlo con resiliencia;
3. corregir, formatear, buscar o traducir el texto;
4. consultar grabaciones y dictados privados;
5. exportar o enviar el resultado con confirmación.

Looper no es un chat general, una app de cámara, una red de conversaciones
públicas ni un estudio de generación de voz. El readback TTS se conserva sólo
como accesibilidad para transcripciones.

## Superficies

| Plataforma | Responsabilidad |
| --- | --- |
| Desktop macOS/Windows | Dictado global, transcripción local/cloud, reuniones botless, Library, importaciones, captions, readback, Memory y MCP local. |
| Mobile React Native | Teclado y dictado local, notas, reuniones, importación y Recording Assistant. |
| Web React | Transcripción cloud, dictado, Recording Assistant, actividad de audio, cuenta y billing. |
| Convex | Auth, sincronización opt-in de texto, STT cloud, asistente privado, cuotas y billing. |

## Capacidades principales

- STT batch y streaming con parciales ordenados, keepalive y fallback.
- Dictado con Dictionary, replacements, snippets, styles y Smart Modes.
- Importación de audio, watch folders, YouTube público y denoise opcional.
- Reuniones sin bot con micrófono + audio del sistema, WAV durable, recovery,
  notas, resumen y Markdown.
- History y Library con búsqueda, traducción, captions y readback accesible.
- Memory opt-in que sincroniza sólo texto; el audio local no se sube.
- Recording Assistant privado, limitado a preguntas sobre grabaciones, reuniones
  y dictados. Las notas de voz se transcriben antes de llegar al asistente.
- MCP local read-only y extensiones declarativas firmadas.
- Métricas de audio cloud: transcripciones, duración conocida, bytes procesados,
  audio retenido y proveedor. El procesamiento local no se presenta como uso cloud.

## Desarrollo

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Comandos de verificación:

```bash
pnpm typecheck
pnpm test
pnpm run qa:external-readiness
```

Mobile:

```bash
pnpm --filter @looper/mobile typecheck
pnpm --filter @looper/mobile test
```

Desktop:

```bash
pnpm --filter looper-desktop test
pnpm run qa:desktop-native
pnpm run qa:meeting-audio
```

## Configuración

Los contratos públicos están en `apps/web/.env.example`,
`apps/mobile/.env.example` y `backend/.env.example`. Las credenciales
STT y LLM sólo pertenecen al backend.
Los archivos `.env` privados y la evidencia de release no se versionan.

Variables centrales:

- `VITE_CONVEX_URL`, `CONVEX_DEPLOYMENT`;
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `AI_MODEL`;
- `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`;
- `RESEND_API_KEY`, `AUTH_FROM_EMAIL` para OTP transaccional;
- variables Stripe/RevenueCat para suscripciones; sólo las keys públicas de
  las apps RevenueCat pertenecen al build móvil.

No existen contratos activos para Tavily, notificaciones de producto, Talk,
clonación de voz o TTS general.

## Arquitectura y decisiones

- [Lenguaje y limites del producto](docs/CONTEXT.md)
- [Preparacion de release y trabajo pendiente](docs/NEXT_STEPS.md)
- [Aplicacion iOS y Android](apps/mobile/README.md)

## Modelo local para reuniones

Looper ofrece un único modelo local para resúmenes y preguntas:
**Qwen 3.5 4B Q3_K_M**. Se descarga bajo demanda, ocupa 2,29 GB y no forma parte
del instalador.

La selección se basó en un benchmark reproducible ejecutado el 23 de julio de
2026 con el runtime de Looper (`llama-cpp-2 0.1.151`, Metal, contexto de 16K y
batch 512). El corpus contiene 19 escenarios de resúmenes y preguntas en inglés,
español y portugués, incluyendo correcciones, falta de evidencia, ruido e
inyecciones dentro del transcript.

| Modelo probado | GGUF | Calidad | Casos perfectos | Tiempo/caso | RSS pico |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Qwen 3.5 4B Q3_K_M** | 2,29 GB | **96/100** | 13/19 | 4,62 s | **3,02 GB** |
| Qwen 3.5 4B Q4_K_M | 2,74 GB | 95/100 | 12/19 | 7,18 s | 3,47 GB |
| Gemma 4 E2B QAT Q4_0 | 3,35 GB | 90/100 | 13/19 | 1,50 s | 3,85 GB |
| Phi-4 Mini Q4_K_M | 2,49 GB | 87/100 | 9/19 | 3,77 s | 4,73 GB |
| Gemma 4 E2B Q4_K_M | 3,11 GB | 86/100 | 8/19 | 1,72 s | 3,55 GB |
| Qwen 3.5 2B Q4_K_M | 1,28 GB | 84/100 | 7/19 | 4,47 s | 1,61 GB |
| Granite 4.1 3B Q4_K_M | 2,10 GB | 84/100 | 10/19 | 2,97 s | 3,54 GB |
| Llama 3.2 3B Q4_K_M | 2,02 GB | 72/100 | 3/19 | 2,62 s | 4,00 GB |

El RSS se midió en macOS Apple Silicon. Windows/Vulkan requiere su propia
medición antes del release. Esta tabla se conserva como registro de los modelos
y variantes evaluados para esta decisión.
