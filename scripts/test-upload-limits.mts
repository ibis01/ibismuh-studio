// Upload limits — the admission-control battery (2026-11-23).
//
//   npm run test:upload-limits
//
// Finding F-03: voices/clone buffered the whole multipart file before any
// size check; storyboard/upload had NO pre-buffer cap. This battery pins
// the shared walls:
//   1. REQUEST wall — Content-Length above the cap dies at the door
//   2. FILE wall — the parsed File's size is checked before buffering
//   3. FORMAT wall — magic bytes, never extensions (fake .wav dies, every
//      real audio container signature passes)
//   4. QUOTA wall — the declared size must fit the org's remaining storage
//   5. CONCURRENCY wall — the 5th parallel upload for one org answers 429
//   6. TEMP SWEEP — crash-orphaned scratch dirs are reclaimed at boot,
//      fresh ones are left alone
//   7. SOURCE PINS — the routes check size BEFORE arrayBuffer()

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let failed = false;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failed = true;
    console.error(`  ✗ ${msg}`);
  }
}

async function rejects(fn: () => unknown, msg: string, pattern?: RegExp): Promise<void> {
  try {
    await fn();
    failed = true;
    console.error(`  ✗ ${msg} — expected a throw, got a resolution`);
  } catch (err) {
    if (pattern && err instanceof Error && !pattern.test(err.message)) {
      failed = true;
      console.error(`  ✗ ${msg} — WRONG error: ${err.message}`);
      return;
    }
    console.log(`  ✓ ${msg}`);
  }
}

function fakeReq(contentLength: number | null): { headers: { get(name: string): string | null } } {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-length"
          ? contentLength === null
            ? null
            : String(contentLength)
          : null,
    },
  };
}

async function main(): Promise<void> {
  console.log("◆ upload limits — the admission-control battery (F-03/F-04)");

  const mod = await import("../src/lib/ibismuh/upload-limits.ts");
  const {
    enforceRequestContentLength,
    enforceFileSize,
    sniffAudioFormat,
    enforceAudioMagicBytes,
    withUploadSlot,
    resetUploadSlots,
    enforceQuotaHeadroom,
    MAX_CONCURRENT_UPLOADS_PER_ORG,
  } = mod;
  const { UploadTooLargeError, UnsupportedMediaError, UploadConcurrencyError } = mod;

  // ---------- 1. REQUEST wall ---------------------------------------------
  console.log("\n— 1. The request wall (Content-Length dies at the door)");

  {
    const cap = 10 * 1024 * 1024;
    let threw = false;
    try {
      enforceRequestContentLength(fakeReq(cap + 1) as never, cap, "The sample");
    } catch (err) {
      threw = err instanceof UploadTooLargeError;
    }
    ok(threw, "1.1  a Content-Length above the cap throws UploadTooLargeError");
    enforceRequestContentLength(fakeReq(cap) as never, cap, "The sample");
    ok(true, "1.2  a Content-Length at the cap passes");
    enforceRequestContentLength(fakeReq(null) as never, cap, "The sample");
    ok(true, "1.3  a chunked request (no Content-Length) defers to the file wall");
  }

  // ---------- 2. FILE wall -------------------------------------------------
  console.log("\n— 2. The file wall (the parsed File's size, before buffering)");

  {
    const cap = 10 * 1024 * 1024;
    const big = new File([new Uint8Array(cap + 1)], "sample.wav");
    let threw = false;
    try {
      enforceFileSize(big, cap, "The sample");
    } catch (err) {
      threw = err instanceof UploadTooLargeError;
    }
    ok(threw, "2.1  a File above the cap throws (before any arrayBuffer call)");
    enforceFileSize(new File([new Uint8Array(1024)], "sample.wav"), cap, "The sample");
    ok(true, "2.2  a File under the cap passes");
  }

  // ---------- 3. FORMAT wall (magic bytes) ---------------------------------
  console.log("\n— 3. The format wall (magic bytes, never extensions)");

  {
    const wav = Buffer.from("RIFF____WAVEfmt ");
    ok(sniffAudioFormat(wav) === "wav", "3.1  a real RIFF/WAVE signature sniffs as wav");
    ok(sniffAudioFormat(Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00\x00\x00")) === "mp3", "3.2  ID3v2 sniffs as mp3");
    ok(sniffAudioFormat(Buffer.from("OggS\x00\x02\x00\x00\x00\x00\x00\x00")) === "opus", "3.3  OggS sniffs as an ogg-family container");
    ok(sniffAudioFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])) === "webm", "3.4  EBML sniffs as webm");
    ok(sniffAudioFormat(Buffer.from("fLaC______00__")) === "flac", "3.5  fLaC sniffs as flac");
    const m4a = Buffer.alloc(16); m4a.write("____ftypM4A ", 0, "ascii");
    ok(sniffAudioFormat(m4a) === "m4a", "3.6  an ftyp box sniffs as m4a");
    // 0xFF Fx overlaps the MPEG frame sync: ADTS and MP3 share the sync
    // prefix, so the gate classifies it as the MPEG family (still AUDIO —
    // the deep ffprobe pass names the exact codec later).
    ok(sniffAudioFormat(Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0, 0, 0, 0, 0])) === "mp3", "3.7  an MPEG-family sync (ADTS shares it) sniffs as audio");

    const fake = Buffer.from("This is definitely not audio, just text pretending to be a .wav file...");
    ok(sniffAudioFormat(fake) === null, "3.8  a renamed text file sniffs as NOTHING");
    let threw = false;
    try {
      enforceAudioMagicBytes(fake, "The sample");
    } catch (err) {
      threw = err instanceof UnsupportedMediaError;
    }
    ok(threw, "3.9  the fake .wav is rejected by the magic-byte wall (extension ignored)");
    ok(enforceAudioMagicBytes(wav, "The sample") === "wav", "3.10 the real WAV passes the wall");
  }

  // ---------- 4. QUOTA wall ------------------------------------------------
  console.log("\n— 4. The quota wall (declared size vs remaining headroom)");

  {
    const prev = process.env.IBISMUH_STUDIO_STORAGE_QUOTA_GB;
    try {
      process.env.IBISMUH_STUDIO_STORAGE_QUOTA_GB = "0.001"; // ~1 MB
      // The quota math reads committed usage from the DB; for a fresh org
      // id the usage is ~0, so a 5 MB declared upload must be refused.
      const orgId = `quota-probe-${Date.now().toString(36)}`;
      await rejects(
        () => enforceQuotaHeadroom(orgId, 5 * 1024 * 1024, "The sample"),
        "4.1  a 5 MB upload against a ~1 MB quota is refused",
        /quota/i,
      );
      await enforceQuotaHeadroom(orgId, 1024, "The sample");
      ok(true, "4.2  a 1 KB upload against a ~1 MB quota passes");
    } finally {
      if (prev === undefined) delete process.env.IBISMUH_STUDIO_STORAGE_QUOTA_GB;
      else process.env.IBISMUH_STUDIO_STORAGE_QUOTA_GB = prev;
    }
  }

  // ---------- 5. CONCURRENCY wall -----------------------------------------
  console.log("\n— 5. The concurrency wall (per-organization upload slots)");

  {
    resetUploadSlots();
    const org = `slot-probe-${Date.now().toString(36)}`;
    const hold = (ms: number) => withUploadSlot(org, () => new Promise((r) => setTimeout(r, ms)));
    const workers = Array.from({ length: MAX_CONCURRENT_UPLOADS_PER_ORG }, () => hold(150));
    await new Promise((r) => setTimeout(r, 30)); // let the slots arm
    let refused = false;
    try {
      await withUploadSlot(org, () => Promise.resolve("never"));
    } catch (err) {
      refused = err instanceof UploadConcurrencyError;
    }
    ok(refused, `5.1  the ${MAX_CONCURRENT_UPLOADS_PER_ORG + 1}th concurrent upload is refused (429 class)`);
    await Promise.all(workers);
    await withUploadSlot(org, () => Promise.resolve("ok"));
    ok(true, "5.2  slots are released on completion — the next upload passes");
    resetUploadSlots();
  }

  // ---------- 6. TEMP SWEEP ------------------------------------------------
  console.log("\n— 6. The crash-orphan sweep (boot-time reclaim)");

  {
    const { sweepOrphanedTempDirs } = await import("../src/lib/ibismuh/temp-sweep.ts");
    const tmp = os.tmpdir();
    const base = path.join(tmp, `ibismuh-clone-sweeptest-${Date.now().toString(36)}`);
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, "sample.wav"), Buffer.alloc(4096));
    const fresh = path.join(tmp, `ibismuh-clone-sweeptest-fresh-${Date.now().toString(36)}`);
    fs.mkdirSync(fresh, { recursive: true });

    // fresh dir (mtime now) must survive a 6h-grace sweep
    let r = sweepOrphanedTempDirs(6 * 60 * 60 * 1000);
    ok(fs.existsSync(fresh), "6.1  a FRESH scratch dir is left alone (a live operation may own it)");
    ok(fs.existsSync(base), "6.2  the probe dir also survives the 6h grace sweep (it is fresh)");

    // an old dir is reclaimed
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
    fs.utimesSync(base, old, old);
    r = sweepOrphanedTempDirs(6 * 60 * 60 * 1000);
    ok(!fs.existsSync(base), `6.3  a 7h-old orphaned scratch dir is swept (swept=${r.swept}, freed=${r.freedBytes}B)`);
    ok(fs.existsSync(fresh), "6.4  the fresh dir STILL survives after the sweep");
    fs.rmSync(fresh, { recursive: true, force: true });
  }

  // ---------- 7. SOURCE PINS -----------------------------------------------
  console.log("\n— 7. Source pins: the routes check size BEFORE buffering");

  {
    const read = (p: string) => fs.readFileSync(p, "utf8");

    const clone = read("src/app/api/voices/clone/route.ts");
    const cloneSizePos = clone.indexOf("enforceFileSize(file, MAX_SAMPLE_BYTES");
    const cloneBufPos = clone.indexOf("await file.arrayBuffer()");
    ok(
      cloneSizePos !== -1 && cloneBufPos !== -1 && cloneSizePos < cloneBufPos,
      "7.1  voices/clone: the file wall runs BEFORE arrayBuffer() (F-03 closed)",
    );
    ok(clone.includes("enforceAudioMagicBytes"), "7.2  voices/clone: magic bytes are enforced");
    ok(clone.includes("withUploadSlot"), "7.3  voices/clone: the concurrency slot wraps the work");

    const sb = read("src/app/api/videos/[id]/storyboard/upload/route.ts");
    const sbSizePos = sb.indexOf("file.size > MAX_SCENE_UPLOAD_BYTES");
    const sbBufPos = sb.indexOf("await file.arrayBuffer()");
    ok(
      sbSizePos !== -1 && sbBufPos !== -1 && sbSizePos < sbBufPos,
      "7.4  storyboard/upload: the size wall runs BEFORE arrayBuffer() (the no-check gap closed)",
    );

    const vo = read("src/app/api/videos/[id]/voiceover/route.ts");
    ok(
      vo.includes("enforceAudioMagicBytes") && vo.includes("enforceQuotaHeadroom"),
      "7.5  voiceover upload: magic bytes + quota headroom enforced",
    );
    ok(
      vo.includes("presign(key, 300)") && vo.includes("Accept-Ranges"),
      "7.6  voiceover GET: presigned redirect / Range streaming (F-04 closed)",
    );

    const wb = read("src/app/api/videos/[id]/whiteboard/asset/route.ts");
    const wbCapPos = wb.indexOf("file.size > WB_RASTER_MAX_BYTES");
    const wbBufPos = wb.indexOf("await file.arrayBuffer()");
    ok(
      wbCapPos !== -1 && wbBufPos !== -1 && wbCapPos < wbBufPos,
      "7.7  whiteboard/asset: the outer byte cap runs BEFORE buffering",
    );

    const music = read("src/app/api/music/route.ts");
    ok(
      music.includes("enforceQuotaHeadroom") && music.includes("withUploadSlot"),
      "7.8  music upload: quota headroom + concurrency slot",
    );
  }

  if (failed) {
    console.error("\nupload limits battery: FAIL");
    process.exit(1);
  }
  console.log("\nupload limits battery: PASS");
}

main().catch((err) => {
  console.error("[test-upload-limits] fatal:", err);
  process.exit(1);
});
