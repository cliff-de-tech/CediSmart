// These cover the server's bounded provider attempts plus upload/network overhead.
export const VOICE_RECOGNITION_TIMEOUT_MS = 35000;
export const VOICE_SYNTHESIS_TIMEOUT_MS = 30000;

export class SpeechDetector {
  private lastTime = 0;
  private lastSpeechAt = 0;
  private noiseFloor: number | null = null;
  private lastMeterAt = 0;
  private detected = false;
  private peak = -160;
  private history: { time: number; level: number; duration: number }[] = [];

  update(time: number, metering?: number) {
    const elapsed = Math.max(0, Math.min(200, time - this.lastTime));
    this.lastTime = time;
    const hasMeter = typeof metering === 'number' && Number.isFinite(metering);
    let level = 0;
    let shouldSend = false;
    if (hasMeter && elapsed > 0) {
      this.lastMeterAt = time;
      this.peak = Math.max(this.peak, metering);
      this.history.push({ time, level: metering, duration: elapsed });
      this.history = this.history.filter((sample) => time - sample.time <= 2000);
      if (time >= 300 && this.history.length >= 3) {
        const levels = this.history.map((sample) => sample.level).sort((a, b) => a - b);
        const floor = Math.max(-100, levels[Math.floor((levels.length - 1) * 0.2)]);
        // Learn the room level before speech; never raise it to match the user's voice.
        this.noiseFloor = this.detected && this.noiseFloor !== null
          ? Math.min(this.noiseFloor, floor) : floor;
        const onset = Math.max(-68, this.noiseFloor + 8);
        if (!this.detected) {
          // Keep the opening syllables: speech may begin before room calibration finishes.
          let voicedMs = 0;
          let previousTime = 0;
          for (const sample of this.history) {
            if (sample.time - previousTime > 250) voicedMs = 0;
            voicedMs = sample.level > onset ? voicedMs + sample.duration : 0;
            if (voicedMs >= 150) {
              this.detected = true;
              this.lastSpeechAt = sample.time;
            }
            previousTime = sample.time;
          }
        }
        if (this.detected) {
          if (metering > onset - 4) this.lastSpeechAt = time;
          else shouldSend = time - this.lastSpeechAt >= 1000;
        }
      }
      level = Math.max(0, Math.min(1, (metering - (this.noiseFloor ?? -70)) / 35));
    } else if (!hasMeter && this.detected) {
      // Missing readings are not evidence of a pause.
      this.lastSpeechAt = time;
    }
    return {
      level,
      hasSpeech: this.detected,
      // Bound a very long utterance even when it started before calibration.
      shouldSend: shouldSend || (this.peak > -68 && time >= 45000),
      timedOut: !this.detected && time >= 30000,
      meteringUnavailable: time - this.lastMeterAt >= 1500,
    };
  }
}

export function recognitionError(data: { error_code?: string; transcript?: string }): string | null {
  // Understand old deployments too, until the server update has been deployed.
  if (data.error_code || data.transcript?.trim() === 'Voice note received') {
    return 'Speech recognition is unavailable right now. Retry your recording, or type your message.';
  }
  return null;
}
