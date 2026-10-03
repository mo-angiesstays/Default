import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Video → still frames.
 *
 * The Messages API takes images, not video, so a walkthrough has to be
 * decomposed before it can be looked at. Sampling rather than sending every
 * frame is also what keeps this affordable: a 2-minute clip at 30fps is 3,600
 * frames, and one every three seconds says the same thing for 1/90th of the
 * cost.
 */

export type ExtractedFrame = {
  /** Seconds into the clip, so findings can cite a timestamp. */
  atSeconds: number;
  base64: string;
  mediaType: "image/jpeg";
};

export type VideoInfo = {
  durationSeconds: number;
  width: number;
  height: number;
};

export class FfmpegMissingError extends Error {
  constructor() {
    super(
      "ffmpeg is not installed on this server, so video can't be analysed. " +
        "Photos still work. Install ffmpeg to enable walkthrough analysis.",
    );
    this.name = "FfmpegMissingError";
  }
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function probe(videoPath: string): Promise<VideoInfo> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "format=duration:stream=width,height",
    "-of", "json",
    videoPath,
  ]).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new FfmpegMissingError();
    throw error;
  });

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: { width?: number; height?: number }[];
  };

  return {
    durationSeconds: Number(parsed.format?.duration ?? 0),
    width: parsed.streams?.[0]?.width ?? 0,
    height: parsed.streams?.[0]?.height ?? 0,
  };
}

/**
 * Pulls one frame every `everySeconds`, scaled down and JPEG-encoded.
 *
 * `maxFrames` is a hard spend ceiling, not a nicety — without it a long clip
 * silently turns into a very expensive request. When a video is longer than
 * the cap allows, the interval is widened so the frames still span the whole
 * clip rather than covering only the opening.
 */
export async function extractFrames(
  videoPath: string,
  options?: { everySeconds?: number; maxFrames?: number; maxEdge?: number },
): Promise<{ frames: ExtractedFrame[]; info: VideoInfo; intervalSeconds: number }> {
  const maxFrames = options?.maxFrames ?? 20;
  const maxEdge = options?.maxEdge ?? 1024;
  const requested = options?.everySeconds ?? 3;

  const info = await probe(videoPath);
  const duration = Math.max(info.durationSeconds, 1);

  const interval =
    duration / requested > maxFrames ? Math.ceil(duration / maxFrames) : requested;

  const dir = await mkdtemp(path.join(tmpdir(), "turnkeep-frames-"));
  try {
    await run("ffmpeg", [
      "-v", "error",
      "-i", videoPath,
      "-vf", `fps=1/${interval},scale='min(${maxEdge},iw)':-2`,
      "-frames:v", String(maxFrames),
      "-q:v", "4",
      path.join(dir, "frame-%03d.jpg"),
    ]);

    const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
    const frames: ExtractedFrame[] = [];

    for (const [index, file] of files.entries()) {
      frames.push({
        // ffmpeg's fps filter emits the first frame at t=0.
        atSeconds: Math.round(index * interval),
        base64: (await readFile(path.join(dir, file))).toString("base64"),
        mediaType: "image/jpeg",
      });
    }

    return { frames, info, intervalSeconds: interval };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
