/** Zero-dep audio duration readers: WAV (RIFF header) and MP3 (frame walk). */

export interface AudioInfo {
  format: "wav" | "mp3" | "unknown";
  durationMs: number;
  sampleRate?: number;
  channels?: number;
}

export function wavInfo(buf: Uint8Array): AudioInfo | undefined {
  if (buf.length < 44) return undefined;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return undefined;
  let off = 12, sampleRate = 0, channels = 0, bits = 16, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = tag(off), size = dv.getUint32(off + 4, true);
    if (id === "fmt ") {
      channels = dv.getUint16(off + 10, true);
      sampleRate = dv.getUint32(off + 12, true);
      bits = dv.getUint16(off + 22, true);
    } else if (id === "data") {
      dataLen = Math.min(size, buf.length - off - 8);
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!sampleRate || !channels) return undefined;
  const bytesPerSec = sampleRate * channels * (bits / 8);
  return { format: "wav", durationMs: Math.round((dataLen / bytesPerSec) * 1000), sampleRate, channels };
}

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Walk MPEG audio frames (Layer III, CBR or VBR) and sum their durations. Skips ID3v2. */
export function mp3Info(buf: Uint8Array): AudioInfo | undefined {
  let off = 0;
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f);
    off = 10 + size;
  }
  let frames = 0, samples = 0, sampleRate = 0, channels = 0;
  while (off + 4 <= buf.length) {
    const b1 = buf[off]!, b2 = buf[off + 1]!, b3 = buf[off + 2]!, b4 = buf[off + 3]!;
    if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) { off++; continue; }
    const version = (b2 >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (b2 >> 1) & 0x03; // 1 = Layer III
    const brIdx = (b3 >> 4) & 0x0f, srIdx = (b3 >> 2) & 0x03, padding = (b3 >> 1) & 0x01;
    if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { off++; continue; }
    const bitrate = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[brIdx]! * 1000;
    const sr = RATES[version]![srIdx]!;
    const perFrame = version === 3 ? 1152 : 576;
    const len = Math.floor((perFrame / 8) * bitrate / sr) + padding;
    if (len < 4) { off++; continue; }
    frames++;
    samples += perFrame;
    sampleRate = sr;
    channels = ((b4 >> 6) & 0x03) === 3 ? 1 : 2;
    off += len;
  }
  if (!frames || !sampleRate) return undefined;
  return { format: "mp3", durationMs: Math.round((samples / sampleRate) * 1000), sampleRate, channels };
}

export function audioInfo(buf: Uint8Array): AudioInfo {
  return wavInfo(buf) ?? mp3Info(buf) ?? { format: "unknown", durationMs: 0 };
}

/** Parse SRT (edge-tts --write-subtitles with --words-in-cue 1 gives one word per cue). */
export function parseSrt(srt: string): Array<{ startMs: number; endMs: number; text: string }> {
  const out: Array<{ startMs: number; endMs: number; text: string }> = [];
  const blocks = srt.replace(/\r/g, "").split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.trim());
    const ti = lines.findIndex((l) => /-->/.test(l));
    if (ti === -1) continue;
    const m = lines[ti]!.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const ms = (h: string, mi: string, s: string, x: string) => (+h * 3600 + +mi * 60 + +s) * 1000 + +x.padEnd(3, "0").slice(0, 3);
    const text = lines.slice(ti + 1).join(" ").trim();
    if (text) out.push({ startMs: ms(m[1]!, m[2]!, m[3]!, m[4]!), endMs: ms(m[5]!, m[6]!, m[7]!, m[8]!), text });
  }
  return out;
}
