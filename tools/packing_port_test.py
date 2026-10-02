# Go algorithm.go ning qatorma-qator Python nusxasi (faqat mantiqni sinash uchun).
import math, random
eps = 0.01
class Unit:
    def __init__(s, uid, ref, L, W, H, wt): s.uid, s.ref, s.L, s.W, s.H, s.wt = uid, ref, L, W, H, wt
class Placed:
    def __init__(s, u, x, y, z, pl, pw, rot, layer): s.u, s.x, s.y, s.z, s.pl, s.pw, s.rot, s.layer = u, x, y, z, pl, pw, rot, layer
def bestRect(free, l, w):
    best, rot, score = -1, False, math.inf
    for i, f in enumerate(free):
        for o in ((l, w), (w, l)):
            if o[0] <= f[2] + eps and o[1] <= f[3] + eps:
                s = min(f[2] - o[0], f[3] - o[1])
                if s < score - 1e-9: best, rot, score = i, o[0] != l, s
    return best, rot, score
def overlaps(a, b): return a[0] < b[0]+b[2]-eps and a[0]+a[2] > b[0]+eps and a[1] < b[1]+b[3]-eps and a[1]+a[3] > b[1]+eps
def contains(a, b): return b[0] >= a[0]-eps and b[1] >= a[1]-eps and b[0]+b[2] <= a[0]+a[2]+eps and b[1]+b[3] <= a[1]+a[3]+eps
def occupy(free, p):
    out = []
    for f in free:
        if not overlaps(f, p): out.append(f); continue
        if p[0] > f[0]+eps: out.append((f[0], f[1], p[0]-f[0], f[3]))
        if p[0]+p[2] < f[0]+f[2]-eps: out.append((p[0]+p[2], f[1], f[0]+f[2]-(p[0]+p[2]), f[3]))
        if p[1] > f[1]+eps: out.append((f[0], f[1], f[2], p[1]-f[1]))
        if p[1]+p[3] < f[1]+f[3]-eps: out.append((f[0], p[1]+p[3], f[2], f[1]+f[3]-(p[1]+p[3])))
    keep = [r[2] > eps and r[3] > eps for r in out]
    for i in range(len(out)):
        if not keep[i]: continue
        for j in range(len(out)):
            if i == j or not keep[j]: continue
            if contains(out[j], out[i]) and (not contains(out[i], out[j]) or j < i): keep[i] = False; break
    return [r for i, r in enumerate(out) if keep[i]]
class Bin:
    def __init__(s, cl, cw, ch, mw): s.cl, s.cw, s.ch, s.mw, s.layers, s.items, s.weight = cl, cw, ch, mw, [], [], 0.0
    def clone(s):
        n = Bin(s.cl, s.cw, s.ch, s.mw); n.weight = s.weight; n.items = list(s.items)
        n.layers = [[l[0], l[1], list(l[2])] for l in s.layers]; return n
    def top(s): return max([l[0]+l[1] for l in s.layers], default=0.0)
    def place(s, u):
        if s.weight + u.wt > s.mw + eps: return False
        bL, bR, bRot, bS = -1, -1, False, math.inf
        for li, l in enumerate(s.layers):
            if u.H > l[1] + eps: continue
            ri, rot, sc = bestRect(l[2], u.L, u.W)
            if ri < 0: continue
            score = (l[1]-u.H)*1e6 + sc
            if score < bS - 1e-9: bL, bR, bRot, bS = li, ri, rot, score
        if bL < 0:
            z = s.top()
            if z + u.H > s.ch + eps: return False
            nl = [z, u.H, [(0, 0, s.cl, s.cw)]]
            ri, rot, _ = bestRect(nl[2], u.L, u.W)
            if ri < 0: return False
            s.layers.append(nl); bL, bR, bRot = len(s.layers)-1, ri, rot
        l = s.layers[bL]; f = l[2][bR]
        pl, pw = (u.W, u.L) if bRot else (u.L, u.W)
        l[2] = occupy(l[2], (f[0], f[1], pl, pw))
        s.items.append(Placed(u, f[0], f[1], l[0], pl, pw, bRot, bL)); s.weight += u.wt
        return True
    def placeAll(s, us): return all(s.place(u) for u in us)
def sortUnits(us): us.sort(key=lambda u: (-round(u.L*u.W, 2), -u.H, u.uid))
def pack(units, cl, cw, ch, mw):
    bins = []
    order, groups = [], {}
    for u in units:
        if u.ref not in groups: order.append(u.ref); groups[u.ref] = []
        groups[u.ref].append(u)
    order.sort(key=lambda k: (-groups[k][0].L*groups[k][0].W, -groups[k][0].H, k))
    for k in order:
        g = groups[k]; done = False
        for i, b in enumerate(bins):
            c = b.clone()
            if c.placeAll(g): bins[i] = c; done = True; break
        if not done:
            c = Bin(cl, cw, ch, mw)
            if c.placeAll(g): bins.append(c); done = True
        if not done:
            for u in g:
                ok = any(b.place(u) for b in bins)
                if not ok:
                    c = Bin(cl, cw, ch, mw)
                    assert c.place(u), 'unit must fit empty bin'
                    bins.append(c)
    while len(bins) > 1:
        last = bins[-1]; rest = [b.clone() for b in bins[:-1]]
        us = [p.u for p in last.items]; sortUnits(us)
        ok = True
        for u in us:
            if not any(b.place(u) for b in rest): ok = False; break
        if not ok: break
        bins = rest
    return bins
def check(bins, units, cl, cw, ch, mw):
    placed = [p for b in bins for p in b.items]
    assert sorted(p.u.uid for p in placed) == sorted(u.uid for u in units), 'all units placed once'
    for b in bins:
        assert b.weight <= mw + eps, 'weight limit'
        assert abs(b.weight - sum(p.u.wt for p in b.items)) < 1e-6
        for p in b.items:
            assert p.x >= -eps and p.y >= -eps and p.z >= -eps
            assert p.x+p.pl <= cl+eps and p.y+p.pw <= cw+eps and p.z+p.u.H <= ch+eps, 'inside box'
        it = b.items
        for i in range(len(it)):
            for j in range(i+1, len(it)):
                a, c = it[i], it[j]
                ov = min(a.x+a.pl, c.x+c.pl)-max(a.x, c.x) > eps and min(a.y+a.pw, c.y+c.pw)-max(a.y, c.y) > eps and min(a.z+a.u.H, c.z+c.u.H)-max(a.z, c.z) > eps
                assert not ov, f'overlap {a.u.uid} {c.u.uid}'
    return len(bins)
random.seed(7)
# 1) TZ misoli: shkaf detallari
def shkaf():
    spec = [('bok', 2067, 503, 16, 2), ('krysha', 800, 503, 16, 1), ('dno', 800, 503, 16, 1), ('polka', 768, 480, 16, 4), ('zad', 2050, 790, 3, 1), ('fasad', 2040, 396, 18, 2)]
    us = []
    for ref, L, W, H, q in spec:
        wt = L*W*H*1e-9*730
        for i in range(q): us.append(Unit(f'{ref}#{i+1}', ref, L, W, H, wt))
    return us
us = shkaf()
for mw in (30, 50, 100):
    bins = pack(us, 2800-20, 1200-20, 600-20, mw)
    n = check(bins, us, 2780, 1180, 580, mw)
    print(f'shkaf limit {mw} kg: {n} quti, og\'irliklar', [round(b.weight, 1) for b in bins], 'jami', round(sum(u.wt for u in us), 1))
# 2) bir xil detallar birga: 10 ta polka 30 kg da
us = [Unit(f'p#{i}', 'p', 768, 480, 16, 4.3) for i in range(10)] + [Unit(f'b#{i}', 'b', 400, 300, 16, 1.4) for i in range(6)]
bins = pack(us, 2780, 1180, 580, 30)
check(bins, us, 2780, 1180, 580, 30)
print('guruh:', [sorted(set(p.u.ref for p in b.items)) for b in bins], [round(b.weight, 1) for b in bins])
# 3) tasodifiy sinovlar
for t in range(300):
    cl, cw, ch = random.choice([(2780, 1180, 580), (1980, 580, 280), (1200, 800, 400)])
    mw = random.choice([10, 25, 30, 60])
    us = []
    for g in range(random.randint(1, 12)):
        L = random.uniform(50, cl); W = random.uniform(30, min(L, cw)); H = random.choice([3, 16, 18, 22, 32, 60])
        if H > ch: H = ch
        wt = random.uniform(0.1, mw)
        for i in range(random.randint(1, 8)): us.append(Unit(f'g{g}#{i}', f'g{g}', L, W, H, wt))
    bins = pack(us, cl, cw, ch, mw)
    check(bins, us, cl, cw, ch, mw)
print('300 ta tasodifiy sinov: hammasi joylandi, kesishuv yo\'q, limit oshmadi')
