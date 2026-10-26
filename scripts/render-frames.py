import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
font=ImageFont.truetype(r'C:\Windows\Fonts\consola.ttf',18)
cellw=11; cellh=22
for mode in ['dark','light']:
 data=json.loads(Path(f'artifacts/{mode}-frames.json').read_text(encoding='utf-8'))
 images=[]
 for frame in data:
  im=Image.new('RGB',(140*cellw,44*cellh),'black' if mode=='dark' else 'white');d=ImageDraw.Draw(im)
  for y,line in enumerate(frame):
   x=0
   for span in line:
    for ch in span['text']:
     d.rectangle((x*cellw,y*cellh,(x+1)*cellw-1,(y+1)*cellh-1),fill=tuple(span['bg'][:3]))
     d.text((x*cellw,y*cellh),ch,font=font,fill=tuple(span['fg'][:3]),stroke_width=0)
     x+=1
  images.append(im)
 images[0].save(f'artifacts/{mode}.png')
 images[0].save(f'artifacts/{mode}-swimming.gif',save_all=True,append_images=images[1:],duration=100,loop=0)
