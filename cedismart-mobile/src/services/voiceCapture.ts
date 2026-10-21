import { SpeechDetector } from './voiceSession';

type MicrophoneBuffer = { data: ArrayBuffer; sampleRate: number; channels: number };

/** Captures actual microphone PCM, preserving speech before the detector recognises its onset. */
export class VoiceCapture {
  private detector = new SpeechDetector();
  private chunks: Float32Array[] = [];
  private samples = 0;
  private sampleRate = 0;

  append(buffer: MicrophoneBuffer) {
    if (!Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 ||
        !Number.isInteger(buffer.channels) || buffer.channels < 1 || buffer.data.byteLength % 4 !== 0) {
      throw new Error('Invalid microphone format');
    }
    if (this.sampleRate && this.sampleRate !== buffer.sampleRate) {
      throw new Error('Microphone format changed during speech');
    }
    this.sampleRate = buffer.sampleRate;
    const input = new Float32Array(buffer.data);
    const mono = new Float32Array(Math.floor(input.length / buffer.channels));
    let energy = 0;
    for (let frame = 0; frame < mono.length; frame++) {
      let value = 0;
      for (let channel = 0; channel < buffer.channels; channel++) {
        value += input[frame * buffer.channels + channel];
      }
      value = Math.max(-1, Math.min(1, value / buffer.channels));
      if (!Number.isFinite(value)) throw new Error('Invalid microphone samples');
      mono[frame] = value;
      energy += value * value;
    }
    this.chunks.push(mono);
    this.samples += mono.length;
    const durationMillis = this.samples / this.sampleRate * 1000;
    const rms = mono.length ? Math.sqrt(energy / mono.length) : 0;
    const detection = this.detector.update(durationMillis, rms > 0 ? 20 * Math.log10(rms) : -160);
    return { ...detection, durationMillis };
  }

  /** Uses the device's actual rate, never a hard-coded codec label or rate. */
  toWavBase64(): string {
    if (!this.samples || !this.sampleRate) throw new Error('No microphone audio received');
    const bytes = new Uint8Array(44 + this.samples * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
    };
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, this.sampleRate, true);
    view.setUint32(28, this.sampleRate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, this.samples * 2, true);
    let offset = 44;
    for (const chunk of this.chunks) {
      for (const sample of chunk) {
        view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
        offset += 2;
      }
    }
    // Avoid spreading an entire recording onto the JS call stack.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const encoded: string[] = [];
    for (let i = 0; i < bytes.length; i += 3) {
      const value = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
      encoded.push(alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63] +
        (i + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '=') +
        (i + 2 < bytes.length ? alphabet[value & 63] : '='));
    }
    return encoded.join('');
  }
}
