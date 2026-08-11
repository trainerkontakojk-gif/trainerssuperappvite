import type {
  OpenAIWebRtcAudioContextLike,
  OpenAIWebRtcAudioNodeLike,
  OpenAIWebRtcDependencies,
  OpenAIWebRtcMediaRecorderLike,
  OpenAIWebRtcStreamLike,
} from "./contracts";

const RECORDING_TIMESLICE_MS = 1_000;
const RECORDING_STOP_TIMEOUT_MS = 5_000;
const VOLUME_SAMPLE_INTERVAL_MS = 100;
const MAX_VOLUME_SAMPLES = 1_000;
const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export interface OpenAIWebRtcRecordingResult {
  fullBlob: Blob | null;
  agentBlob: Blob | null;
  recordingError: Error | null;
}

function getDefaultAudioContext(): OpenAIWebRtcAudioContextLike | null {
  const contextWindow =
    typeof window === "undefined"
      ? undefined
      : (window as Window & {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        });
  const AudioContextCtor =
    contextWindow?.AudioContext ??
    contextWindow?.webkitAudioContext ??
    (typeof AudioContext === "undefined" ? undefined : AudioContext);
  if (!AudioContextCtor) return null;
  return new AudioContextCtor() as unknown as OpenAIWebRtcAudioContextLike;
}

function getDefaultMediaRecorder(
  stream: OpenAIWebRtcStreamLike,
  mimeType?: string,
): OpenAIWebRtcMediaRecorderLike {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Browser MediaRecorder is unavailable.");
  }
  return new MediaRecorder(
    stream as unknown as MediaStream,
    mimeType ? { mimeType } : undefined,
  ) as unknown as OpenAIWebRtcMediaRecorderLike;
}

function isMimeTypeSupported(
  deps: OpenAIWebRtcDependencies,
  mimeType: string,
): boolean {
  try {
    if (deps.mediaRecorderIsTypeSupported) {
      return deps.mediaRecorderIsTypeSupported(mimeType);
    }
    if (typeof MediaRecorder === "undefined") return false;
    return MediaRecorder.isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

function createObjectUrl(deps: OpenAIWebRtcDependencies, blob: Blob): string {
  if (deps.createObjectURL) return deps.createObjectURL(blob);
  try {
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

function revokeObjectUrl(deps: OpenAIWebRtcDependencies, url: string): void {
  if (deps.revokeObjectURL) {
    deps.revokeObjectURL(url);
    return;
  }
  URL.revokeObjectURL(url);
}

function safeDisconnect(node: OpenAIWebRtcAudioNodeLike | null): void {
  try {
    node?.disconnect?.();
  } catch {
    /* best-effort graph cleanup */
  }
}

export class OpenAIWebRtcRecordingGraph {
  private context: OpenAIWebRtcAudioContextLike | null = null;
  private localSource: OpenAIWebRtcAudioNodeLike | null = null;
  private remoteSource: OpenAIWebRtcAudioNodeLike | null = null;
  private analyser:
    | (OpenAIWebRtcAudioNodeLike & {
        fftSize: number;
        frequencyBinCount: number;
        getByteTimeDomainData(data: Uint8Array): void;
      })
    | null = null;
  private fullDestination: { stream: OpenAIWebRtcStreamLike } | null = null;
  private agentDestination: { stream: OpenAIWebRtcStreamLike } | null = null;
  private fullRecorder: OpenAIWebRtcMediaRecorderLike | null = null;
  private agentRecorder: OpenAIWebRtcMediaRecorderLike | null = null;
  private fullRecordingMimeType = "";
  private agentRecordingMimeType = "";
  private readonly fullChunks: Blob[] = [];
  private readonly agentChunks: Blob[] = [];
  private readonly volumeSamples: number[] = [];
  private volumeTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private disposed = false;
  private recordingError: Error | null = null;

  constructor(
    private readonly deps: OpenAIWebRtcDependencies,
    private readonly onVolumeChange: (volume: number) => void = () => {},
  ) {}

  public async start(localStream: OpenAIWebRtcStreamLike): Promise<boolean> {
    if (this.started || this.disposed) return this.started;
    this.started = true;

    try {
      this.context =
        this.deps.audioContextFactory?.() ?? getDefaultAudioContext();
      if (!this.context) {
        throw new Error("Browser AudioContext is unavailable.");
      }
      if (this.context.state && this.context.state !== "running") {
        if (!this.context.resume) {
          throw new Error("Recording AudioContext could not be resumed.");
        }
        await this.context.resume();
        if (this.context.state && this.context.state !== "running") {
          throw new Error("Recording AudioContext remains suspended.");
        }
      }

      this.localSource = this.context.createMediaStreamSource(localStream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.fullDestination = this.context.createMediaStreamDestination();
      this.agentDestination = this.context.createMediaStreamDestination();

      this.localSource.connect(this.analyser);
      this.localSource.connect(this.fullDestination);
      this.localSource.connect(this.agentDestination);

      const mimeTypes = RECORDING_MIME_CANDIDATES.filter((mimeType) =>
        isMimeTypeSupported(this.deps, mimeType),
      );
      const fullRecording = this.createRecorder(
        this.fullDestination.stream,
        mimeTypes,
        this.fullChunks,
      );
      this.fullRecorder = fullRecording.recorder;
      this.fullRecordingMimeType = fullRecording.mimeType;
      const agentRecording = this.createRecorder(
        this.agentDestination.stream,
        mimeTypes,
        this.agentChunks,
      );
      this.agentRecorder = agentRecording.recorder;
      this.agentRecordingMimeType = agentRecording.mimeType;
      this.fullRecorder.start(RECORDING_TIMESLICE_MS);
      this.agentRecorder.start(RECORDING_TIMESLICE_MS);
      this.startVolumeSampling();
      return true;
    } catch (error) {
      this.recordingError =
        error instanceof Error
          ? error
          : new Error("WebRTC recording setup failed.");
      this.stopVolumeSampling();
      this.stopActiveRecorders([this.fullRecorder, this.agentRecorder]);
      return false;
    }
  }

  public attachRemoteStream(remoteStream: OpenAIWebRtcStreamLike): void {
    if (!this.context || !this.fullDestination || this.remoteSource) return;
    try {
      this.remoteSource = this.context.createMediaStreamSource(remoteStream);
      this.remoteSource.connect(this.fullDestination);
    } catch (error) {
      this.recordingError =
        error instanceof Error
          ? error
          : new Error("Remote WebRTC recording setup failed.");
    }
  }

  public async stop(): Promise<OpenAIWebRtcRecordingResult> {
    if (!this.started) {
      return {
        fullBlob: null,
        agentBlob: null,
        recordingError: this.recordingError,
      };
    }

    this.stopVolumeSampling();
    const recorders = [this.fullRecorder, this.agentRecorder].filter(
      (recorder): recorder is OpenAIWebRtcMediaRecorderLike =>
        recorder !== null,
    );
    await this.awaitRecorderStops(recorders);

    return {
      fullBlob: this.fullChunks.length
        ? new Blob(this.fullChunks, {
            type: this.resolveBlobMimeType(
              this.fullRecordingMimeType,
              this.fullChunks,
            ),
          })
        : null,
      agentBlob: this.agentChunks.length
        ? new Blob(this.agentChunks, {
            type: this.resolveBlobMimeType(
              this.agentRecordingMimeType,
              this.agentChunks,
            ),
          })
        : null,
      recordingError: this.recordingError,
    };
  }

  public getVolumeSamples(): number[] {
    return [...this.volumeSamples];
  }

  public createFullObjectUrl(blob: Blob | null): string | null {
    if (!blob) return null;
    const url = createObjectUrl(this.deps, blob);
    return url || null;
  }

  public revokeObjectUrl(url: string | null): void {
    if (!url) return;
    try {
      revokeObjectUrl(this.deps, url);
    } catch {
      /* object URL cleanup is best-effort */
    }
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopVolumeSampling();
    if (this.fullRecorder) {
      this.fullRecorder.ondataavailable = null;
      this.fullRecorder.onstop = null;
    }
    if (this.agentRecorder) {
      this.agentRecorder.ondataavailable = null;
      this.agentRecorder.onstop = null;
    }
    this.stopActiveRecorders([this.fullRecorder, this.agentRecorder]);
    safeDisconnect(this.remoteSource);
    safeDisconnect(this.localSource);
    safeDisconnect(this.analyser);
    this.remoteSource = null;
    this.localSource = null;
    this.analyser = null;
    const context = this.context;
    this.context = null;
    if (context) {
      try {
        await context.close();
      } catch {
        /* best-effort audio context cleanup */
      }
    }
  }

  private createRecorder(
    stream: OpenAIWebRtcStreamLike,
    supportedMimeTypes: readonly string[],
    chunks: Blob[],
  ): { recorder: OpenAIWebRtcMediaRecorderLike; mimeType: string } {
    const candidates: Array<string | undefined> = [
      ...supportedMimeTypes,
      undefined,
    ];
    let lastError: unknown = null;
    for (const mimeType of candidates) {
      try {
        const recorder = this.deps.mediaRecorderFactory
          ? this.deps.mediaRecorderFactory(
              stream,
              mimeType ? { mimeType } : undefined,
            )
          : getDefaultMediaRecorder(stream, mimeType);
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        return {
          recorder,
          mimeType: recorder.mimeType?.trim() || mimeType || "",
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("No supported MediaRecorder variant is available.");
  }

  private resolveBlobMimeType(
    selectedMimeType: string,
    chunks: Blob[],
  ): string {
    if (selectedMimeType) return selectedMimeType;
    return chunks.find((chunk) => chunk.type)?.type ?? "";
  }

  private async awaitRecorderStops(
    recorders: OpenAIWebRtcMediaRecorderLike[],
  ): Promise<void> {
    const stopPromises = recorders.map(
      (recorder) =>
        new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          recorder.onstop = finish;
          if (recorder.state === "inactive") {
            finish();
            return;
          }
          try {
            recorder.stop();
          } catch (error) {
            this.recordingError ??=
              error instanceof Error
                ? error
                : new Error("WebRTC recorder stop failed.");
            finish();
          }
        }),
    );

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([
      Promise.all(stopPromises).then(() => undefined),
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          this.recordingError ??= new Error("WebRTC recording stop timed out.");
          resolve();
        }, RECORDING_STOP_TIMEOUT_MS);
      }),
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    this.stopActiveRecorders(recorders);
  }

  private stopActiveRecorders(
    recorders: Array<OpenAIWebRtcMediaRecorderLike | null>,
  ): void {
    for (const recorder of recorders) {
      if (!recorder || recorder.state === "inactive") continue;
      try {
        recorder.stop();
      } catch (error) {
        this.recordingError ??=
          error instanceof Error
            ? error
            : new Error("WebRTC recorder stop failed.");
      }
    }
  }

  private startVolumeSampling(): void {
    if (!this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.volumeTimer = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const sample of data) {
        const amplitude = Math.abs(sample - 128) / 128;
        sumSquares += amplitude * amplitude;
      }
      const volume = Math.min(
        100,
        Math.round(Math.sqrt(sumSquares / Math.max(1, data.length)) * 180),
      );
      if (this.volumeSamples.length < MAX_VOLUME_SAMPLES) {
        this.volumeSamples.push(volume);
      }
      try {
        this.onVolumeChange(volume);
      } catch {
        /* observer callbacks do not control recording */
      }
    }, VOLUME_SAMPLE_INTERVAL_MS);
  }

  private stopVolumeSampling(): void {
    if (this.volumeTimer) {
      clearInterval(this.volumeTimer);
      this.volumeTimer = null;
    }
  }
}

export function calculateRecordingVolumeConsistency(
  volumeSamples: number[],
): number {
  if (volumeSamples.length === 0) return 0;
  const mean =
    volumeSamples.reduce((total, volume) => total + volume, 0) /
    volumeSamples.length;
  if (mean === 0) return 0;
  const variance =
    volumeSamples.reduce((total, volume) => total + (volume - mean) ** 2, 0) /
    volumeSamples.length;
  return Math.max(0, Math.min(100, 100 * (1 - Math.sqrt(variance) / mean)));
}
