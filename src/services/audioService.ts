// Web Audio API generator for calling dial tones ("гудки"), ringtones, and notification sounds
import { doc, onSnapshot, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface CustomRingtoneMetadata {
  name: string;
  size: number;
  type: string;
  duration?: number;
  updatedAt: number;
  updatedBy?: string;
  directUrl?: string;
  isDefault?: boolean;
}

export interface GlobalRingtoneDoc {
  name: string;
  size: number;
  type: string;
  duration?: number;
  updatedAt: number;
  updatedBy?: string;
  directUrl?: string;
  isDefault?: boolean;
  chunkCount?: number;
}

const AUDIO_DB_NAME = 'telechat_audio_db';
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = 'custom_ringtones';
const CUSTOM_RINGTONE_KEY = 'active_ringtone';

function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredAudio(): Promise<{ meta: CustomRingtoneMetadata; buffer: ArrayBuffer } | null> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readonly');
      const store = tx.objectStore(AUDIO_STORE_NAME);
      const req = store.get(CUSTOM_RINGTONE_KEY);
      req.onsuccess = () => {
        const data = req.result;
        if (data && data.buffer) {
          resolve({
            meta: {
              name: data.name,
              size: data.size,
              type: data.type,
              duration: data.duration,
              updatedAt: data.updatedAt,
              updatedBy: data.updatedBy,
              directUrl: data.directUrl,
              isDefault: data.isDefault,
            },
            buffer: data.buffer,
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function putStoredAudio(meta: CustomRingtoneMetadata, buffer: ArrayBuffer): Promise<void> {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
    const store = tx.objectStore(AUDIO_STORE_NAME);
    const req = store.put({
      id: CUSTOM_RINGTONE_KEY,
      ...meta,
      buffer,
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteStoredAudio(): Promise<void> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIO_STORE_NAME);
      const req = store.delete(CUSTOM_RINGTONE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

class SoundService {
  private ctx: AudioContext | null = null;
  private dialToneInterval: number | null = null;
  private ringtoneInterval: number | null = null;
  private ringtoneAudio: HTMLAudioElement | null = null;
  private ringtoneAudioUrl: string | null = null;
  private ringtoneBuffer: AudioBuffer | null = null;
  private ringtoneSourceNode: AudioBufferSourceNode | null = null;
  private ringtoneGainNode: GainNode | null = null;
  private isPreloading = false;
  private isPreviewPlaying = false;
  private previewListeners: Set<(playing: boolean) => void> = new Set();
  private customRingtoneListeners: Set<(meta: CustomRingtoneMetadata | null) => void> = new Set();
  private ringtoneVolume = 0.9;
  private customRingtoneMeta: CustomRingtoneMetadata | null = null;

  constructor() {
    // Attempt early preload and restore saved custom ringtone
    if (typeof window !== 'undefined') {
      this.initSavedRingtone();
      this.initGlobalSync();

      const unlockAudio = () => {
        this.getContext();
        if (!this.customRingtoneMeta) {
          this.preloadRingtone();
        }
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  private globalSyncStarted = false;

  // Real-time synchronization of the global system-wide ringtone across all users
  public initGlobalSync() {
    if (this.globalSyncStarted || typeof window === 'undefined') return;
    this.globalSyncStarted = true;

    try {
      const ringtoneDocRef = doc(db, 'system_settings', 'global_ringtone');
      onSnapshot(ringtoneDocRef, async (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data() as GlobalRingtoneDoc;
        if (!data) return;

        // If admin reset to default
        if (data.isDefault) {
          if (this.customRingtoneMeta) {
            console.log('Global ringtone was reset to default by admin');
            await this.applyDefaultRingtoneLocally();
          }
          return;
        }

        // Check if this version is already applied locally in IndexedDB
        if (this.customRingtoneMeta && this.customRingtoneMeta.updatedAt === data.updatedAt) {
          return;
        }

        console.log('Syncing global ringtone from admin:', data.name);

        try {
          let arrayBuffer: ArrayBuffer | null = null;

          if (data.directUrl) {
            const res = await fetch(data.directUrl);
            arrayBuffer = await res.arrayBuffer();
          } else if (data.chunkCount && data.chunkCount > 0) {
            const chunksCol = collection(db, 'system_settings', 'global_ringtone', 'chunks');
            const snap = await getDocs(chunksCol);
            const chunkMap = new Map<number, string>();
            snap.forEach((d) => {
              const cData = d.data();
              chunkMap.set(cData.index, cData.data);
            });
            let fullBase64 = '';
            for (let i = 0; i < data.chunkCount; i++) {
              const piece = chunkMap.get(i);
              if (piece) fullBase64 += piece;
            }
            if (fullBase64) {
              arrayBuffer = base64ToArrayBuffer(fullBase64);
            }
          }

          if (arrayBuffer) {
            await this.applyCustomBufferLocally(
              {
                name: data.name,
                size: data.size,
                type: data.type,
                duration: data.duration,
                updatedAt: data.updatedAt,
                updatedBy: data.updatedBy,
                directUrl: data.directUrl,
              },
              arrayBuffer
            );
          }
        } catch (err) {
          console.warn('Failed to sync new global ringtone from server:', err);
        }
      }, (err) => {
        console.warn('Global ringtone subscription notice:', err);
      });
    } catch (err) {
      console.warn('initGlobalSync catch:', err);
    }
  }

  private async initSavedRingtone() {
    try {
      const saved = await getStoredAudio();
      if (saved) {
        this.customRingtoneMeta = saved.meta;
        const ctx = this.getContext();
        try {
          // Decode audio buffer from saved array buffer
          this.ringtoneBuffer = await ctx.decodeAudioData(saved.buffer.slice(0));
          if (this.ringtoneBuffer.duration) {
            this.customRingtoneMeta.duration = this.ringtoneBuffer.duration;
          }
        } catch (e) {
          console.warn('Failed to decode saved custom ringtone buffer:', e);
        }

        // Set fallback audio element
        try {
          const blob = new Blob([saved.buffer], { type: saved.meta.type || 'audio/mpeg' });
          if (this.ringtoneAudioUrl) {
            URL.revokeObjectURL(this.ringtoneAudioUrl);
          }
          this.ringtoneAudioUrl = URL.createObjectURL(blob);
          this.ringtoneAudio = new Audio(this.ringtoneAudioUrl);
        } catch (e) {
          console.warn('Failed to create object URL for saved ringtone:', e);
        }

        this.notifyCustomRingtoneListeners();
        return;
      }
    } catch (e) {
      console.warn('Could not load custom ringtone from storage:', e);
    }

    // Default ringtone fallback
    this.preloadRingtone();
  }

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Preloads and decodes the ringtone audio buffer for instant zero-latency playback
  async preloadRingtone(): Promise<AudioBuffer | null> {
    if (this.ringtoneBuffer) return this.ringtoneBuffer;
    if (this.isPreloading) return null;

    this.isPreloading = true;
    try {
      const response = await fetch('/ringtone.mp3');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const ctx = this.getContext();
      this.ringtoneBuffer = await ctx.decodeAudioData(arrayBuffer);
      return this.ringtoneBuffer;
    } catch (err) {
      console.warn('Preloading ringtone buffer failed, will use HTMLAudioElement fallback:', err);
      return null;
    } finally {
      this.isPreloading = false;
    }
  }

  // Internal helper to play the Phonk track using Web Audio Buffer (preferred) or HTMLAudioElement
  private playRingtoneTrack(volume = 0.9, loop = true): boolean {
    const ctx = this.getContext();

    // 1. Try Web Audio buffer source (immune to HTML element autoplay restrictions once context is running)
    if (this.ringtoneBuffer) {
      try {
        if (this.ringtoneSourceNode) {
          try {
            this.ringtoneSourceNode.stop();
          } catch {}
          this.ringtoneSourceNode.disconnect();
          this.ringtoneSourceNode = null;
        }

        const source = ctx.createBufferSource();
        source.buffer = this.ringtoneBuffer;
        source.loop = loop;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(volume * this.ringtoneVolume, ctx.currentTime);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0);
        this.ringtoneSourceNode = source;
        this.ringtoneGainNode = gainNode;
        return true;
      } catch (e) {
        console.warn('Web Audio buffer playback error:', e);
      }
    }

    // 2. HTMLAudioElement fallback or parallel loader
    try {
      if (!this.ringtoneAudio) {
        this.ringtoneAudio = new Audio(this.ringtoneAudioUrl || '/ringtone.mp3');
      }
      this.ringtoneAudio.loop = loop;
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio.volume = Math.min(1, volume * this.ringtoneVolume);
      const playPromise = this.ringtoneAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('HTMLAudioElement play failed:', err);
          // If neither worked yet, trigger buffer preloading
          this.preloadRingtone().then((buf) => {
            if (buf && (this.isPreviewPlaying || this.ringtoneInterval !== null)) {
              this.playRingtoneTrack(volume, loop);
            }
          });
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  // Plays outgoing call ringback tone (music ringtone "Serebro - Мало тебя Phonk" with gentle phone dial overlay)
  startDialTone(withMusic = true) {
    this.stopAll();
    const ctx = this.getContext();

    if (withMusic) {
      // Start the music ringtone for outgoing call at balanced volume
      this.playRingtoneTrack(0.85, true);
    }

    // Subtle classic telephone beep pulse layered over music for authentic calling feel
    const playBeep = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(425, ctx.currentTime);

        const beepGain = withMusic ? 0.08 : 0.18;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(beepGain, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(beepGain, ctx.currentTime + 1.15);
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

  // Plays incoming call ringtone (Serebro - Мало тебя Phonk remix)
  startIncomingRingtone() {
    this.stopAll();
    this.playRingtoneTrack(0.95, true);
  }

  // Preview the ringtone in profile settings
  togglePreviewRingtone(onStateChange?: (isPlaying: boolean) => void): boolean {
    if (this.isPreviewPlaying) {
      this.stopAll();
      return false;
    } else {
      this.stopAll();
      this.isPreviewPlaying = true;
      this.playRingtoneTrack(0.95, false);

      // Listen for natural end of playback
      if (this.ringtoneSourceNode) {
        this.ringtoneSourceNode.onended = () => {
          this.isPreviewPlaying = false;
          this.notifyPreviewListeners(false);
        };
      }
      if (this.ringtoneAudio) {
        this.ringtoneAudio.onended = () => {
          this.isPreviewPlaying = false;
          this.notifyPreviewListeners(false);
        };
      }

      this.notifyPreviewListeners(true);
      if (onStateChange) onStateChange(true);
      return true;
    }
  }

  subscribePreview(callback: (playing: boolean) => void): () => void {
    this.previewListeners.add(callback);
    callback(this.isPreviewPlaying);
    return () => {
      this.previewListeners.delete(callback);
    };
  }

  private notifyPreviewListeners(playing: boolean) {
    this.isPreviewPlaying = playing;
    this.previewListeners.forEach((cb) => {
      try {
        cb(playing);
      } catch {}
    });
  }

  getIsPreviewPlaying(): boolean {
    return this.isPreviewPlaying;
  }

  setVolume(volume: number) {
    this.ringtoneVolume = Math.max(0, Math.min(1, volume));
    if (this.ringtoneGainNode && this.ctx) {
      this.ringtoneGainNode.gain.setValueAtTime(this.ringtoneVolume, this.ctx.currentTime);
    }
    if (this.ringtoneAudio) {
      this.ringtoneAudio.volume = this.ringtoneVolume;
    }
  }

  getVolume(): number {
    return this.ringtoneVolume;
  }

  public async applyCustomBufferLocally(meta: CustomRingtoneMetadata, buffer: ArrayBuffer) {
    try {
      const ctx = this.getContext();
      this.ringtoneBuffer = await ctx.decodeAudioData(buffer.slice(0));
      if (this.ringtoneBuffer.duration) {
        meta.duration = this.ringtoneBuffer.duration;
      }
    } catch (err) {
      console.warn('Failed to decode buffer locally:', err);
    }

    // Update object URL for fallback HTMLAudio
    if (this.ringtoneAudioUrl) {
      URL.revokeObjectURL(this.ringtoneAudioUrl);
    }
    try {
      const blob = new Blob([buffer], { type: meta.type || 'audio/mpeg' });
      this.ringtoneAudioUrl = URL.createObjectURL(blob);
      this.ringtoneAudio = new Audio(this.ringtoneAudioUrl);
    } catch (e) {
      console.warn('URL blob warning:', e);
    }

    this.customRingtoneMeta = meta;
    await putStoredAudio(meta, buffer);
    this.notifyCustomRingtoneListeners();
  }

  public async applyDefaultRingtoneLocally() {
    this.stopAll();
    await deleteStoredAudio();
    this.customRingtoneMeta = null;
    if (this.ringtoneAudioUrl) {
      URL.revokeObjectURL(this.ringtoneAudioUrl);
      this.ringtoneAudioUrl = null;
    }
    this.ringtoneAudio = null;
    this.ringtoneBuffer = null;
    this.notifyCustomRingtoneListeners();
    this.preloadRingtone();
  }

  // Admin action: Upload audio file and set it globally for ALL users in real time
  async adminSetGlobalRingtoneFromFile(
    file: File,
    adminName: string,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<CustomRingtoneMetadata> {
    onProgress?.(10, 'Чтение аудиофайла...');
    const ctx = this.getContext();
    const arrayBuffer = await file.arrayBuffer();

    onProgress?.(30, 'Проверка и декодирование...');
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (err) {
      console.warn('decodeAudioData failed:', err);
      throw new Error('Не удалось декодировать аудиофайл. Убедитесь, что это корректный MP3, WAV или OGG файл.');
    }

    const meta: CustomRingtoneMetadata = {
      name: file.name,
      size: file.size,
      type: file.type || 'audio/mpeg',
      duration: decoded.duration,
      updatedAt: Date.now(),
      updatedBy: adminName,
    };

    onProgress?.(50, 'Подготовка данных к отправке...');
    const base64 = arrayBufferToBase64(arrayBuffer);

    // 400KB character chunk limit (safe for Firestore's 1MB document size limit)
    const CHUNK_CHAR_LIMIT = 400000;
    const chunkCount = Math.ceil(base64.length / CHUNK_CHAR_LIMIT);

    onProgress?.(65, `Синхронизация с сервером (${chunkCount} частей)...`);

    for (let i = 0; i < chunkCount; i++) {
      const chunkData = base64.slice(i * CHUNK_CHAR_LIMIT, (i + 1) * CHUNK_CHAR_LIMIT);
      const chunkDocRef = doc(db, 'system_settings', 'global_ringtone', 'chunks', `chunk_${i}`);
      await setDoc(chunkDocRef, {
        index: i,
        data: chunkData,
        updatedAt: meta.updatedAt,
      });
      const pct = Math.round(65 + ((i + 1) / chunkCount) * 25);
      onProgress?.(pct, `Загрузка части ${i + 1} из ${chunkCount}...`);
    }

    // Clean up any extra obsolete chunks
    try {
      const oldChunksSnap = await getDocs(collection(db, 'system_settings', 'global_ringtone', 'chunks'));
      oldChunksSnap.forEach(async (docItem) => {
        const idx = docItem.data().index;
        if (idx >= chunkCount) {
          await deleteDoc(docItem.ref);
        }
      });
    } catch {}

    onProgress?.(95, 'Обновление общесистемного статуса...');

    const mainDocRef = doc(db, 'system_settings', 'global_ringtone');
    await setDoc(mainDocRef, {
      name: meta.name,
      size: meta.size,
      type: meta.type,
      duration: meta.duration,
      updatedAt: meta.updatedAt,
      updatedBy: meta.updatedBy,
      chunkCount,
      isDefault: false,
    });

    // Apply locally for admin immediately
    await this.applyCustomBufferLocally(meta, arrayBuffer);

    onProgress?.(100, 'Мелодия успешно установлена для всех пользователей!');
    return meta;
  }

  // Admin action: Set global ringtone via direct URL
  async adminSetGlobalRingtoneFromUrl(
    url: string,
    title: string,
    adminName: string
  ): Promise<CustomRingtoneMetadata> {
    const cleanUrl = url.trim();
    if (!cleanUrl) throw new Error('Укажите корректный URL адрес');

    const res = await fetch(cleanUrl);
    if (!res.ok) throw new Error(`Не удалось загрузить аудио по ссылке: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();

    const ctx = this.getContext();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

    const meta: CustomRingtoneMetadata = {
      name: title || cleanUrl.split('/').pop() || 'Интернет-рингтон',
      size: arrayBuffer.byteLength,
      type: 'audio/mpeg',
      duration: decoded.duration,
      updatedAt: Date.now(),
      updatedBy: adminName,
      directUrl: cleanUrl,
    };

    const mainDocRef = doc(db, 'system_settings', 'global_ringtone');
    await setDoc(mainDocRef, {
      name: meta.name,
      size: meta.size,
      type: meta.type,
      duration: meta.duration,
      updatedAt: meta.updatedAt,
      updatedBy: meta.updatedBy,
      directUrl: cleanUrl,
      isDefault: false,
      chunkCount: 0,
    });

    await this.applyCustomBufferLocally(meta, arrayBuffer);
    return meta;
  }

  // Admin action: Reset global ringtone to standard default
  async adminResetGlobalRingtone(adminName: string): Promise<void> {
    const mainDocRef = doc(db, 'system_settings', 'global_ringtone');
    await setDoc(mainDocRef, {
      isDefault: true,
      name: 'Serebro — Мало тебя (Phonk Remix)',
      updatedAt: Date.now(),
      updatedBy: adminName,
      chunkCount: 0,
    });

    await this.applyDefaultRingtoneLocally();
  }

  async saveCustomRingtone(file: File): Promise<CustomRingtoneMetadata> {
    // Retained for backward-compat: redirects to admin upload
    return this.adminSetGlobalRingtoneFromFile(file, 'Администратор');
  }

  async removeCustomRingtone(): Promise<void> {
    await this.adminResetGlobalRingtone('Администратор');
  }

  getRingtoneTitle(): string {
    if (this.customRingtoneMeta) {
      return this.customRingtoneMeta.name;
    }
    return 'Serebro — Мало тебя (Phonk Remix)';
  }

  getCustomRingtoneMeta(): CustomRingtoneMetadata | null {
    return this.customRingtoneMeta;
  }

  isCustomRingtone(): boolean {
    return this.customRingtoneMeta !== null;
  }

  subscribeCustomRingtone(callback: (meta: CustomRingtoneMetadata | null) => void): () => void {
    this.customRingtoneListeners.add(callback);
    callback(this.customRingtoneMeta);
    return () => {
      this.customRingtoneListeners.delete(callback);
    };
  }

  private notifyCustomRingtoneListeners() {
    this.customRingtoneListeners.forEach((cb) => {
      try {
        cb(this.customRingtoneMeta);
      } catch {}
    });
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
    if (this.ringtoneSourceNode) {
      try {
        this.ringtoneSourceNode.stop();
      } catch {}
      try {
        this.ringtoneSourceNode.disconnect();
      } catch {}
      this.ringtoneSourceNode = null;
    }
    if (this.ringtoneAudio) {
      try {
        this.ringtoneAudio.pause();
        this.ringtoneAudio.currentTime = 0;
      } catch {}
    }
    if (this.dialToneInterval) {
      clearInterval(this.dialToneInterval);
      this.dialToneInterval = null;
    }
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.isPreviewPlaying) {
      this.notifyPreviewListeners(false);
    }
  }
}

export const soundService = new SoundService();
