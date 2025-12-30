class SoundService {
  private ctx: AudioContext | null = null;

  private getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  playTone(freq: number, type: OscillatorType, duration: number) {
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playPop() {
    this.playTone(600, 'sine', 0.1);
  }

  playError() {
    this.playTone(150, 'sawtooth', 0.3);
  }

  playSuccess() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.3);
    });
  }

  playWin() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    // Simple fanfare
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
       const osc = ctx.createOscillator();
       const gain = ctx.createGain();
       osc.frequency.value = freq;
       gain.gain.setValueAtTime(0.2, now + i * 0.15);
       gain.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.5);
       osc.connect(gain);
       gain.connect(ctx.destination);
       osc.start(now + i * 0.15);
       osc.stop(now + i * 0.15 + 0.5);
    });
  }

  playReady() {
    this.playTone(880, 'sine', 0.5);
  }
}

export const soundService = new SoundService();
