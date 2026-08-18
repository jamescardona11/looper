// Mic → PCM16 mono chunks at a target sample rate, for streaming STT WebSockets.
//
// Uses a ScriptProcessorNode: deprecated but universally supported and the
// simplest way to pull raw Float32 frames. The frames are linearly downsampled
// to the provider's rate (16 kHz for Deepgram/AssemblyAI/ElevenLabs, 24 kHz for
// OpenAI) and converted to little-endian 16-bit PCM. The processor is wired
// through a zero-gain node so the mic is never played back to the user.

import { acquireMicStream } from "@/shared/mic";

export interface PcmCapture {
  stop: () => void;
}

export async function startPcmCapture(
  targetRate: number,
  onChunk: (pcm16: Int16Array) => void,
): Promise<PcmCapture> {
  const stream = await acquireMicStream({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const down = downsample(input, ctx.sampleRate, targetRate);
    if (down.length > 0) onChunk(floatTo16(down));
  };

  // processor must be in the graph for onaudioprocess to fire; route through a
  // muted gain node so nothing is audible.
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  return {
    stop: () => {
      processor.onaudioprocess = null;
      processor.disconnect();
      mute.disconnect();
      source.disconnect();
      void ctx.close();
      for (const track of stream.getTracks()) track.stop();
    },
  };
}

// Nearest-neighbour downsample — crude but adequate for speech recognition and
// cheap enough to run in the audio callback.
function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = input[Math.floor(i * ratio)] ?? 0;
  return out;
}

function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// Int16 PCM → base64 (for providers that wrap audio in JSON: ElevenLabs, OpenAI).
export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}
