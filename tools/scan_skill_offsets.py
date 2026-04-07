import re, json, pathlib
p=pathlib.Path('js/ui/SkillTreeConfig.js')
s=p.read_text()
# extract nodes block
m=re.search(r"nodes\s*:\s*{", s)
if not m:
    print('nodes block not found'); raise SystemExit(1)
start=m.end()
# find matching closing brace for nodes by scanning
depth=1
i=start
while i<len(s) and depth>0:
    c=s[i]
    if c=='{': depth+=1
    elif c=='}': depth-=1
    i+=1
nodes_block=s[start:i-1]
# split nodes by top-level keys: pattern keyName: { ... },
# match keys that start a new top-level node entry (newline + optional indent)
pattern=re.compile(r"\n\s*([a-zA-Z0-9_]+)\s*:\s*{\s*\n")
entries=[]
for m in pattern.finditer(nodes_block):
    entries.append((m.group(1), m.start()))
entries2=[]
for idx,(name,pos) in enumerate(entries):
    start_pos=pos
    if idx+1<len(entries):
        end_pos=entries[idx+1][1]
    else:
        end_pos=len(nodes_block)
    block=nodes_block[start_pos:end_pos]
    entries2.append((name, block))

nodes=[]
for name,blk in entries2:
    # find offset
    off=re.search(r"offset\s*:\s*{\s*x\s*:\s*([-0-9]+)\s*,\s*y\s*:\s*([-0-9]+)\s*}", blk)
    tp=re.search(r"treeParent\s*:\s*['\"]([^'\"]+)['\"]", blk)
    if off and tp:
        nodes.append({'name':name,'x':int(off.group(1)),'y':int(off.group(2)),'parent':tp.group(1)})
    else:
        nodes.append({'name':name,'x':None,'y':None,'parent':tp.group(1) if tp else None})

from collections import defaultdict
groups=defaultdict(list)
for n in nodes:
    groups[n['parent']].append(n)

duplicates=[]
for parent,items in groups.items():
    posmap=defaultdict(list)
    for it in items:
        pos=(it['x'],it['y'])
        posmap[pos].append(it['name'])
    for pos,names in posmap.items():
        if pos[0] is None: continue
        if len(names)>1:
            duplicates.append({'parent':parent,'pos':pos,'names':names})

print(json.dumps({'total_nodes':len(nodes),'duplicates':duplicates},indent=2))

# Prepare suggested adjustments: for each duplicate group, n siblings → offset x += index*20
fixes=[]
for d in duplicates:
    x,y=d['pos']
    for idx,name in enumerate(d['names']):
        newx=x+idx*20
        fixes.append({'name':name,'old':{'x':x,'y':y},'new':{'x':newx,'y':y}})
print('\nSuggested fixes:')
print(json.dumps(fixes,indent=2))

print('\n---EDIT LIST---')
for f in fixes:
    print(f['name'], f['old'], '->', f['new'])
