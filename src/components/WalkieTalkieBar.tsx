import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playCoachWhistle, playWalkieBeep, unlockAudioContext } from '../utils/audio';

export type WalkieTargetType = 'all' | 'admin' | 'staff';

export interface WalkieStaffItem {
  name: string;
  online: boolean;
  role: 'admin' | 'staff';
}

export interface WalkieVoiceEvent {
  clipId: string;
  senderName: string;
  senderRole: 'admin' | 'staff';
  senderClientId: string;
  targetType?: WalkieTargetType;
  targetName?: string;
  whistleFirst?: boolean;
  durationMs: number;
  createdAt: number;
}

export interface WalkieWhistleEvent {
  id: string;
  senderName: string;
  senderRole: 'admin' | 'staff';
  senderClientId: string;
  targetType?: WalkieTargetType;
  targetName?: string;
  message?: string;
  createdAt: number;
}

interface WalkieTalkieBarProps {
  userRole: 'admin' | 'staff';
  packerName: string;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface ActiveVoiceState {
  clip: WalkieVoiceEvent;
  status: 'playing' | 'blocked' | 'muted' | 'done';
}

interface ActiveWhistleState {
  id: string;
  senderName: string;
  isPrivate: boolean;
  createdAt: number;
}

const MAX_RECORD_MS = 20000;
const MIN_RECORD_MS = 320;

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

export function WalkieTalkieBar({ userRole, packerName, onShowToast }: WalkieTalkieBarProps) {
  const clientIdRef = useRef<string>(
    `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  // Keep fresh refs for SSE event filtering
  const userRoleRef = useRef(userRole);
  const packerNameRef = useRef(packerName);
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);
  useEffect(() => {
    packerNameRef.current = packerName;
  }, [packerName]);

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('walkie_muted') === 'true';
    } catch {
      return false;
    }
  });
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const [staffList, setStaffList] = useState<WalkieStaffItem[]>([]);
  // Target format: 'all' | 'admin' | 'staff:<Name>'
  const [selectedTarget, setSelectedTarget] = useState<string>('all');

  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [whistleCooldown, setWhistleCooldown] = useState(false);

  const [activeVoice, setActiveVoice] = useState<ActiveVoiceState | null>(null);
  const [activeWhistle, setActiveWhistle] = useState<ActiveWhistleState | null>(null);

  // Refs for MediaRecorder lifecycle (zero background CPU when idle)
  const isPressingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for incoming audio playback queue
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const voiceQueueRef = useRef<WalkieVoiceEvent[]>([]);
  const isPlayingRef = useRef(false);
  const whistleDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset invalid selectedTarget if role switches
  useEffect(() => {
    if (userRole === 'admin' && selectedTarget === 'admin') {
      setSelectedTarget('all');
    } else if (userRole === 'staff' && selectedTarget.startsWith('staff:')) {
      setSelectedTarget('all');
    }
  }, [userRole, selectedTarget]);

  // Parse active targetType + targetName cleanly
  const resolvedTarget = useMemo(() => {
    if (userRole === 'admin') {
      if (selectedTarget.startsWith('staff:')) {
        const name = selectedTarget.slice('staff:'.length).trim();
        if (name) return { targetType: 'staff' as WalkieTargetType, targetName: name };
      }
      return { targetType: 'all' as WalkieTargetType, targetName: '' };
    }
    if (selectedTarget === 'admin') {
      return { targetType: 'admin' as WalkieTargetType, targetName: 'Admin' };
    }
    return { targetType: 'all' as WalkieTargetType, targetName: '' };
  }, [selectedTarget, userRole]);

  const isPrivateTarget = resolvedTarget.targetType !== 'all';

  // Announce presence (RAM-only) when mounted or name/role changes + lightweight 45s heartbeat
  useEffect(() => {
    let cancelled = false;

    const sendPresence = async () => {
      try {
        const resp = await fetch('/api/walkie/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientIdRef.current,
            name: (packerName || '').trim(),
            role: userRole
          })
        });
        const data = await resp.json().catch(() => null);
        if (!cancelled && data?.success && Array.isArray(data.staffList)) {
          setStaffList(data.staffList);
        }
      } catch {}
    };

    sendPresence();
    const onFocusOrVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        sendPresence();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    const timer = setInterval(onFocusOrVisible, 45000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      clearInterval(timer);
    };
  }, [packerName, userRole]);

  const stopTracksImmediately = useCallback(() => {
    if (recordTickRef.current) {
      clearInterval(recordTickRef.current);
      recordTickRef.current = null;
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
  }, []);

  const getOrCreateAudioEl = useCallback(() => {
    if (!audioElRef.current) {
      const el = new Audio();
      el.preload = 'auto';
      audioElRef.current = el;
    }
    return audioElRef.current;
  }, []);

  const playNextInQueue = useCallback(async () => {
    if (isPlayingRef.current) return;
    const nextClip = voiceQueueRef.current.shift();
    if (!nextClip) return;

    if (voiceClearTimerRef.current) {
      clearTimeout(voiceClearTimerRef.current);
      voiceClearTimerRef.current = null;
    }

    if (isMutedRef.current) {
      setActiveVoice({ clip: nextClip, status: 'muted' });
      voiceClearTimerRef.current = setTimeout(() => {
        setActiveVoice(prev => (prev?.clip.clipId === nextClip.clipId ? null : prev));
      }, 25000);
      return;
    }

    isPlayingRef.current = true;
    setActiveVoice({ clip: nextClip, status: 'playing' });

    try {
      const audio = getOrCreateAudioEl();
      audio.src = `/api/walkie/audio/${encodeURIComponent(nextClip.clipId)}`;
      audio.currentTime = 0;

      playWalkieBeep('start');

      const finishPlayback = (hadError = false) => {
        audio.onended = null;
        audio.onerror = null;
        isPlayingRef.current = false;
        if (!hadError) {
          playWalkieBeep('end');
        }
        setActiveVoice(prev =>
          prev?.clip.clipId === nextClip.clipId ? { clip: nextClip, status: 'done' } : prev
        );
        voiceClearTimerRef.current = setTimeout(() => {
          setActiveVoice(prev => (prev?.clip.clipId === nextClip.clipId ? null : prev));
        }, 12000);
        if (voiceQueueRef.current.length > 0) {
          setTimeout(() => {
            playNextInQueue();
          }, 120);
        }
      };

      audio.onended = () => finishPlayback(false);
      audio.onerror = () => finishPlayback(true);

      await audio.play();
    } catch {
      isPlayingRef.current = false;
      setActiveVoice({ clip: nextClip, status: 'blocked' });
    }
  }, [getOrCreateAudioEl]);

  const handleManualPlayClip = useCallback(
    async (clip: WalkieVoiceEvent) => {
      unlockAudioContext();
      if (voiceClearTimerRef.current) {
        clearTimeout(voiceClearTimerRef.current);
        voiceClearTimerRef.current = null;
      }

      const audio = getOrCreateAudioEl();
      audio.onended = null;
      audio.onerror = null;
      audio.pause();

      isPlayingRef.current = true;
      setActiveVoice({ clip, status: 'playing' });

      try {
        audio.src = `/api/walkie/audio/${encodeURIComponent(clip.clipId)}`;
        audio.currentTime = 0;
        audio.onended = () => {
          audio.onended = null;
          audio.onerror = null;
          isPlayingRef.current = false;
          playWalkieBeep('end');
          setActiveVoice(prev =>
            prev?.clip.clipId === clip.clipId ? { clip, status: 'done' } : prev
          );
          voiceClearTimerRef.current = setTimeout(() => {
            setActiveVoice(prev => (prev?.clip.clipId === clip.clipId ? null : prev));
          }, 12000);
          if (voiceQueueRef.current.length > 0) {
            setTimeout(() => playNextInQueue(), 120);
          }
        };
        audio.onerror = () => {
          audio.onended = null;
          audio.onerror = null;
          isPlayingRef.current = false;
          onShowToast?.('⚠️ សំឡេងនេះផុតកំណត់ហើយ', 'error');
          setActiveVoice(null);
        };
        await audio.play();
      } catch {
        isPlayingRef.current = false;
        setActiveVoice({ clip, status: 'blocked' });
      }
    },
    [getOrCreateAudioEl, onShowToast, playNextInQueue]
  );

  // Subscribe to SSE-forwarded window events from App.tsx (single EventSource, zero extra polling)
  useEffect(() => {
    const isMessageForMe = (targetType?: WalkieTargetType, targetName?: string) => {
      const tType = targetType || 'all';
      if (tType === 'all') return true;
      if (tType === 'admin') {
        return userRoleRef.current === 'admin';
      }
      if (tType === 'staff') {
        const wanted = String(targetName || '').trim().toLowerCase();
        const mine = String(packerNameRef.current || '').trim().toLowerCase();
        return Boolean(wanted && mine && userRoleRef.current === 'staff' && mine === wanted);
      }
      return true;
    };

    const onVoiceEvent = (ev: Event) => {
      const customEv = ev as CustomEvent<WalkieVoiceEvent>;
      const data = customEv.detail;
      if (!data || !data.clipId) return;
      if (data.senderClientId && data.senderClientId === clientIdRef.current) return;
      if (!isMessageForMe(data.targetType, data.targetName)) return;

      voiceQueueRef.current.push(data);
      playNextInQueue();
    };

    const onWhistleEvent = (ev: Event) => {
      const customEv = ev as CustomEvent<WalkieWhistleEvent>;
      const data = customEv.detail;
      if (!data || !data.id) return;
      if (data.senderClientId && data.senderClientId === clientIdRef.current) return;
      if (!isMessageForMe(data.targetType, data.targetName)) return;

      if (!isMutedRef.current) {
        playCoachWhistle();
      }

      setActiveWhistle({
        id: data.id,
        senderName: data.senderName || 'Admin',
        isPrivate: data.targetType === 'staff',
        createdAt: data.createdAt || Date.now()
      });

      if (whistleDismissTimerRef.current) {
        clearTimeout(whistleDismissTimerRef.current);
      }
      whistleDismissTimerRef.current = setTimeout(() => {
        setActiveWhistle(prev => (prev?.id === data.id ? null : prev));
      }, 6500);
    };

    const onRosterEvent = (ev: Event) => {
      const customEv = ev as CustomEvent<{ staffList?: WalkieStaffItem[] }>;
      if (Array.isArray(customEv.detail?.staffList)) {
        setStaffList(customEv.detail.staffList);
      }
    };

    const unlockOnGesture = () => {
      unlockAudioContext();
      getOrCreateAudioEl();
      window.removeEventListener('pointerdown', unlockOnGesture, true);
      window.removeEventListener('keydown', unlockOnGesture, true);
    };

    window.addEventListener('pointerdown', unlockOnGesture, true);
    window.addEventListener('keydown', unlockOnGesture, true);
    window.addEventListener('walkie:voice', onVoiceEvent);
    window.addEventListener('walkie:whistle', onWhistleEvent);
    window.addEventListener('walkie:roster', onRosterEvent);

    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture, true);
      window.removeEventListener('keydown', unlockOnGesture, true);
      window.removeEventListener('walkie:voice', onVoiceEvent);
      window.removeEventListener('walkie:whistle', onWhistleEvent);
      window.removeEventListener('walkie:roster', onRosterEvent);
      stopTracksImmediately();
      if (whistleDismissTimerRef.current) clearTimeout(whistleDismissTimerRef.current);
      if (voiceClearTimerRef.current) clearTimeout(voiceClearTimerRef.current);
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
    };
  }, [getOrCreateAudioEl, playNextInQueue, stopTracksImmediately]);

  const sendRecordedClip = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (!blob || blob.size === 0) return;
      setIsSending(true);
      try {
        const audioBase64 = await blobToBase64(blob);
        const resp = await fetch('/api/walkie/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64,
            contentType: blob.type || 'audio/webm',
            senderName: packerName || (userRole === 'admin' ? 'Admin' : 'Staff'),
            senderRole: userRole,
            senderClientId: clientIdRef.current,
            targetType: resolvedTarget.targetType,
            targetName: resolvedTarget.targetName,
            durationMs
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) {
          onShowToast?.(`⚠️ មិនអាចផ្ញើសំឡេងបានទេ: ${data.error || resp.status}`, 'error');
        } else {
          playWalkieBeep('end');
          if (resolvedTarget.targetType === 'staff') {
            onShowToast?.(`🔒 បានផ្ញើសំឡេងផ្ទាល់ទៅ ${resolvedTarget.targetName}!`, 'success');
          } else if (resolvedTarget.targetType === 'admin') {
            onShowToast?.('🔒 បានផ្ញើសំឡេងផ្ទាល់ទៅ Admin!', 'success');
          } else {
            onShowToast?.('📻 បានផ្ញើសំឡេងវិទ្យុទាក់ទងទៅទាំងអស់គ្នា!', 'success');
          }
        }
      } catch {
        onShowToast?.('⚠️ បញ្ហាអ៊ីនធឺណិត មិនអាចផ្ញើសំឡេងបានទេ', 'error');
      } finally {
        setIsSending(false);
      }
    },
    [onShowToast, packerName, resolvedTarget.targetName, resolvedTarget.targetType, userRole]
  );

  const stopRecording = useCallback(() => {
    isPressingRef.current = false;
    setIsRecording(false);
    setRecordingMs(0);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        stopTracksImmediately();
      }
    } else {
      stopTracksImmediately();
    }
  }, [stopTracksImmediately]);

  const handleStartPTT = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (isRecording || isSending) return;

      unlockAudioContext();
      getOrCreateAudioEl();

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        onShowToast?.('⚠️ កម្មវិធីនេះមិនគាំទ្រការថតសំឡេងមីក្រូហ្វូនទេ', 'error');
        return;
      }

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      isPressingRef.current = true;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (!isPressingRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        chunksRef.current = [];

        const mimeType = pickSupportedMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = recorder;
        recordStartRef.current = Date.now();

        recorder.ondataavailable = ev => {
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const durationMs = Date.now() - recordStartRef.current;
          const recordedChunks = chunksRef.current;
          chunksRef.current = [];
          mediaRecorderRef.current = null;
          stopTracksImmediately();

          if (durationMs < MIN_RECORD_MS || recordedChunks.length === 0) {
            onShowToast?.('🎙️ សូមកាន់ប៊ូតុងឱ្យជាប់ពេលនិយាយ', 'info');
            return;
          }

          const finalMime = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(recordedChunks, { type: finalMime });
          sendRecordedClip(blob, durationMs);
        };

        recorder.start(100);
        setIsRecording(true);
        setRecordingMs(0);
        playWalkieBeep('start');

        recordTickRef.current = setInterval(() => {
          setRecordingMs(Date.now() - recordStartRef.current);
        }, 100);

        autoStopTimerRef.current = setTimeout(() => {
          stopRecording();
        }, MAX_RECORD_MS);
      } catch {
        isPressingRef.current = false;
        stopTracksImmediately();
        setIsRecording(false);
        onShowToast?.('⚠️ សូមអនុញ្ញាត Microphone ដើម្បីប្រើវិទ្យុទាក់ទង', 'error');
      }
    },
    [
      getOrCreateAudioEl,
      isRecording,
      isSending,
      onShowToast,
      sendRecordedClip,
      stopRecording,
      stopTracksImmediately
    ]
  );

  const handleSendWhistle = useCallback(async () => {
    if (whistleCooldown) return;
    unlockAudioContext();
    playCoachWhistle();

    setWhistleCooldown(true);
    setTimeout(() => setWhistleCooldown(false), 1200);

    try {
      const resp = await fetch('/api/walkie/whistle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: packerName || 'Admin',
          senderRole: userRole,
          senderClientId: clientIdRef.current,
          targetType: resolvedTarget.targetType === 'staff' ? 'staff' : 'all',
          targetName: resolvedTarget.targetType === 'staff' ? resolvedTarget.targetName : ''
        })
      });
      if (resp.ok) {
        if (resolvedTarget.targetType === 'staff') {
          onShowToast?.(`🪈 បានផ្លុំកញ្ចែចំទៅ ${resolvedTarget.targetName}!`, 'success');
        } else {
          onShowToast?.('🪈 បានផ្លុំកញ្ចែដេញជើងទៅបុគ្គលិកទាំងអស់!', 'success');
        }
      }
    } catch {
      onShowToast?.('⚠️ មិនអាចផ្ញើសញ្ញាកញ្ចែបានទេ', 'error');
    }
  }, [
    onShowToast,
    packerName,
    resolvedTarget.targetName,
    resolvedTarget.targetType,
    userRole,
    whistleCooldown
  ]);

  const handleToggleMute = useCallback(() => {
    unlockAudioContext();
    getOrCreateAudioEl();
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    try {
      localStorage.setItem('walkie_muted', String(next));
    } catch {}
    onShowToast?.(
      next ? '🔇 បានបិទសំឡេងវិទ្យុទាក់ទងបណ្ដោះអាសន្ន' : '🔊 បានបើកសំឡេងវិទ្យុទាក់ទងវិញហើយ',
      'info'
    );
  }, [getOrCreateAudioEl, isMuted, onShowToast]);

  const secondsText = (recordingMs / 1000).toFixed(1);
  const pttLabel =
    resolvedTarget.targetType === 'staff'
      ? `និយាយទៅ ${resolvedTarget.targetName}`
      : resolvedTarget.targetType === 'admin'
      ? 'និយាយទៅ Admin'
      : 'កាន់និយាយ';

  return (
    <div className="flex flex-col gap-1.5">
      {/* Main Compact Walkie-Talkie Control Strip */}
      <div
        className={`border px-2 py-1.5 rounded-2xl shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-colors ${
          isPrivateTarget
            ? 'bg-gradient-to-r from-[#120A2A]/95 via-[#171238]/95 to-[#060D1E]/95 border-violet-500/60'
            : 'bg-gradient-to-r from-[#060D1E]/95 via-[#0B1732]/95 to-[#060D1E]/95 border-[#1B2F55]'
        }`}
      >
        {/* Recipient Channel Picker (1-on-1 Private OR All Channel) */}
        <select
          value={selectedTarget}
          onChange={e => {
            unlockAudioContext();
            setSelectedTarget(e.target.value);
          }}
          aria-label="ជ្រើសអ្នកទទួលសំឡេងវិទ្យុ"
          className={`h-9 max-w-[122px] sm:max-w-[140px] px-2 rounded-xl text-[11px] font-black border outline-none cursor-pointer truncate flex-shrink-0 transition-colors ${
            isPrivateTarget
              ? 'bg-violet-950/90 border-violet-400/70 text-violet-100'
              : 'bg-[#081226] border-[#253C68] text-slate-200 hover:border-cyan-400/60'
          }`}
          title="ជ្រើសនិយាយរួម ឬចំឈ្មោះម្នាក់ៗ"
        >
          <option value="all">
            {userRole === 'admin'
              ? `📢 ទាំងអស់${staffList.some(s => s.online) ? ` (🟢 ${staffList.filter(s => s.online).length})` : ''}`
              : '📢 ទាំងអស់'}
          </option>
          {userRole === 'admin' ? (
            staffList.map(st => (
              <option key={st.name} value={`staff:${st.name}`}>
                {st.online ? '🟢' : '⚪'} {st.name}
              </option>
            ))
          ) : (
            <option value="admin">👑 Admin ផ្ទាល់</option>
          )}
        </select>

        {/* Hold-to-Talk Push-To-Talk Button (2-way Admin <-> Staff) */}
        <button
          type="button"
          onPointerDown={handleStartPTT}
          onPointerUp={stopRecording}
          onPointerCancel={stopRecording}
          onContextMenu={e => e.preventDefault()}
          disabled={isSending}
          className={`flex-1 min-w-0 h-9 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 select-none touch-none transition-all cursor-pointer ${
            isRecording
              ? 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-600 border border-rose-300 text-white shadow-[0_0_16px_rgba(244,63,94,0.65)] scale-[0.99]'
              : isSending
              ? 'bg-slate-800 border border-slate-600 text-slate-300 cursor-wait'
              : isPrivateTarget
              ? 'bg-gradient-to-r from-violet-900/90 via-indigo-900/90 to-violet-900/90 hover:from-violet-800 hover:to-indigo-800 border border-violet-400/60 text-violet-100 active:scale-95'
              : 'bg-gradient-to-r from-sky-950/90 via-cyan-950/85 to-sky-950/90 hover:from-sky-900 hover:to-cyan-900 border border-cyan-500/50 hover:border-cyan-400 text-cyan-100 active:scale-95'
          }`}
          title="សង្កត់ជាប់ដើម្បីនិយាយវិទ្យុទាក់ទង (អតិបរមា 20 វិនាទី)"
        >
          {isRecording ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping flex-shrink-0" />
              <span className="truncate">{secondsText}s • ព្រលែងដើម្បីផ្ញើ</span>
            </>
          ) : isSending ? (
            <>
              <span className="animate-spin flex-shrink-0">⏳</span>
              <span className="truncate">កំពុងបញ្ជូន...</span>
            </>
          ) : (
            <>
              <span className="text-sm flex-shrink-0">{isPrivateTarget ? '🔒' : '🎙️'}</span>
              <span className="truncate">{pttLabel}</span>
            </>
          )}
        </button>

        {/* Admin-Only Instant Coach Whistle Nudge Button */}
        {userRole === 'admin' && (
          <button
            type="button"
            onClick={handleSendWhistle}
            disabled={whistleCooldown}
            className={`h-9 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 border transition-all flex-shrink-0 cursor-pointer active:scale-95 ${
              whistleCooldown
                ? 'bg-amber-700/60 border-amber-400 text-amber-200'
                : 'bg-gradient-to-r from-amber-600/90 to-orange-600/90 hover:from-amber-500 hover:to-orange-500 border-amber-400/80 text-white shadow-[0_0_12px_rgba(245,158,11,0.35)]'
            }`}
            title={
              resolvedTarget.targetType === 'staff'
                ? `ផ្លុំកញ្ចែចំទៅ ${resolvedTarget.targetName}`
                : 'ផ្លុំកញ្ចែដេញជើងបុគ្គលិកទាំងអស់'
            }
          >
            <span className="text-sm">🪈</span>
            <span>កញ្ចែ</span>
          </button>
        )}

        {/* Speaker Mute / Unmute Toggle */}
        <button
          type="button"
          onClick={handleToggleMute}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center text-sm transition-all flex-shrink-0 cursor-pointer active:scale-95 ${
            isMuted
              ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
              : 'bg-slate-900/90 border-slate-700 hover:border-cyan-400/60 text-emerald-300'
          }`}
          title={isMuted ? 'បើកសំឡេងវិទ្យុទាក់ទងវិញ' : 'បិទសំឡេងវិទ្យុទាក់ទងបណ្ដោះអាសន្ន'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Incoming Coach Whistle Alert Banner */}
      {activeWhistle && (
        <div className="bg-gradient-to-r from-amber-950/95 via-orange-950/95 to-rose-950/95 border border-amber-400 px-3 py-2 rounded-2xl shadow-lg flex items-center justify-between gap-2 animate-pulse">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">🪈</span>
            <div className="text-xs font-black text-amber-200 truncate">
              {activeWhistle.isPrivate
                ? `🔒 ${activeWhistle.senderName} ផ្លុំកញ្ចែហៅអ្នកផ្ទាល់! ប្រញាប់រើសអីវ៉ាន់ 🔥`
                : `${activeWhistle.senderName} ផ្លុំកញ្ចែដេញជើង! ប្រញាប់រើសអីវ៉ាន់ 🔥`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveWhistle(null)}
            className="text-amber-300 hover:text-white text-xs font-black px-1.5 py-0.5 rounded-lg hover:bg-white/10 cursor-pointer flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Incoming Voice Message Banner (Playback Status / Autoplay Fallback / Replay) */}
      {activeVoice && (
        <div
          className={`px-3 py-1.5 rounded-2xl border flex items-center justify-between gap-2 shadow-md transition-all ${
            activeVoice.status === 'playing'
              ? 'bg-gradient-to-r from-cyan-950/95 to-blue-950/95 border-cyan-400 text-cyan-100'
              : activeVoice.status === 'blocked'
              ? 'bg-gradient-to-r from-rose-950/95 to-amber-950/95 border-amber-400 text-amber-100 animate-pulse'
              : 'bg-[#09152B]/95 border-[#1E355E] text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm flex-shrink-0">
              {activeVoice.clip.senderRole === 'admin' ? '👑' : '👤'}
            </span>
            <div className="text-xs font-bold truncate flex items-center gap-1.5">
              {activeVoice.clip.targetType && activeVoice.clip.targetType !== 'all' && (
                <span className="px-1.5 py-0.5 rounded-md bg-violet-600/40 border border-violet-400/60 text-violet-200 text-[10px] font-black flex-shrink-0">
                  🔒 ផ្ទាល់
                </span>
              )}
              <span className="font-black text-white">{activeVoice.clip.senderName}</span>
              {activeVoice.status === 'playing' && (
                <span className="text-cyan-300">កំពុងនិយាយ...</span>
              )}
              {activeVoice.status === 'blocked' && (
                <span className="text-amber-300">ផ្ញើសំឡេងមក (ចុចដើម្បីស្ដាប់)</span>
              )}
              {activeVoice.status === 'muted' && (
                <span className="text-slate-400">ផ្ញើសំឡេងមក (កំពុង Mute)</span>
              )}
              {activeVoice.status === 'done' && (
                <span className="text-emerald-300">
                  បាននិយាយ ({Math.max(1, Math.round(activeVoice.clip.durationMs / 1000))}s)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleManualPlayClip(activeVoice.clip)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer active:scale-95 transition-all ${
                activeVoice.status === 'blocked'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 text-cyan-200'
              }`}
            >
              <span>{activeVoice.status === 'done' ? '🔁' : '🔊'}</span>
              <span>{activeVoice.status === 'done' ? 'ស្ដាប់ម្ដងទៀត' : 'ស្ដាប់'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveVoice(null)}
              className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded-lg hover:bg-white/10 cursor-pointer"
              title="បិទ"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
