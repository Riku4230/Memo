/**
 * マイクの音を録って、16kHz・モノラルの WAV にする（Gemini がそのまま読める形）。
 * MediaRecorder の形式はブラウザごとに違う（Chrome は webm、iPhone は mp4）ので使わず、
 * 音の波形を直接受け取って自分で WAV にする。受け取った波形から、その時点の声の大きさも出す
 */

/** 録音の長さの上限（サーバーの受け付け上限と合わせる） */
export const MAX_RECORD_SECONDS = 60;
const TARGET_RATE = 16_000;

export interface Recording {
  /** 録音を止めて WAV を返す */
  stop(): Promise<Blob>;
  /** 録音をやめて捨てる */
  cancel(): void;
}

/** このブラウザで録音できるか */
export function canRecord(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && 'AudioContext' in window;
}

/**
 * 録音を始める。onLevel には声の大きさ（0〜1）を、およそ 1/20 秒ごとに渡す。
 * iPhone では、ボタンを押した処理の中から呼ぶ（音の再生・録音はタップの中でしか始められない）
 */
export async function startRecording(onLevel: (level: number) => void): Promise<Recording> {
  // iPhone では、タップの処理の中で（await より前に）作らないと音の処理が止まったままになる
  const ctx = new AudioContext();
  const resumed = ctx.resume();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    await resumed;
  } catch (e) {
    void ctx.close();
    throw e;
  }
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessorNode は古い仕組みだが、iPhone の Safari を含めて確実に動く。別ファイルが要る AudioWorklet より手軽
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let length = 0;
  const maxLength = MAX_RECORD_SECONDS * ctx.sampleRate;
  processor.onaudioprocess = (e) => {
    if (length >= maxLength) return;
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    length += data.length;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i]! * data[i]!;
    // 話し声の大きさがだいたい 0〜1 に収まるよう、音の強さ（RMS）を広げる
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
  };
  source.connect(processor);
  // 出力につながないと動かないブラウザがあるので、音を出さない形でつなぐ
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(ctx.destination);

  const release = () => {
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    mute.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  return {
    async stop() {
      const rate = ctx.sampleRate;
      release();
      const all = new Float32Array(length);
      let offset = 0;
      for (const c of chunks) {
        all.set(c.subarray(0, Math.min(c.length, length - offset)), offset);
        offset += c.length;
        if (offset >= length) break;
      }
      return encodeWav(downsample(all, rate, TARGET_RATE), TARGET_RATE);
    },
    cancel: release,
  };
}

/** 平均をとって標本化の速さを下げる（話し声には 16kHz で十分） */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from <= to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

/** 16bit PCM の WAV にする */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // モノラル
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
