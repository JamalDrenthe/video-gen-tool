import json, base64
from PIL import Image, ImageDraw
img = Image.new("RGB",(1600,900),(30,41,59))
d = ImageDraw.Draw(img)
for i in range(40):
    d.ellipse([i*40, 200 + i*8, i*40+30, 230+i*8], fill=(99+3*i,102,241))
img.save("/tmp/scene_img.png")
job = {
 "aspectRatio":"16:9","fps":30,"transition_seconds":0.8,
 "scenes":[
  {"image":"a","duration":4,"keyframes":[{"t":0,"scale":1,"x":0.2,"ease":"linear"},{"t":1,"scale":1.6,"x":0.8,"ease":"linear"}],
   "texts":[{"text":"Scene One: Ken Burns","t0":0,"t1":0.9,"size":72,"rise":40}]},
  {"bg":"#1e1b4b","duration":3,"keyframes":[],
   "texts":[{"text":"Pure motion design","t0":0.05,"t1":1,"size":80,"pos":"center"}]}
 ],
 "assets_paths":{"a":"/tmp/scene_img.png"}
}
json.dump(job, open("/tmp/job.json","w"))
