/**
 * Pharmacy Vending Kiosk - Audio Manager
 * Zero-overhead Web Audio API Sound Synthesizer & Speech Synthesis Guide
 */

'use strict';

class KioskAudioManager {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.speechSynthesis = window.speechSynthesis || null;
    this.selectedVoice = null;

    // Check saved preference
    const savedMute = localStorage.getItem('kiosk_audio_muted');
    if (savedMute !== null) {
      this.isMuted = savedMute === 'true';
    }

    this._initSpeech();
  }

  _getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  _initSpeech() {
    if (!this.speechSynthesis) return;

    const findVoice = () => {
      const voices = this.speechSynthesis.getVoices();
      // Look for Persian (fa-IR, fa) or fallback to Arabic / default smooth voice
      this.selectedVoice = voices.find(v => v.lang.startsWith('fa')) ||
                           voices.find(v => v.lang.startsWith('ar')) ||
                           voices[0] || null;
    };

    findVoice();
    if (this.speechSynthesis.onvoiceschanged !== undefined) {
      this.speechSynthesis.onvoiceschanged = findVoice;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('kiosk_audio_muted', this.isMuted ? 'true' : 'false');
    if (this.isMuted && this.speechSynthesis) {
      this.speechSynthesis.cancel();
    } else if (!this.isMuted) {
      this.playTap();
      this.speak('راهنمای صوتی فعال شد');
    }
    return this.isMuted;
  }

  // --- Web Audio Synthesizer Sounds ---

  playTap() {
    if (this.isMuted) return;
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {}
  }

  playSuccess() {
    if (this.isMuted) return;
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // High harmonic two-tone clinical chord
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch {}
  }

  playAlert() {
    if (this.isMuted) return;
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      [350, 300].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);

        gain.gain.setValueAtTime(0.12, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.2);
      });
    } catch {}
  }

  playDispenseSound() {
    if (this.isMuted) return;
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Soft mechanical hum followed by a crisp drop chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(160, now + 1.2);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);
    } catch {}
  }

  // --- Persian Voice Guidance ---

  speak(text) {
    if (this.isMuted || !this.speechSynthesis) return;

    try {
      this.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.lang = 'fa-IR';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      this.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
    }
  }

  // Flow-specific voice prompts
  speakWelcome() {
    this.speak('به کیوسک هوشمند داروخانه خوش آمدید. لطفاً داروی مورد نظر خود را انتخاب نمایید.');
  }

  speakProductSelected(productName) {
    this.speak(`${productName} انتخاب شد. جهت پرداخت لطفاً تایید کنید.`);
  }

  speakPaymentPrompt(amountToman) {
    this.speak(`مبلغ ${amountToman.toLocaleString('fa-IR')} تومان. لطفاً کارت بانکی خود را در کارتخوان سمت راست بکشید.`);
  }

  speakDispensing() {
    this.speak('پرداخت با موفقیت انجام شد. داروی شما در حال تحویل در دریچه پایینی است.');
  }

  speakDispensedSuccess() {
    this.speak('داروی شما در دریچه پایین قرار گرفت. با تشکر از خرید شما، شاد و سلامت باشید.');
  }

  speakRefundPending() {
    this.speak('متاسفانه کالا در دریچه تحویل نشد. مبلغ کسر شده به صورت خودکار به حساب بانکی شما مسترد می‌گردد.');
  }
}

// Global instance
window.kioskAudio = new KioskAudioManager();
