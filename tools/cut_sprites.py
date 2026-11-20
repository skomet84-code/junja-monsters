from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage
srcs=[('/home/claude/src_zip/03_concept_art/준자 몬스터 25종 진화 도감.png',0),('/home/claude/src_zip/03_concept_art/5원소 몬스터 진화 아틀라스.png',5)]
OUT=256
for path,off in srcs:
    im=Image.open(path).convert('RGBA');a=np.array(im).astype(np.float32)
    al=a[:,:,3]
    mask=al>150
    mask=ndimage.binary_opening(mask,iterations=1)
    lab,n=ndimage.label(mask)
    sizes=ndimage.sum(mask,lab,range(1,n+1))
    cms=ndimage.center_of_mass(mask,lab,range(1,n+1))
    H,W=al.shape;cw=W/5;ch=H/5
    cells={}
    for i,(s,(cy,cx)) in enumerate(zip(sizes,cms)):
        if s<400:continue
        r=min(4,int(cy//ch));c=min(4,int(cx//cw))
        cells.setdefault((r,c),[]).append(i+1)
    for (r,c),ids in cells.items():
        mx=max(sizes[i-1] for i in ids)
        ids=[i for i in ids if sizes[i-1]>=0.12*mx]
        m=np.isin(lab,ids)
        m=ndimage.binary_fill_holes(m)
        md=ndimage.binary_dilation(m,iterations=2)
        ys,xs=np.where(md);y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
        crop=a[y0:y1,x0:x1].copy()
        alpha=crop[:,:,3]*md[y0:y1,x0:x1]
        # harden halo: fade low alpha
        alpha=np.clip((alpha-60)*1.4,0,255)
        crop[:,:,3]=alpha
        img=Image.fromarray(crop.astype(np.uint8),'RGBA')
        w,h=img.size;s=OUT/max(w,h);img=img.resize((max(1,int(w*s)),max(1,int(h*s))),Image.LANCZOS)
        canvas=Image.new('RGBA',(OUT,OUT),(0,0,0,0));canvas.paste(img,((OUT-img.width)//2,OUT-img.height))
        canvas.save(f'sprites/m{off+r}_{c+1}.png');canvas.save(f'sprites/m{off+r}_{c+1}.webp',quality=86,method=6)
    print(path,sorted(cells.keys()),len(cells))
