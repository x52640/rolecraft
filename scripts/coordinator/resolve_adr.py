# ADR-0006 表格衝突：逐列取含「定案」的一邊，否則取 HEAD。
import re,sys
p=sys.argv[1]; s=open(p).read()
def pick(m):
    ours=m.group(1).splitlines(); theirs=m.group(2).splitlines()
    key=lambda l: (re.match(r'^\| (\d+) ',l) or [None,l])[1]
    o={key(l):l for l in ours}; t={key(l):l for l in theirs}
    out=[]
    for k in list(dict.fromkeys(list(o)+list(t))):
        a,b=o.get(k),t.get(k)
        out.append(b if (b and ('定案' in b) and not (a and '定案' in a)) or a is None else a)
    return '\n'.join(out)+'\n'
s=re.sub(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', pick, s, flags=re.S)
open(p,'w').write(s)
