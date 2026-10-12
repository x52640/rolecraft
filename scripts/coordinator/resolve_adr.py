# ADR-0006 表格衝突：同編號同主題 → 取含「定案」的一邊，否則取 HEAD；
# 同編號不同主題（兩個 Task 各自加了新項）→ 兩列都留，後來的一列改成下一個編號。
import re,sys
p=sys.argv[1]; s=open(p).read()
num=lambda l: (re.match(r'^\| (\d+) \|',l) or [None,None])[1]
topic=lambda l: l.split('|')[2].strip() if l.count('|')>=3 else l
def pick(m):
    ours=m.group(1).splitlines(); theirs=m.group(2).splitlines()
    o={num(l) or l:l for l in ours}; t={num(l) or l:l for l in theirs}
    out=[]; extra=[]
    for k in list(dict.fromkeys(list(o)+list(t))):
        a,b=o.get(k),t.get(k)
        if a and b and num(a) and topic(a)!=topic(b):
            out.append(a); extra.append(b); continue
        out.append(b if (b and ('定案' in b) and not (a and '定案' in a)) or a is None else a)
    return '\n'.join(out)+'\n'+''.join(l+'\n' for l in extra)
s=re.sub(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', pick, s, flags=re.S)
# 重新整理編號：重複的編號往後順延
lines=s.split('\n'); seen=set(); top=0
for l in lines:
    n=num(l)
    if n: top=max(top,int(n))
for i,l in enumerate(lines):
    n=num(l)
    if not n: continue
    if n in seen:
        top+=1; lines[i]=l.replace(f'| {n} |',f'| {top} |',1); print(f'renumbered {n} -> {top}: {topic(l)}',file=sys.stderr)
    seen.add(n)
open(p,'w').write('\n'.join(lines))
