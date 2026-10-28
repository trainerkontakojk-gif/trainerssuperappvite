type AudioRender = {
  frames: readonly number[];
  samples: readonly number[];
  rate: number;
};

/** Measure one frequency over an audio-thread render interval. */
export function measureRenderedFrequency(
  render: AudioRender,
  frequency: number,
  fromSeconds: number,
  toSeconds: number,
): { rms: number; count: number } {
  const from = Math.round(fromSeconds * render.rate);
  const to = Math.round(toSeconds * render.rate);
  let real = 0;
  let imaginary = 0;
  let count = 0;

  render.frames.forEach((frame, block) => {
    for (let index = 0; index < 128; index += 1) {
      const at = frame + index;
      if (at < from || at >= to) continue;
      const sample = render.samples[block * 128 + index];
      const phase = (2 * Math.PI * frequency * at) / render.rate;
      real += sample * Math.cos(phase);
      imaginary += sample * Math.sin(phase);
      count += 1;
    }
  });

  return {
    rms:
      count === 0
        ? Number.NaN
        : (Math.hypot(real, imaginary) * Math.SQRT2) / count,
    count,
  };
}
