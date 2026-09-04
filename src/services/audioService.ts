// Web Audio API generator for calling dial tones ("гудки"), ringtones, and notification sounds

class SoundService {
  private ctx: AudioContext | null = null;
  private dialToneInterval: number | null = null;
  private ringtoneInterval: number | null = null;
  private activeOscillators: OscillatorNode[] = [];

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Plays an outgoing call ringback tone ("гудки": 425 Hz tone for 1.2s, pause 2.5s)
  startDialTone() {
    this.stopAll();
    const ctx = this.getContext();

    const playBeep = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(425, ctx.currentTime);

        // Smooth envelope
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + 1.15);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.3);
      } catch (e) {
        console.warn('Audio tone error', e);
      }
    };

    playBeep();
    this.dialToneInterval = window.setInterval(playBeep, 3800);
  }

  // Plays incoming call melodic ringtone
  startIncomingRingtone() {
    this.stopAll();
    const ctx = this.getContext();

    const playPhrase = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      try {
        const notes = [
          { f: 659.25, time: 0, dur: 0.2 },      // E5
          { f: 880, time: 0.22, dur: 0.25 },     // A5
          { f: 987.77, time: 0.5, dur: 0.2 },    // B5
          { f: 1318.51, time: 0.72, dur: 0.45 },  // E6
          { f: 1174.66, time: 1.2, dur: 0.3 },   // D6
          { f: 987.77, time: 1.55, dur: 0.4 },   // B5
        ];

        notes.forEach((n) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.time);

          gain.gain.setValueAtTime(0, ctx.currentTime + n.time);
          gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + n.time + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(ctx.currentTime + n.time);
          osc.stop(ctx.currentTime + n.time + n.dur + 0.05);
        });
      } catch (e) {
        console.warn('Ringtone error', e);
      }
    };

    playPhrase();
    this.ringtoneInterval = window.setInterval(playPhrase, 2800);
  }

  // Call connected sound
  playCallConnected() {
    this.stopAll();
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      // ignore
    }
  }

  // Call ended / busy signal (beep-beep-beep)
  playCallEnded() {
    this.stopAll();
    try {
      const ctx = this.getContext();
      [0, 0.35, 0.7].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(425, ctx.currentTime + delay);

        gain.gain.setValueAtTime(0.18, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + delay + 0.22);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.26);
      });
    } catch {
      // ignore
    }
  }

  // Send message sound
  playMessageSent() {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch {
      // ignore
    }
  }

  // Received message sound
  playMessageReceived() {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {
      // ignore
    }
  }

  stopAll() {
    if (this.dialToneInterval) {
      clearInterval(this.dialToneInterval);
      this.dialToneInterval = null;
    }
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }
}

export const soundService = new SoundService();
