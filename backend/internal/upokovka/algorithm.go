// Package upokovka: qadoqlash algoritmi (TZ 3.4) va API.
//
// Qoidalar:
//   - quti og'irlik limiti hech qachon oshmaydi (qat'iy);
//   - bir xil detallar (bitta qator yoki kompozit) iloji boricha bitta qutiga;
//   - bo'sh joylar keyingi (kichikroq) detallar bilan to'ldiriladi;
//   - kompozit gabarit qutisi bilan bitta birlik;
//   - detallar faqat yotqizib qo'yiladi (eng kichik o'lcham balandlik), qatlam-qatlam teriladi,
//     tekislikda 90 daraja burish mumkin;
//   - og'irligi yoki o'lchami noma'lum detallar chiqarib tashlanadi va ogohlantirish beriladi;
//   - furnitura standart holatda qadoqlanmaydi.
//
// Usul evristik: har bir qutida qatlamlar (balandligi birinchi detal qalinligi), qatlam ichida
// MaxRects (Best Short Side Fit). To'liq optimal yechim kafolatlanmaydi.
package upokovka

import (
	"fmt"
	"math"
	"sort"
	"strconv"
)

const eps = 0.01 // mm va kg

// ItemIn: laboratoriyadan keladigan element (frontend PackItemIn).
type ItemIn struct {
	RefKind    string   `json:"refKind"`
	RefUID     string   `json:"refUid"`
	Name       string   `json:"name"`
	Material   string   `json:"material"`
	Color      string   `json:"color"`
	Kind       string   `json:"kind"`
	L          *float64 `json:"L"`
	W          *float64 `json:"W"`
	T          *float64 `json:"T"`
	UnitWeight *float64 `json:"unitWeight"`
	Qty        int      `json:"qty"`
}

type Settings struct {
	MaxWeight       float64
	Manual          bool
	CapL, CapW      float64 // quti ichki o'lchami (manual) yoki ichki maksimal o'lcham (auto), mm
	CapH            float64
	Padding         float64
	Wall            float64
	IncludeHardware bool
	BoxLimits       map[int]float64 // quti raqami -> limit
}

// Unit: bitta jismoniy birlik (qty marta takrorlanadi). L >= W - asos, H - qalinlik.
type Unit struct {
	UID      string
	RefKind  string
	RefUID   string
	Name     string
	Material string
	Color    string
	L, W, H  float64
	Weight   float64
}

type Placed struct {
	Unit
	X, Y, Z float64 // ichki burchakdan (padding hisobga olingan)
	PL, PW  float64 // joylashgandagi asos o'lchami (burilgan bo'lishi mumkin)
	Rotated bool
	Layer   int
}

type BoxOut struct {
	No                     int
	L, W, H                float64 // tashqi
	InnerL, InnerW, InnerH float64
	Weight                 float64
	MaxWeight              float64
	Fill                   float64
	Items                  []Placed
}

type Warning struct {
	Code   string `json:"code"`
	Name   string `json:"name"`
	RefUID string `json:"refUid"`
	Size   string `json:"size,omitempty"`
	Reason string `json:"reason"`
}

type Unplaced struct {
	RefUID string `json:"refUid"`
	Name   string `json:"name"`
	Qty    int    `json:"qty"`
	Reason string `json:"reason"`
}

type Result struct {
	Boxes    []BoxOut
	Warnings []Warning
	Unplaced []Unplaced
}

/* ---------- elementlarni birliklarga aylantirish ---------- */

func sorted3(a, b, c float64) (float64, float64, float64) {
	x := []float64{a, b, c}
	sort.Sort(sort.Reverse(sort.Float64Slice(x)))
	return x[0], x[1], x[2]
}

func fmtSize(l, w, t float64) string {
	return fmt.Sprintf("%.0f×%.0f×%.0f", l, w, t)
}

// Expand: elementlarni birliklarga ajratadi; chiqarib tashlanganlar uchun ogohlantirish.
func Expand(items []ItemIn, s Settings) ([]Unit, []Warning) {
	var units []Unit
	var warns []Warning
	for _, it := range items {
		if it.Qty <= 0 || it.Kind == "ignore" {
			continue
		}
		hw := it.Kind == "hardware"
		if hw && !s.IncludeHardware {
			continue
		}
		qty := " × " + strconv.Itoa(it.Qty)
		if it.L == nil || it.W == nil || it.T == nil || *it.L <= 0 || *it.W <= 0 || *it.T <= 0 {
			code := "unknown_size"
			if hw {
				code = "hardware_no_size"
			}
			warns = append(warns, Warning{Code: code, Name: it.Name, RefUID: it.RefUID, Reason: qty})
			continue
		}
		l, w, t := sorted3(*it.L, *it.W, *it.T)
		size := fmtSize(l, w, t)
		if it.UnitWeight == nil || *it.UnitWeight < 0 {
			warns = append(warns, Warning{Code: "unknown_weight", Name: it.Name, RefUID: it.RefUID, Size: size, Reason: qty})
			continue
		}
		wt := *it.UnitWeight
		if wt > s.MaxWeight+eps {
			warns = append(warns, Warning{Code: "overweight_item", Name: it.Name, RefUID: it.RefUID, Size: size, Reason: fmt.Sprintf("%.2f kg > %.2f kg%s", wt, s.MaxWeight, qty)})
			continue
		}
		cl, cw, ch := s.CapL-2*s.Padding, s.CapW-2*s.Padding, s.CapH-2*s.Padding
		fitsFlat := t <= ch+eps && ((l <= cl+eps && w <= cw+eps) || (l <= cw+eps && w <= cl+eps))
		if !fitsFlat {
			warns = append(warns, Warning{Code: "unfit", Name: it.Name, RefUID: it.RefUID, Size: size,
				Reason: fmt.Sprintf("%s%s", fmtSize(cl, cw, ch), qty)})
			continue
		}
		for i := 1; i <= it.Qty; i++ {
			units = append(units, Unit{UID: it.RefUID + "#" + strconv.Itoa(i), RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name, Material: it.Material, Color: it.Color, L: l, W: w, H: t, Weight: wt})
		}
	}
	return units, warns
}

/* ---------- quti ichidagi joylashtirish ---------- */

type rect struct{ x, y, l, w float64 }

type layer struct {
	z, h float64
	free []rect
}

type bin struct {
	capL, capW, capH float64 // foydali (padding chiqarilgan) o'lcham
	maxW             float64
	layers           []*layer
	items            []Placed
	weight           float64
}

func newBin(capL, capW, capH, maxW float64) *bin {
	return &bin{capL: capL, capW: capW, capH: capH, maxW: maxW}
}

func (b *bin) clone() *bin {
	n := &bin{capL: b.capL, capW: b.capW, capH: b.capH, maxW: b.maxW, weight: b.weight}
	n.items = append([]Placed(nil), b.items...)
	for _, l := range b.layers {
		n.layers = append(n.layers, &layer{z: l.z, h: l.h, free: append([]rect(nil), l.free...)})
	}
	return n
}

func (b *bin) top() float64 {
	t := 0.0
	for _, l := range b.layers {
		t = math.Max(t, l.z+l.h)
	}
	return t
}

func (b *bin) volumeUsed() float64 {
	v := 0.0
	for _, p := range b.items {
		v += p.L * p.W * p.H
	}
	return v
}

// bestRect: Best Short Side Fit; qaytaradi: rect indeksi, burilganmi, ball (kichik yaxshi).
func bestRect(free []rect, l, w float64) (int, bool, float64) {
	best, rot, score := -1, false, math.Inf(1)
	for i, f := range free {
		for _, o := range [][2]float64{{l, w}, {w, l}} {
			if o[0] <= f.l+eps && o[1] <= f.w+eps {
				s := math.Min(f.l-o[0], f.w-o[1])
				if s < score-1e-9 {
					best, rot, score = i, o[0] != l, s
				}
			}
		}
	}
	return best, rot, score
}

func overlaps(a, b rect) bool {
	return a.x < b.x+b.l-eps && a.x+a.l > b.x+eps && a.y < b.y+b.w-eps && a.y+a.w > b.y+eps
}

func contains(a, b rect) bool { // a ichida b
	return b.x >= a.x-eps && b.y >= a.y-eps && b.x+b.l <= a.x+a.l+eps && b.y+b.w <= a.y+a.w+eps
}

// occupy: MaxRects bo'yicha bo'sh to'rtburchaklarni yangilash.
func occupy(free []rect, p rect) []rect {
	var out []rect
	for _, f := range free {
		if !overlaps(f, p) {
			out = append(out, f)
			continue
		}
		if p.x > f.x+eps {
			out = append(out, rect{f.x, f.y, p.x - f.x, f.w})
		}
		if p.x+p.l < f.x+f.l-eps {
			out = append(out, rect{p.x + p.l, f.y, f.x + f.l - (p.x + p.l), f.w})
		}
		if p.y > f.y+eps {
			out = append(out, rect{f.x, f.y, f.l, p.y - f.y})
		}
		if p.y+p.w < f.y+f.w-eps {
			out = append(out, rect{f.x, p.y + p.w, f.l, f.y + f.w - (p.y + p.w)})
		}
	}
	// boshqasi ichidagi to'rtburchaklarni olib tashlash
	keep := make([]bool, len(out))
	for i := range out {
		keep[i] = out[i].l > eps && out[i].w > eps
	}
	for i := range out {
		if !keep[i] {
			continue
		}
		for j := range out {
			if i == j || !keep[j] {
				continue
			}
			if contains(out[j], out[i]) && (!contains(out[i], out[j]) || j < i) {
				keep[i] = false
				break
			}
		}
	}
	res := out[:0]
	for i, r := range out {
		if keep[i] {
			res = append(res, r)
		}
	}
	return res
}

// place: birlikni qutiga qo'yishga urinadi. Avval mavjud qatlamlar (balandlik isrofi eng kami), keyin yangi qatlam.
func (b *bin) place(u Unit) bool {
	if b.weight+u.Weight > b.maxW+eps {
		return false
	}
	bestL, bestR := -1, -1
	bestRot := false
	bestScore := math.Inf(1)
	for li, l := range b.layers {
		if u.H > l.h+eps {
			continue
		}
		ri, rot, s := bestRect(l.free, u.L, u.W)
		if ri < 0 {
			continue
		}
		score := (l.h-u.H)*1e6 + s // avval vertikal isrof, keyin BSSF
		if score < bestScore-1e-9 {
			bestL, bestR, bestRot, bestScore = li, ri, rot, score
		}
	}
	if bestL < 0 {
		z := b.top()
		if z+u.H > b.capH+eps {
			return false
		}
		nl := &layer{z: z, h: u.H, free: []rect{{0, 0, b.capL, b.capW}}}
		ri, rot, _ := bestRect(nl.free, u.L, u.W)
		if ri < 0 {
			return false
		}
		b.layers = append(b.layers, nl)
		bestL, bestR, bestRot = len(b.layers)-1, ri, rot
	}
	l := b.layers[bestL]
	f := l.free[bestR]
	pl, pw := u.L, u.W
	if bestRot {
		pl, pw = u.W, u.L
	}
	l.free = occupy(l.free, rect{f.x, f.y, pl, pw})
	b.items = append(b.items, Placed{Unit: u, X: f.x, Y: f.y, Z: l.z, PL: pl, PW: pw, Rotated: bestRot, Layer: bestL})
	b.weight += u.Weight
	return true
}

func (b *bin) placeAll(us []Unit) bool {
	for _, u := range us {
		if !b.place(u) {
			return false
		}
	}
	return true
}

/* ---------- asosiy hisob ---------- */

type packer struct {
	s    Settings
	bins []*bin
}

func (p *packer) caps() (float64, float64, float64) {
	return p.s.CapL - 2*p.s.Padding, p.s.CapW - 2*p.s.Padding, p.s.CapH - 2*p.s.Padding
}

func (p *packer) limitFor(no int) float64 {
	if v, ok := p.s.BoxLimits[no]; ok && v > 0 {
		return v
	}
	return p.s.MaxWeight
}

func (p *packer) fresh() *bin {
	cl, cw, ch := p.caps()
	return newBin(cl, cw, ch, p.limitFor(len(p.bins)+1))
}

func sortUnits(us []Unit) {
	sort.SliceStable(us, func(i, j int) bool {
		ai, aj := us[i].L*us[i].W, us[j].L*us[j].W
		if math.Abs(ai-aj) > eps {
			return ai > aj
		}
		if math.Abs(us[i].H-us[j].H) > eps {
			return us[i].H > us[j].H
		}
		return us[i].UID < us[j].UID
	})
}

// Pack: to'liq hisoblash.
func Pack(items []ItemIn, s Settings) Result {
	units, warns := Expand(items, s)
	p := &packer{s: s}
	// guruhlar: bir xil RefUID
	order := []string{}
	groups := map[string][]Unit{}
	for _, u := range units {
		if _, ok := groups[u.RefUID]; !ok {
			order = append(order, u.RefUID)
		}
		groups[u.RefUID] = append(groups[u.RefUID], u)
	}
	sort.SliceStable(order, func(i, j int) bool {
		a, b := groups[order[i]][0], groups[order[j]][0]
		if math.Abs(a.L*a.W-b.L*b.W) > eps {
			return a.L*a.W > b.L*b.W
		}
		if math.Abs(a.H-b.H) > eps {
			return a.H > b.H
		}
		return order[i] < order[j]
	})
	var unplaced []Unplaced
	for _, key := range order {
		g := groups[key]
		done := false
		// 1) butun guruh mavjud qutilardan biriga
		for i, b := range p.bins {
			c := b.clone()
			if c.placeAll(g) {
				p.bins[i] = c
				done = true
				break
			}
		}
		// 2) butun guruh yangi qutiga
		if !done {
			c := p.fresh()
			if c.placeAll(g) {
				p.bins = append(p.bins, c)
				done = true
			}
		}
		// 3) birma-bir: avval mavjud qutilar, keyin yangi quti
		if !done {
			for _, u := range g {
				ok := false
				for _, b := range p.bins {
					if b.place(u) {
						ok = true
						break
					}
				}
				if !ok {
					c := p.fresh()
					if c.place(u) {
						p.bins = append(p.bins, c)
						ok = true
					}
				}
				if !ok { // Expand tekshiruvidan keyin bo'lmasligi kerak
					unplaced = append(unplaced, Unplaced{RefUID: u.RefUID, Name: u.Name, Qty: 1, Reason: "joylashtirib bo'lmadi"})
				}
			}
		}
	}
	p.reduce()
	return Result{Boxes: p.output(), Warnings: warns, Unplaced: mergeUnplaced(unplaced)}
}

// reduce: oxirgi qutini boshqalarga taqsimlashga urinish (qutilar sonini kamaytirish).
func (p *packer) reduce() {
	for len(p.bins) > 1 {
		last := p.bins[len(p.bins)-1]
		rest := make([]*bin, len(p.bins)-1)
		for i := range rest {
			rest[i] = p.bins[i].clone()
		}
		us := make([]Unit, 0, len(last.items))
		for _, it := range last.items {
			us = append(us, it.Unit)
		}
		sortUnits(us)
		ok := true
		for _, u := range us {
			placed := false
			for _, b := range rest {
				if b.place(u) {
					placed = true
					break
				}
			}
			if !placed {
				ok = false
				break
			}
		}
		if !ok {
			return
		}
		p.bins = rest
	}
}

func mergeUnplaced(in []Unplaced) []Unplaced {
	out := []Unplaced{}
	idx := map[string]int{}
	for _, u := range in {
		if i, ok := idx[u.RefUID]; ok {
			out[i].Qty += u.Qty
			continue
		}
		idx[u.RefUID] = len(out)
		out = append(out, u)
	}
	return out
}

func (p *packer) output() []BoxOut {
	out := make([]BoxOut, 0, len(p.bins))
	for i, b := range p.bins {
		out = append(out, finishBox(i+1, b, p.s))
	}
	return out
}

// finishBox: avto rejimda qutini tarkibga moslab kichraytiradi, koordinatalarga padding qo'shadi.
func finishBox(no int, b *bin, s Settings) BoxOut {
	var mx, my, mz float64
	// qatlam indekslari z bo'yicha tartiblangan bo'lishi uchun qayta raqamlash
	zs := make([]float64, len(b.layers))
	for i, l := range b.layers {
		zs[i] = l.z
	}
	rank := make([]int, len(b.layers))
	for i := range zs {
		for j := range zs {
			if zs[j] < zs[i]-eps || (math.Abs(zs[j]-zs[i]) <= eps && j < i) {
				rank[i]++
			}
		}
	}
	items := make([]Placed, len(b.items))
	for i, it := range b.items {
		mx = math.Max(mx, it.X+it.PL)
		my = math.Max(my, it.Y+it.PW)
		mz = math.Max(mz, it.Z+it.H)
		it.X += s.Padding
		it.Y += s.Padding
		it.Z += s.Padding
		it.Layer = rank[it.Layer]
		items[i] = it
	}
	var il, iw, ih float64
	if s.Manual {
		il, iw, ih = s.CapL, s.CapW, s.CapH
	} else {
		il, iw, ih = mx+2*s.Padding, my+2*s.Padding, mz+2*s.Padding
	}
	vol := il * iw * ih
	fill := 0.0
	if vol > 0 {
		fill = b.volumeUsed() / vol
	}
	return BoxOut{No: no, InnerL: il, InnerW: iw, InnerH: ih, L: il + 2*s.Wall, W: iw + 2*s.Wall, H: ih + 2*s.Wall,
		Weight: round(b.weight, 3), MaxWeight: b.maxW, Fill: round(fill, 4), Items: items}
}

func round(v float64, d int) float64 {
	k := math.Pow(10, float64(d))
	return math.Round(v*k) / k
}

/* ---------- natijani qo'lda tahrirlash (F27) ---------- */

var (
	ErrNotFound  = fmt.Errorf("element topilmadi")
	ErrOverLimit = fmt.Errorf("og'irlik limiti oshadi")
	ErrNoFit     = fmt.Errorf("qutida joy yetmaydi")
)

// repack: qutini berilgan birliklar bilan qaytadan teradi (o'lcham cheklovi sozlamadan).
func repack(us []Unit, maxW float64, s Settings) (*bin, bool) {
	cl, cw, ch := s.CapL-2*s.Padding, s.CapW-2*s.Padding, s.CapH-2*s.Padding
	b := newBin(cl, cw, ch, maxW)
	cp := append([]Unit(nil), us...)
	// guruhlar birga qolishi uchun avval RefUID, keyin o'lcham bo'yicha
	sortUnits(cp)
	return b, b.placeAll(cp)
}

func unitsOf(b BoxOut) []Unit {
	us := make([]Unit, 0, len(b.Items))
	for _, it := range b.Items {
		us = append(us, it.Unit)
	}
	return us
}

// Move: elementni boshqa qutiga o'tkazadi. Manba va nishon qutilar qayta teriladi; bo'sh qolgan quti o'chiriladi.
func Move(boxes []BoxOut, uid string, toNo int, s Settings) ([]BoxOut, error) {
	from, idx := -1, -1
	to := -1
	for i, b := range boxes {
		if b.No == toNo {
			to = i
		}
		for j, it := range b.Items {
			if it.UID == uid {
				from, idx = i, j
			}
		}
	}
	if from < 0 || to < 0 {
		return nil, ErrNotFound
	}
	if from == to {
		return boxes, nil
	}
	item := boxes[from].Items[idx].Unit
	tb := boxes[to]
	if tb.Weight+item.Weight > tb.MaxWeight+eps {
		return nil, ErrOverLimit
	}
	nb, ok := repack(append(unitsOf(tb), item), tb.MaxWeight, s)
	if !ok {
		return nil, ErrNoFit
	}
	rest := []Unit{}
	for j, it := range boxes[from].Items {
		if j != idx {
			rest = append(rest, it.Unit)
		}
	}
	out := make([]BoxOut, 0, len(boxes))
	for i, b := range boxes {
		switch i {
		case to:
			out = append(out, finishBox(b.No, nb, s))
		case from:
			if len(rest) == 0 {
				continue
			}
			sb, ok := repack(rest, b.MaxWeight, s)
			if !ok { // olib tashlangandan keyin sig'masligi mumkin emas, lekin xavfsizlik uchun eski holat
				out = append(out, b)
				continue
			}
			out = append(out, finishBox(b.No, sb, s))
		default:
			out = append(out, b)
		}
	}
	for i := range out {
		out[i].No = i + 1
	}
	return out, nil
}

// SetLimit: bitta quti limitini o'zgartiradi (nil = umumiy limit).
func SetLimit(boxes []BoxOut, no int, limit *float64, s Settings) ([]BoxOut, error) {
	for i := range boxes {
		if boxes[i].No != no {
			continue
		}
		v := s.MaxWeight
		if limit != nil {
			v = *limit
		}
		if v <= 0 {
			return nil, fmt.Errorf("limit musbat bo'lishi kerak")
		}
		if boxes[i].Weight > v+eps {
			return nil, ErrOverLimit
		}
		boxes[i].MaxWeight = v
		return boxes, nil
	}
	return nil, ErrNotFound
}
