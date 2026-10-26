import { env, pipeline } from "./vendor/transformers.web.min.js";

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./vendor/", import.meta.url).href;

let transcriberPromise;

self.addEventListener("message", async (event) => {
  if (event.data?.type !== "analyze") return;

  try {
    const device = self.navigator.gpu ? "webgpu" : "wasm";
    if (!transcriberPromise) {
      transcriberPromise = pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-base_timestamped",
        {
          device,
          dtype: device === "webgpu"
            ? { encoder_model: "fp16", decoder_model_merged: "q4f16" }
            : "q8",
          progress_callback: (progress) => {
            self.postMessage({
              type: "progress",
              status: progress.status ?? "loading",
              file: progress.file ?? "",
              progress: Number(progress.progress),
            });
          },
        },
      );
    }

    const transcriber = await transcriberPromise;
    self.postMessage({ type: "stage", title: "Слушаю песню…", detail: "Распознаю слова и их время" });
    const options = {
      chunk_length_s: 29,
      stride_length_s: 5,
      return_timestamps: "word",
      task: "transcribe",
    };
    if (event.data.language) options.language = event.data.language;

    const output = await transcriber(event.data.audio, options);
    self.postMessage({
      type: "complete",
      chunks: output.chunks ?? [],
      text: output.text ?? "",
    });
  } catch (error) {
    transcriberPromise = undefined;
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Не удалось распознать аудио.",
    });
  }
});
