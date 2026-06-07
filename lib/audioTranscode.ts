import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const AUDIO_TMP_PREFIX = "speaking-coach-audio-";

export async function transcodeToAzureWav(inputBuffer: Buffer, extension = "webm") {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is not available.");
  }

  const workDir = path.join(tmpdir(), `${AUDIO_TMP_PREFIX}${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webm";
  const inputPath = path.join(workDir, `input.${safeExtension}`);
  const outputPath = path.join(workDir, "output.wav");

  try {
    await writeFile(inputPath, inputBuffer);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-sample_fmt",
      "s16",
      "-f",
      "wav",
      outputPath
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function transcodeToPcm16k(inputBuffer: Buffer, extension = "webm") {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is not available.");
  }

  const workDir = path.join(tmpdir(), `${AUDIO_TMP_PREFIX}${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webm";
  const inputPath = path.join(workDir, `input.${safeExtension}`);
  const outputPath = path.join(workDir, "output.pcm");

  try {
    await writeFile(inputPath, inputBuffer);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-sample_fmt",
      "s16",
      "-f",
      "s16le",
      outputPath
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath as string, args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`Audio transcode failed: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

export function getAudioExtension(file: File) {
  const nameExtension = file.name.split(".").pop();
  if (nameExtension && nameExtension !== file.name) return nameExtension;
  if (file.type.includes("webm")) return "webm";
  if (file.type.includes("ogg")) return "ogg";
  if (file.type.includes("mpeg") || file.type.includes("mp3")) return "mp3";
  if (file.type.includes("wav")) return "wav";
  return "webm";
}
