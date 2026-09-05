import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  AlertCircle,
  MonitorUp,
  Minimize2,
  Maximize2,
  PictureInPicture,
  Music,
  Activity,
  RefreshCw
} from 'lucide-react';
import { CallSession, UserProfile, RtcCandidate } from '../types';
import { soundService } from '../services/audioService';
import { chatService } from '../services/chatService';

interface CallModalProps {
  call: CallSession;
  currentUser: UserProfile;
  onEndCall: (durationSec?: number) => void;
  onAcceptCall?: () => void;
}

// Multi-STUN + OpenRelay TURN configuration to guarantee NAT & firewall traversal
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ],
  iceCandidatePoolSize: 10
};

export const CallModal: React.FC<CallModalProps> = ({
  call,
  currentUser,
  onEndCall,
  onAcceptCall
}) => {
  const isCaller = call.callerId === currentUser.uid;
  const targetName = isCaller ? call.receiverName : call.callerName;
  const targetAvatar = isCaller ? call.receiverAvatar : call.callerAvatar;

  const [callStatus, setCallStatus] = useState<'dialing' | 'incoming' | 'connected' | 'ended'>(
    call.status === 'connected' ? 'connected' : (call.status === 'incoming' || !isCaller ? 'incoming' : 'dialing')
  );
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoOn, setIsVideoOn] = useState<boolean>(call.type === 'video');
  const [duration, setDuration] = useState<number>(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Refs for WebRTC and media elements
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const durationTimerRef = useRef<number | null>(null);
  const processedCandidates = useRef<Set<string>>(new Set());
  const activeCallIdRef = useRef<string>(call.id);
  const isTerminatedRef = useRef<boolean>(false);

  activeCallIdRef.current = call.id;

  // Helper: Get user media safely with fallback
  const acquireMediaStream = async (withVideo: boolean): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Медиаустройства недоступны в текущем браузере');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      return stream;
    } catch (err: unknown) {
      console.warn('Media access warning (fallback enabled):', err);
      // Try audio-only if video failed
      if (withVideo) {
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setIsVideoOn(false);
          return audioOnlyStream;
        } catch {
          // Both failed (e.g. no hardware / permission denied)
        }
      }
      setMediaError('Доступ к микрофону/камере ограничен. Звонок продолжается.');
      return null;
    }
  };

  // Setup WebRTC Peer Connection
  const initializePeerConnection = (role: 'caller' | 'receiver', stream: MediaStream | null): RTCPeerConnection => {
    if (pcRef.current) {
      return pcRef.current;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Add local tracks if available
    if (stream) {
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
      if (localVideoRef.current && call.type === 'video') {
        localVideoRef.current.srcObject = stream;
      }
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      remoteStreamRef.current = remoteStream;

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }

      if (remoteVideoRef.current && call.type === 'video') {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
        setHasRemoteVideo(true);
      }
    };

    // Send local ICE candidates to Firestore
    pc.onicecandidate = (event) => {
      if (event.candidate && activeCallIdRef.current) {
        const rtcCand: RtcCandidate = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        };
        chatService.addCallCandidate(activeCallIdRef.current, role, rtcCand);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        soundService.stopAll();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Handle disconnect if needed
      }
    };

    return pc;
  };

  // CALLER FLOW: on mount if caller, initialize offer
  useEffect(() => {
    if (!isCaller) return;

    let isMounted = true;
    soundService.startDialTone();

    const startOutgoingCall = async () => {
      const stream = await acquireMediaStream(call.type === 'video');
      if (!isMounted) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      const pc = initializePeerConnection('caller', stream);

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: call.type === 'video'
        });
        await pc.setLocalDescription(offer);

        await chatService.updateCall(call.id, {
          offer: { type: offer.type, sdp: offer.sdp }
        });
      } catch (err) {
        console.warn('Error creating WebRTC offer:', err);
      }
    };

    startOutgoingCall();

    return () => {
      isMounted = false;
      soundService.stopAll();
    };
  }, [isCaller, call.id, call.type]);

  // RECEIVER FLOW: on mount if receiver and incoming
  useEffect(() => {
    if (isCaller) return;
    if (callStatus === 'incoming') {
      soundService.startIncomingRingtone();
      return () => soundService.stopAll();
    }
  }, [isCaller, callStatus]);

  // Listen to Firestore Call updates (Answer, Status, ICE candidates)
  useEffect(() => {
    const unsubscribe = chatService.subscribeToCall(call.id, async (updatedCall) => {
      if (!updatedCall) {
        handleRemoteEnd();
        return;
      }

      // Check if call was ended or declined remotely
      if (updatedCall.status === 'ended' || updatedCall.status === 'declined') {
        handleRemoteEnd();
        return;
      }

      const pc = pcRef.current;

      // Caller handles answer
      if (isCaller && updatedCall.answer && pc && (!pc.remoteDescription || pc.signalingState === 'have-local-offer')) {
        try {
          const remoteDesc = new RTCSessionDescription({
            type: updatedCall.answer.type as RTCSdpType,
            sdp: updatedCall.answer.sdp
          });
          await pc.setRemoteDescription(remoteDesc);
          handleConnectedState();
        } catch (err) {
          console.warn('Setting remote description error:', err);
        }
      }

      // If receiver or caller, process new ICE candidates
      const candidatesToProcess = isCaller
        ? updatedCall.receiverCandidates
        : updatedCall.callerCandidates;

      if (candidatesToProcess && pc && pc.remoteDescription) {
        for (const c of candidatesToProcess) {
          const candidateKey = `${c.candidate}_${c.sdpMLineIndex}`;
          if (!processedCandidates.current.has(candidateKey)) {
            processedCandidates.current.add(candidateKey);
            try {
              await pc.addIceCandidate(new RTCIceCandidate({
                candidate: c.candidate,
                sdpMid: c.sdpMid,
                sdpMLineIndex: c.sdpMLineIndex ?? undefined
              }));
            } catch (candErr) {
              console.warn('ICE candidate addition notice:', candErr);
            }
          }
        }
      }

      // If status changed to connected
      if (updatedCall.status === 'connected' && callStatus !== 'connected') {
        handleConnectedState();
      }
    });

    return () => unsubscribe();
  }, [call.id, isCaller, callStatus]);

  // When call connects
  const handleConnectedState = () => {
    soundService.stopAll();
    soundService.playCallConnected();
    setCallStatus('connected');

    if (!durationTimerRef.current) {
      durationTimerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  // Receiver accepts the call
  const handleAccept = async () => {
    soundService.stopAll();
    if (onAcceptCall) {
      onAcceptCall();
    }

    const stream = await acquireMediaStream(call.type === 'video');
    const pc = initializePeerConnection('receiver', stream);

    try {
      if (call.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: call.offer.type as RTCSdpType,
          sdp: call.offer.sdp
        }));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await chatService.updateCall(call.id, {
          answer: { type: answer.type, sdp: answer.sdp },
          status: 'connected',
          connectedAt: Date.now()
        });
      } else {
        // Fallback if offer wasn't in snapshot yet: mark connected
        await chatService.updateCall(call.id, {
          status: 'connected',
          connectedAt: Date.now()
        });
      }

      handleConnectedState();
    } catch (err) {
      console.warn('Error accepting call:', err);
      handleConnectedState();
    }
  };

  // Safe unified termination (strictly at most once)
  const safeTerminate = (durationSec: number) => {
    if (isTerminatedRef.current) return;
    isTerminatedRef.current = true;

    soundService.stopAll();
    soundService.playCallEnded();
    setCallStatus('ended');
    cleanupMedia();

    setTimeout(() => {
      onEndCall(durationSec);
    }, 400);
  };

  const handleRemoteEnd = () => {
    safeTerminate(duration);
  };

  const handleEnd = async () => {
    if (isTerminatedRef.current) return;

    // Notify other party via Firestore
    try {
      await chatService.endCall(call.id, 'ended', duration);
    } catch (err) {
      console.warn('Call end notify error:', err);
    }

    safeTerminate(duration);
  };

  const cleanupMedia = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setIsScreenSharing(false);
  };

  // Background Audio & Mobile Minimization keepalive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // When user minimizes or switches apps on phone
        if (remoteAudioRef.current && remoteStreamRef.current) {
          remoteAudioRef.current.play().catch(() => {});
        }
        // If in video call and PiP is supported, auto-trigger PiP so call continues smoothly
        if (
          call.type === 'video' &&
          remoteVideoRef.current &&
          !document.pictureInPictureElement &&
          document.pictureInPictureEnabled
        ) {
          remoteVideoRef.current.requestPictureInPicture().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [call.type]);

  // Picture-in-Picture toggle (enables floating PiP overlay over all phone apps)
  const togglePictureInPicture = async () => {
    try {
      if (!document.pictureInPictureEnabled) {
        setMediaError('Режим «Картинка в картинке» не поддерживается в этом браузере');
        return;
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (remoteVideoRef.current) {
        await remoteVideoRef.current.requestPictureInPicture();
      } else if (localVideoRef.current) {
        await localVideoRef.current.requestPictureInPicture();
      }
    } catch (err: unknown) {
      console.warn('PiP notice:', err);
    }
  };

  // Screen Sharing System (демонстрация экрана)
  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    // Restore camera track if available, or remove video track
    const videoSender = pcRef.current?.getSenders().find((s) => s.track && s.track.kind === 'video');
    const localVideoTrack = localStreamRef.current?.getVideoTracks()[0];

    if (videoSender) {
      if (localVideoTrack && isVideoOn) {
        await videoSender.replaceTrack(localVideoTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      } else {
        await videoSender.replaceTrack(null);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
        }
        setIsVideoOn(false);
      }
    }

    setIsScreenSharing(false);
  };

  const startScreenShare = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setMediaError('Демонстрация экрана не поддерживается данным браузером или на этом устройстве');
        return;
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        } as MediaTrackConstraints,
        audio: false
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrack.onended = () => {
        stopScreenShare();
      };

      const senders = pcRef.current?.getSenders() || [];
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      } else if (pcRef.current) {
        pcRef.current.addTrack(screenTrack, screenStream);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);
      setIsVideoOn(true);
    } catch (err: unknown) {
      console.warn('Screen share notice/denied:', err);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  // Toggle microphone
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((t) => {
        t.enabled = isMuted; // toggle
      });
      setIsMuted(!isMuted);
    } else {
      setIsMuted(!isMuted);
    }
  };

  // Toggle video camera
  const toggleVideo = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((t) => {
          t.enabled = !isVideoOn;
        });
        setIsVideoOn(!isVideoOn);
      } else if (!isVideoOn) {
        // Attempt to request video track
        try {
          const newStream = await navigator.mediaDevices?.getUserMedia({ video: true });
          if (newStream) {
            const newTrack = newStream.getVideoTracks()[0];
            localStreamRef.current.addTrack(newTrack);
            if (pcRef.current) {
              pcRef.current.addTrack(newTrack, localStreamRef.current);
            }
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
            setIsVideoOn(true);
          }
        } catch {
          setIsVideoOn(false);
        }
      }
    } else {
      setIsVideoOn(!isVideoOn);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isMinimized) {
    return (
      <>
        {/* Remote audio must still play while minimized */}
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#121215]/95 border border-purple-500/40 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-3 backdrop-blur-xl max-w-sm w-[92vw] animate-in fade-in slide-in-from-top-3">
          <div className="relative flex-shrink-0 cursor-pointer" onClick={() => setIsMinimized(false)}>
            <div className="w-10 h-10 rounded-full overflow-hidden border border-purple-500/60 shadow-md">
              <img src={targetAvatar} alt={targetName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#121215]" />
          </div>

          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setIsMinimized(false)}>
            <div className="text-xs font-bold text-white truncate hover:text-purple-300 transition">
              {targetName}
            </div>
            <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {callStatus === 'connected' ? formatDuration(duration) : 'Вызов...'}
              {isScreenSharing && (
                <span className="text-[9px] bg-purple-600/30 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30 font-sans">
                  Экран
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={toggleMute}
              className={`p-2 rounded-xl transition cursor-pointer ${
                isMuted ? 'bg-red-900/50 text-red-300 border border-red-700/50' : 'bg-zinc-800 text-zinc-300 hover:text-white'
              }`}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsMinimized(false)}
              className="p-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 transition cursor-pointer"
              title="Развернуть звонок"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleEnd}
              className="p-2 rounded-xl bg-red-600 hover:bg-red-500 text-white transition shadow-md cursor-pointer"
              title="Завершить"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div id="call-modal-overlay" className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
      {/* Hidden Audio element for remote WebRTC audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="relative w-full max-w-md md:max-w-lg bg-[#0c0c0e] border border-zinc-800/80 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-between min-h-[540px] shadow-2xl shadow-purple-950/40 overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-800/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar header */}
        <div className="w-full flex items-center justify-between text-xs text-zinc-400 z-10 font-mono">
          <span className="flex items-center gap-2 font-medium tracking-wider uppercase text-[10px] text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
            {call.type === 'video' ? 'ВИДЕОВЫЗОВ' : 'ГОЛОСОВОЙ ВЫЗОВ'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePictureInPicture}
              className="p-1.5 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
              title="Картинка в картинке (поверх других приложений)"
            >
              <PictureInPicture className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
              title="Свернуть звонок в мини-окно для работы в мессенджере"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <span className="bg-zinc-800/60 border border-zinc-700/50 px-2 py-0.5 rounded-full text-[10px] text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              P2P
            </span>
          </div>
        </div>

        {/* Media Warning if browser permissions blocked */}
        {mediaError && (
          <div className="w-full mt-3 px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-800/40 text-amber-300 text-[11px] flex items-center gap-2 z-10">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{mediaError}</span>
          </div>
        )}

        {/* Center: Video streams or Avatar Dialing Visualizer */}
        <div className="flex flex-col items-center my-auto z-10 w-full">
          {call.type === 'video' && callStatus === 'connected' ? (
            <div className="relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-purple-500/30 bg-zinc-950 shadow-2xl flex items-center justify-center mb-4">
              {/* Remote Video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${!hasRemoteVideo ? 'hidden' : ''}`}
              />
              {!hasRemoteVideo && (
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-purple-500/50 mb-3 shadow-lg">
                    <img src={targetAvatar} alt={targetName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-xs text-zinc-400">Ожидание видеопотока собеседника...</span>
                </div>
              )}

              {/* Screen share status tag */}
              {isScreenSharing && (
                <div className="absolute top-3 left-3 bg-purple-900/80 border border-purple-500/50 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-purple-200 font-medium flex items-center gap-1.5 shadow-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <MonitorUp className="w-3 h-3 text-purple-300" />
                  Вы делитесь экраном
                </div>
              )}

              {/* Local Video Picture-in-Picture */}
              {isVideoOn && (
                <div className="absolute bottom-3 right-3 w-28 h-36 rounded-xl overflow-hidden border-2 border-purple-500 shadow-xl bg-black">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {isScreenSharing && (
                    <span className="absolute bottom-1 left-1 bg-black/70 text-[9px] text-white px-1 py-0.5 rounded">
                      Экран
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="relative mb-6">
              {/* Dialing pulse rings */}
              {(callStatus === 'dialing' || callStatus === 'incoming') && (
                <>
                  <div className="absolute -inset-4 rounded-full border border-purple-500/40 animate-ping opacity-60 pointer-events-none" />
                  <div className="absolute -inset-8 rounded-full border border-purple-600/30 animate-pulse pointer-events-none" />
                </>
              )}

              {call.type === 'video' && isVideoOn && localStreamRef.current ? (
                <div className="w-36 h-36 rounded-full overflow-hidden border-4 border-purple-500 shadow-xl relative bg-black">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-purple-600 shadow-2xl bg-zinc-900 shadow-purple-900/30">
                  <img
                    src={targetAvatar || 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80'}
                    alt={targetName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          )}

          <h3 className="text-2xl font-bold text-white tracking-tight mb-1">{targetName}</h3>

          {callStatus === 'dialing' && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-purple-400 font-medium animate-pulse text-sm uppercase tracking-widest font-mono">
                Гудки... Соединение
              </span>
              <span className="text-zinc-500 text-xs">Ожидание ответа абонента в сети</span>
              <div className="mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/40 text-purple-300 text-[11px] shadow-sm max-w-[90%] truncate">
                <Music className="w-3.5 h-3.5 text-purple-300 animate-pulse flex-shrink-0" />
                <span className="truncate">Мелодия вызова: {soundService.getRingtoneTitle()}</span>
              </div>
            </div>
          )}

          {callStatus === 'incoming' && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-purple-400 font-medium animate-bounce text-sm uppercase tracking-widest font-mono">
                Входящий вызов...
              </span>
              <span className="text-zinc-500 text-xs">
                {call.type === 'video' ? 'Видеозвонок' : 'Голосовой звонок'}
              </span>
              <div className="mt-2 flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/50 text-purple-200 text-[11px] shadow-md max-w-[90%] truncate">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping flex-shrink-0" />
                <Music className="w-3.5 h-3.5 text-purple-300 flex-shrink-0" />
                <span className="font-semibold truncate">Рингтон: {soundService.getRingtoneTitle()}</span>
              </div>
            </div>
          )}

          {callStatus === 'connected' && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-emerald-400 font-bold tracking-widest text-lg font-mono">
                {formatDuration(duration)}
              </span>
              {/* Subtle audio visualizer bars */}
              <div className="flex items-center gap-1 h-5">
                {[40, 75, 100, 60, 90, 45, 80].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}%` }}
                    className="w-1 bg-purple-500 rounded-full animate-pulse"
                  />
                ))}
              </div>
            </div>
          )}

          {callStatus === 'ended' && (
            <span className="text-red-400 font-medium text-sm">Вызов завершен</span>
          )}
        </div>

        {/* Bottom Call Controls */}
        <div className="w-full flex items-center justify-center gap-4 z-10">
          {callStatus === 'incoming' ? (
            <div className="flex items-center gap-8">
              <button
                id="btn-decline-call"
                onClick={handleEnd}
                className="flex flex-col items-center gap-2 group cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
                  <PhoneOff className="w-7 h-7" />
                </div>
                <span className="text-xs text-zinc-400">Отклонить</span>
              </button>

              <button
                id="btn-accept-call"
                onClick={handleAccept}
                className="flex flex-col items-center gap-2 group cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-900/50 transition-transform group-hover:scale-105 animate-pulse">
                  <Phone className="w-7 h-7" />
                </div>
                <span className="text-xs text-emerald-300 font-medium">Ответить</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button
                id="btn-toggle-mute"
                onClick={toggleMute}
                className={`p-4 rounded-full border transition cursor-pointer ${
                  isMuted
                    ? 'bg-red-950/80 border-red-700 text-red-300'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
                title={isMuted ? 'Включить микрофон' : 'Отключить микрофон'}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              <button
                id="btn-toggle-video"
                onClick={toggleVideo}
                className={`p-4 rounded-full border transition cursor-pointer ${
                  !isVideoOn
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
                title={isVideoOn ? 'Выключить камеру' : 'Включить камеру'}
              >
                {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
              </button>

              <button
                id="btn-toggle-screenshare"
                onClick={toggleScreenShare}
                className={`p-4 rounded-full border transition cursor-pointer ${
                  isScreenSharing
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/60 ring-2 ring-purple-400/50'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
                title={isScreenSharing ? 'Остановить демонстрацию экрана' : 'Демонстрация экрана'}
              >
                <MonitorUp className="w-6 h-6" />
              </button>

              <button
                id="btn-end-call"
                onClick={handleEnd}
                className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-950/80 transition-transform hover:scale-105 cursor-pointer ml-2"
                title="Завершить звонок"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
