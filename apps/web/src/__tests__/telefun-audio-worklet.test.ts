import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("TelefunAudioInputProcessor", () => {
  it("buffers render quanta into 4096-sample microphone frames", () => {
    let Processor:
      | (new () => {
          port: { postMessage: ReturnType<typeof vi.fn> };
          process: (inputs: Float32Array[][]) => boolean;
        })
      | null = null;

    class AudioWorkletProcessorStub {
      port = { postMessage: vi.fn() };
    }

    const source = readFileSync(
      resolve(process.cwd(), "public/audio-input-processor.js"),
      "utf8",
    );
    const evaluate = new Function(
      "AudioWorkletProcessor",
      "registerProcessor",
      source,
    );
    evaluate(
      AudioWorkletProcessorStub,
      (_name: string, RegisteredProcessor: typeof Processor) => {
        Processor = RegisteredProcessor;
      },
    );

    expect(Processor).not.toBeNull();
    const processor = new Processor!();
    const quantum = new Float32Array(128).fill(0.25);

    for (let index = 0; index < 31; index += 1) {
      expect(processor.process([[quantum]])).toBe(true);
    }
    expect(processor.port.postMessage).not.toHaveBeenCalled();

    expect(processor.process([[quantum]])).toBe(true);
    expect(processor.port.postMessage).toHaveBeenCalledTimes(1);
    expect(processor.port.postMessage.mock.calls[0][0]).toHaveLength(4096);
  });
});
