"""Assemble captured viewport images for review; does not render or alter the UI."""
from pathlib import Path
from PIL import Image, ImageDraw
base = Path(__file__).resolve().parents[2] / 'docs/features/wondee-evidence'
scenes = ['guest','buyer','seller','login','form','pending','approved','rejected','catalog','detail','checkout','orders','order-paid','ship','inspector-queue','inspector-work1','inspector-work2','inspector-work3','result-PASS','result-MINOR_ISSUE','result-NOT_AS_DESCRIBED','result-FAKE','certificate','create','edit','mine','admin','receipt','shared']
for theme in ['dark','light']:
 for width, height in [(390,844),(320,740)]:
  for page in range(4):
   group = scenes[page*8:(page+1)*8]
   out = Image.new('RGB',(width*4,(height+30)*2),'#e4e4e4'); draw=ImageDraw.Draw(out)
   for i,scene in enumerate(group):
    image=Image.open(base/f'{scene}-{theme}-{width}.jpg'); image.thumbnail((width,height)); x=(i%4)*width;y=(i//4)*(height+30)
    draw.text((x+8,y+6),f'{scene} / {theme} / {width}',fill='black');out.paste(image,(x,y+30))
   out.save(base/f'contact-{theme}-{width}-{page+1}.jpg',quality=90)
