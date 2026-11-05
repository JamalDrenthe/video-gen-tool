import json, math, os, subprocess, sys, tempfile, base64
from PIL import Image, ImageDraw, ImageFont, ImageOps

def lerp(a, b, t): return a + (b - a) * t
def smooth(t): return t * t * (3 - 2 * t)

def load_font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def ease(name, t):
    if name == "linear": return t
    if name == "in": return t * t
    if name == "out": return 1 - (1 - t) ** 2
    return smooth(t)  # "smooth"

def kf_value(kfs, t, key, default):
    vals = sorted([(float(k.get("t", 0)), k.get(key)) for k in kfs if key in k], key=lambda v: v[0])
    if not vals: return default
    if t <= vals[0][0]: return vals[0][1]
    if t >= vals[-1][0]: return vals[-1][1]
    for i in range(len(vals) - 1):
        (t0, v0), (t1, v1) = vals[i], vals[i + 1]
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0 or 1)
            return lerp(v0, v1, ease(kfs[0].get("ease", "smooth"), u))
    return vals[-1][1]

def cover(img, W, H):
    return ImageOps.fit(img.convert("RGB"), (W, H), Image.LANCZOS)

def render_scene_frame(scene, base, W, H, t_norm):
    kfs = scene.get("keyframes", [])
    scale = kf_value(kfs, t_norm, "scale", 1.0)
    x = kf_value(kfs, t_norm, "x", 0.5)      # 0..1 viewport center over image
    y = kf_value(kfs, t_norm, "y", 0.5)
    rot = kf_value(kfs, t_norm, "rot", 0.0)
    op = kf_value(kfs, t_norm, "opacity", 1.0)

    if base is not None:
        big_w, big_h = int(W * scale), int(H * scale)
        sw, sh = base.size
        cw, ch = int(sw / max(scale, 1e-6)), int(sh / max(scale, 1e-6))
        cw, ch = min(cw, sw), min(ch, sh)
        cx, cy = int(x * (sw - cw)), int(y * (sh - ch))
        crop = base.crop((cx, cy, cx + cw, cy + ch)).resize((W, H), Image.LANCZOS)
        if rot: crop = crop.rotate(rot, resample=Image.BICUBIC, expand=False)
        if op < 1:
            black = Image.new("RGB", (W, H), (0, 0, 0))
            crop = Image.blend(black, crop, op)
        frame = crop
    else:
        bg = scene.get("bg", "#0f172a")
        frame = Image.new("RGB", (W, H), bg)

    d = ImageDraw.Draw(frame, "RGBA")
    for txt in scene.get("texts", []):
        s, e = txt.get("t0", 0), txt.get("t1", 1)
        if not (s <= t_norm <= e): continue
        span = (e - s) or 1
        fade = min((t_norm - s) / (span * 0.2 or 1), (e - t_norm) / (span * 0.2 or 1), 1)
        fade = max(0, min(1, fade))
        size = int(txt.get("size", 64) * (H / 720))
        font = load_font(size)
        text = txt.get("text", "")
        pos = txt.get("pos", "center")
        color = txt.get("color", "#ffffff")
        rise = txt.get("rise", 0)  # px moved upward across its life
        bbox = d.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        px = {"left": int(W * 0.08), "right": W - tw - int(W * 0.08)}.get(pos, (W - tw) // 2)
        py = {"top": int(H * 0.12), "bottom": H - th - int(H * 0.14)}.get(txt.get("vpos", "center"), (H - th) // 2)
        py -= int(rise * (t_norm - s) / span)
        if txt.get("shadow", True):
            d.text((px + 2, py + 3), text, font=font, fill=(0, 0, 0, int(160 * fade)))
        d.text((px, py), text, font=font, fill=color + ("" if len(color) > 7 else "FF"))
    return frame

def main(job_path, out_path):
    job = json.load(open(job_path))
    W, H = (1280, 720) if job.get("aspectRatio", "16:9") == "16:9" else (720, 1280)
    if job.get("resolution") == "1080p": W, H = (1920, 1080) if W > H else (1080, 1920)
    fps = int(job.get("fps", 30))
    scenes = job["scenes"]
    trans = float(job.get("transition_seconds", 0.6))
    assets = {}
    for k, p in job.get("assets_paths", {}).items():
        assets[k] = Image.open(p).convert("RGB")
        w, h = assets[k].size
        if max(w / W, h / H) < 1.4:
            assets[k] = assets[k].resize((int(w * 1.6), int(h * 1.6)), Image.LANCZOS)

    timeline = []
    for s in scenes:
        dur = float(s.get("duration", 4.0))
        timeline.append(dur)
    fps_list = [int(round(d * fps)) for d in timeline]
    xf = int(round(trans * fps))
    total = sum(fps_list) - xf * (len(scenes) - 1)

    cmd = ["ffmpeg", "-y", "-f", "image2pipe", "-vcodec", "png", "-r", str(fps),
           "-i", "-"]
    audio = job.get("audio_path")
    if audio:
        cmd += ["-i", audio]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-r", str(fps)]
    if audio:
        cmd += ["-c:a", "aac", "-shortest"]
    cmd += [out_path]
    pipe = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    # frame index -> which scene + local t
    starts = []
    acc = 0
    for i, n in enumerate(fps_list):
        starts.append(acc)
        acc += n - (xf if i < len(fps_list) - 1 else 0)

    for f in range(total):
        # find scene
        si = 0
        for i in range(len(starts)):
            if f >= starts[i]: si = i
        local = f - starts[si]
        n = fps_list[si]
        base = assets.get(scenes[si].get("image"))
        frame = render_scene_frame(scenes[si], base, W, H, local / max(n - 1, 1))
        # crossfade with next scene
        if si < len(scenes) - 1 and local >= n - xf:
            u = (local - (n - xf)) / max(xf, 1)
            nbase = assets.get(scenes[si + 1].get("image"))
            nframe = render_scene_frame(scenes[si + 1], nbase, W, H, (local - (n - xf)) / max(xf - 1, 1) * 0.01)
            frame = Image.blend(frame, nframe, min(1, u))
        frame.save(pipe.stdin, "PNG")
    pipe.stdin.close(); pipe.wait()

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
