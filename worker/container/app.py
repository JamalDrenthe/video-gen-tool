import base64, io, json, os, subprocess, tempfile
from flask import Flask, request, jsonify, send_file
import render

app = Flask(__name__)

@app.get("/health")
def health(): return {"ok": True}

@app.post("/render")
def do_render():
    job = request.get_json(force=True)
    tmp = tempfile.mkdtemp()
    assets_paths = {}
    for key, b64 in job.pop("assets", {}).items():
        p = os.path.join(tmp, key + ".png")
        open(p, "wb").write(base64.b64decode(b64.split(",")[-1]))
        assets_paths[key] = p
    if "audio" in job:
        p = os.path.join(tmp, "audio.bin")
        open(p, "wb").write(base64.b64decode(job.pop("audio").split(",")[-1]))
        job["audio_path"] = p
    job["assets_paths"] = assets_paths
    jp = os.path.join(tmp, "job.json"); op = os.path.join(tmp, "out.mp4")
    json.dump(job, open(jp, "w"))
    try:
        render.main(jp, op)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return send_file(op, mimetype="video/mp4", download_name="scene.mp4")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
