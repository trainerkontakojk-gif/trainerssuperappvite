/* global AudioWorkletProcessor, registerProcessor */

class TelefunAudioInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 4096;
    this.frame = new Float32Array(this.frameSize);
    this.frameOffset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }

    let sourceOffset = 0;
    while (sourceOffset < channel.length) {
      const copyLength = Math.min(
        channel.length - sourceOffset,
        this.frameSize - this.frameOffset,
      );
      this.frame.set(
        channel.subarray(sourceOffset, sourceOffset + copyLength),
        this.frameOffset,
      );
      sourceOffset += copyLength;
      this.frameOffset += copyLength;

      if (this.frameOffset === this.frameSize) {
        this.port.postMessage(this.frame);
        this.frame = new Float32Array(this.frameSize);
        this.frameOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor("telefun-audio-input-processor", TelefunAudioInputProcessor);
