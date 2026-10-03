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

// Cavity: detal ichidagi bo'sh hajm (detal o'qlarida, L >= W >= T), mm. Closed: olti yoqdan qaysilari yopiq.
type Cavity struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Z      float64 `json:"z"`
	L      float64 `json:"l"`
	W      float64 `json:"w"`
	H      float64 `json:"h"`
	Closed []bool  `json:"closed"`
}

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
	Group      string   `json:"group"` // alohida upokovka guruhi (bo'sh = umumiy)
	GroupName  string   `json:"groupName"`
	ArtPos     string   `json:"artPos"`
	Geom       string   `json:"geom"` // mesh | contour | box | none
	Cavities   []Cavity `json:"cavities"`
}

// GroupSettings: guruhning karton sozlamalari; nil maydon umumiy sozlamadan olinadi.
// CapL/CapW/CapH: avto rejimda o'lcham chegarasi, qo'lda rejimda karton o'lchami.
type GroupSettings struct {
	MaxWeight        *float64
	CapL, CapW, CapH *float64
	Padding          *float64
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
	Groups          map[string]GroupSettings
}

// forGroup: guruh uchun amaldagi sozlama (umumiy sozlama ustiga guruh qiymatlari qo'yiladi).
func (s Settings) forGroup(id string) Settings {
	g, ok := s.Groups[id]
	if id == "" || !ok {
		return s
	}
	over := func(dst *float64, v *float64) {
		if v != nil {
			*dst = *v
		}
	}
	over(&s.MaxWeight, g.MaxWeight)
	over(&s.CapL, g.CapL)
	over(&s.CapW, g.CapW)
	over(&s.CapH, g.CapH)
	over(&s.Padding, g.Padding)
	return s
}

// Unit: bitta jismoniy birlik (qty marta takrorlanadi). L >= W - asos, H - qalinlik.
type Unit struct {
	UID       string
	RefKind   string
	RefUID    string
	Name      string
	Material  string
	Color     string
	L, W, H   float64
	Weight    float64
	Group     string
	GroupName string
	ArtPos    string
	Geom      string
	Cav       []Cavity
}

// orient: detal o'qlari (0=L, 1=W, 2=T) karton o'qlari (x, y, z) ga qanday tushishi.
type orient struct {
	ax   [3]int
	pose string // flat | upright
	up   string // tik o'q: T | W | L
}

var orients = []orient{
	{[3]int{0, 1, 2}, "flat", "T"},
	{[3]int{1, 0, 2}, "flat", "T"}, // tekislikda 90 daraja burilgan
	{[3]int{0, 2, 1}, "upright", "W"},
	{[3]int{2, 0, 1}, "upright", "W"},
	{[3]int{1, 2, 0}, "upright", "L"},
	{[3]int{2, 1, 0}, "upright", "L"},
}

// mapCav: o'yiqni detal o'qlaridan karton o'qlariga o'tkazadi (detal burchagiga nisbatan siljish va o'lcham).
func (o orient) mapCav(c Cavity, _ Unit) (x, y, z, l, w, h float64) {
	pos := [3]float64{c.X, c.Y, c.Z}
	size := [3]float64{c.L, c.W, c.H}
	return pos[o.ax[0]], pos[o.ax[1]], pos[o.ax[2]], size[o.ax[0]], size[o.ax[1]], size[o.ax[2]]
}

type Placed struct {
	Unit
	X, Y, Z    float64 // ichki burchakdan (padding hisobga olingan)
	PL, PW, PH float64 // joylashgandagi o'lchamlar karton o'qlari bo'yicha
	Orient     int     // orients indeksi
	Pose, Up   string
	Rotated    bool
	Layer      int
	Step       int    // yig'ish tartibi (1 dan)
	Host       string // ichiga joylangan bo'lsa tashqi detal UID
	Done       bool   // operator "Joylandi" belgisi
}

type BoxOut struct {
	No                     int
	Group                  string
	GroupName              string
	L, W, H                float64 // tashqi
	InnerL, InnerW, InnerH float64
	Weight                 float64
	MaxWeight              float64
	Fill                   float64
	Ready                  bool
	Items                  []Placed
}

type Warning struct {
	Code   string `json:"code"`
	Name   string `json:"name"`
	RefUID string `json:"refUid"`
	Size   string `json:"size,omitempty"`
	Reason string `json:"reason"`
	Group  string `json:"group,omitempty"`
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
// Chegaralar (og'irlik, o'lcham) elementning guruhi sozlamasidan olinadi.
func Expand(items []ItemIn, s Settings) ([]Unit, []Warning) {
	var units []Unit
	var warns []Warning
	for _, it := range items {
		if it.Qty <= 0 || it.Kind == "ignore" {
			continue
		}
		gs := s.forGroup(it.Group)
		warn := func(code, size, reason string) {
			warns = append(warns, Warning{Code: code, Name: it.Name, RefUID: it.RefUID, Size: size, Reason: reason, Group: it.Group})
		}
		hw := it.Kind == "hardware"
		if hw && !gs.IncludeHardware {
			continue
		}
		qty := " × " + strconv.Itoa(it.Qty)
		if it.L == nil || it.W == nil || it.T == nil || *it.L <= 0 || *it.W <= 0 || *it.T <= 0 {
			code := "unknown_size"
			if hw {
				code = "hardware_no_size"
			}
			warn(code, "", qty)
			continue
		}
		l, w, t := sorted3(*it.L, *it.W, *it.T)
		size := fmtSize(l, w, t)
		if it.UnitWeight == nil || *it.UnitWeight < 0 {
			warn("unknown_weight", size, qty)
			continue
		}
		wt := *it.UnitWeight
		if wt > gs.MaxWeight+eps {
			warn("overweight_item", size, fmt.Sprintf("%.2f kg > %.2f kg%s", wt, gs.MaxWeight, qty))
			continue
		}
		cl, cw, ch := gs.CapL-2*gs.Padding, gs.CapW-2*gs.Padding, gs.CapH-2*gs.Padding
		fitsFlat := t <= ch+eps && ((l <= cl+eps && w <= cw+eps) || (l <= cw+eps && w <= cl+eps))
		if !fitsFlat {
			warn("unfit", size, fmt.Sprintf("%s%s", fmtSize(cl, cw, ch), qty))
			continue
		}
		if it.Geom == "none" { // geometriya yo'q: chegara qutisi bilan hisoblandi
			warn("bbox_only", size, qty)
		}
		for i := 1; i <= it.Qty; i++ {
			units = append(units, Unit{UID: it.RefUID + "#" + strconv.Itoa(i), RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name, Material: it.Material, Color: it.Color,
				L: l, W: w, H: t, Weight: wt, Group: it.Group, GroupName: it.GroupName, ArtPos: it.ArtPos, Geom: it.Geom, Cav: it.Cavities})
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

// overlapArea: ikki Placed ning planli kesishma yuzasi.
func overlapArea(a, b Placed) float64 {
	ox := math.Min(a.X+a.PL, b.X+b.PL) - math.Max(a.X, b.X)
	oy := math.Min(a.Y+a.PW, b.Y+b.PW) - math.Max(a.Y, b.Y)
	if ox <= eps || oy <= eps {
		return 0
	}
	return ox * oy
}

// supported: detal polda (floor) yoki kamida yarim yuzasi bilan pastdagi detallarga tayanadi.
func supported(items []Placed, it Placed, floor float64) bool {
	if it.Host != "" || it.Z <= floor+eps {
		return true
	}
	area := 0.0
	for _, o := range items {
		if o.UID == it.UID || math.Abs(o.Z+o.PH-it.Z) > eps {
			continue
		}
		if a := overlapArea(it, o); a > 0 {
			area += a
		}
	}
	return area >= 0.5*it.PL*it.PW-eps
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
// Yuqori qatlamdagi detal tayanchga ega bo'lishi shart (supported).
func (b *bin) place(u Unit) bool {
	if b.weight+u.Weight > b.maxW+eps {
		return false
	}
	cand := func(z float64, x, y float64, o orient2) Placed {
		pl, pw := u.L, u.W
		if o.rot {
			pl, pw = u.W, u.L
		}
		return Placed{Unit: u, X: x, Y: y, Z: z, PL: pl, PW: pw, PH: u.H}
	}
	bestL := -1
	var best Placed
	bestScore := math.Inf(1)
	for li, l := range b.layers {
		if u.H > l.h+eps {
			continue
		}
		for _, f := range l.free {
			for _, o := range flatOrients {
				c := cand(l.z, f.x, f.y, o)
				if c.PL > f.l+eps || c.PW > f.w+eps || !supported(b.items, c, 0) {
					continue
				}
				score := (l.h-u.H)*1e6 + math.Min(f.l-c.PL, f.w-c.PW) // avval vertikal isrof, keyin BSSF
				if score < bestScore-1e-9 {
					bestL, best, bestScore = li, c, score
					best.Rotated = o.rot
				}
			}
		}
	}
	if bestL < 0 {
		z := b.top()
		if z+u.H > b.capH+eps {
			return false
		}
		anchors := [][2]float64{{0, 0}}
		for _, it := range b.items {
			if math.Abs(it.Z+it.PH-z) <= eps {
				anchors = append(anchors, [2]float64{it.X, it.Y})
			}
		}
		for _, a := range anchors {
			for _, o := range flatOrients {
				c := cand(z, a[0], a[1], o)
				if c.X+c.PL > b.capL+eps || c.Y+c.PW > b.capW+eps || !supported(b.items, c, 0) {
					continue
				}
				c.Rotated = o.rot
				b.layers = append(b.layers, &layer{z: z, h: u.H, free: []rect{{0, 0, b.capL, b.capW}}})
				bestL, best = len(b.layers)-1, c
				break
			}
			if bestL >= 0 {
				break
			}
		}
		if bestL < 0 {
			return false
		}
	}
	l := b.layers[bestL]
	l.free = occupy(l.free, rect{best.X, best.Y, best.PL, best.PW})
	best.Layer = bestL
	best.Orient, best.Pose, best.Up = 0, "flat", "T"
	if best.Rotated {
		best.Orient = 1
	}
	b.items = append(b.items, best)
	b.weight += u.Weight
	return true
}

// orient2: tekislikdagi burilish (faqat yotqizilgan holat).
type orient2 struct{ rot bool }

var flatOrients = []orient2{{false}, {true}}

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
	s      Settings // guruh uchun amaldagi sozlama
	offset int      // oldingi guruhlardagi qutilar soni (quti raqami uchun)
	bins   []*bin
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
	return newBin(cl, cw, ch, p.limitFor(p.offset+len(p.bins)+1))
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

// Pack: to'liq hisoblash. Har bir guruh (umumiy, keyin alohida guruhlar) o'z kartonlariga joylanadi, guruhlar aralashmaydi.
func Pack(items []ItemIn, s Settings) Result {
	units, warns := Expand(items, s)
	order := []string{}
	byGroup := map[string][]Unit{}
	for _, u := range units {
		if _, ok := byGroup[u.Group]; !ok {
			order = append(order, u.Group)
		}
		byGroup[u.Group] = append(byGroup[u.Group], u)
	}
	sort.SliceStable(order, func(i, j int) bool { return order[i] == "" && order[j] != "" })
	var boxes []BoxOut
	var unplaced []Unplaced
	for _, g := range order {
		bs, up := packUnits(byGroup[g], s.forGroup(g), len(boxes))
		boxes = append(boxes, bs...)
		unplaced = append(unplaced, up...)
	}
	return Result{Boxes: boxes, Warnings: warns, Unplaced: mergeUnplaced(unplaced)}
}

// packUnits: bitta guruhning birliklarini joylaydi; qutilar raqami offset dan keyin boshlanadi.
func packUnits(units []Unit, s Settings, offset int) ([]BoxOut, []Unplaced) {
	if len(units) == 0 {
		return nil, nil
	}
	p := &packer{s: s, offset: offset}
	// bir xil RefUID dagi birliklar iloji boricha bitta qutiga
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
	return p.output(units[0].Group, units[0].GroupName), unplaced
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

func (p *packer) output(group, groupName string) []BoxOut {
	out := make([]BoxOut, 0, len(p.bins))
	for i, b := range p.bins {
		out = append(out, finishBox(p.offset+i+1, b, p.s, group, groupName))
	}
	return out
}

// finishBox: avto rejimda qutini tarkibga moslab kichraytiradi, koordinatalarga padding qo'shadi,
// detallarni yig'ish tartibida (qatlam, keyin x, y) raqamlaydi.
func finishBox(no int, b *bin, s Settings, group, groupName string) BoxOut {
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
		mz = math.Max(mz, it.Z+it.PH)
		it.X += s.Padding
		it.Y += s.Padding
		it.Z += s.Padding
		it.Layer = rank[it.Layer]
		items[i] = it
	}
	sort.SliceStable(items, func(i, j int) bool {
		a, c := items[i], items[j]
		if a.Layer != c.Layer {
			return a.Layer < c.Layer
		}
		if math.Abs(a.X-c.X) > eps {
			return a.X < c.X
		}
		return a.Y < c.Y
	})
	for i := range items {
		items[i].Step = i + 1
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
	return BoxOut{No: no, Group: group, GroupName: groupName, InnerL: il, InnerW: iw, InnerH: ih, L: il + 2*s.Wall, W: iw + 2*s.Wall, H: ih + 2*s.Wall,
		Weight: round(b.weight, 3), MaxWeight: b.maxW, Fill: round(fill, 4), Items: items}
}

func round(v float64, d int) float64 {
	k := math.Pow(10, float64(d))
	return math.Round(v*k) / k
}

// SizeKey: bir xil o'lchamli kartonlarni jamlash kaliti (tashqi o'lcham, mm).
func SizeKey(b BoxOut) string {
	return fmt.Sprintf("%.0f×%.0f×%.0f", b.L, b.W, b.H)
}

// Check: karton cheklovlari buzilishi (kalitlar frontend/eksport tarjimalarida: issue.*).
func Check(b BoxOut, st Settings) []string {
	gs := st.forGroup(b.Group)
	var out []string
	sum := 0.0
	for _, it := range b.Items {
		sum += it.Weight
	}
	if sum > b.MaxWeight+eps {
		out = append(out, "over_weight")
	}
	if b.InnerL > gs.CapL+eps || b.InnerW > gs.CapW+eps || b.InnerH > gs.CapH+eps {
		out = append(out, "over_size")
	}
	outside, overlap, unsupp := false, false, false
	for i, a := range b.Items {
		if a.X < -eps || a.Y < -eps || a.Z < -eps || a.X+a.PL > b.InnerL+eps || a.Y+a.PW > b.InnerW+eps || a.Z+a.PH > b.InnerH+eps {
			outside = true
		}
		for _, c := range b.Items[i+1:] {
			if a.Host == c.UID || c.Host == a.UID {
				continue // ichiga joylangan detal o'yiqda turadi
			}
			oz := math.Min(a.Z+a.PH, c.Z+c.PH) - math.Max(a.Z, c.Z)
			if oz > eps && overlapArea(a, c) > 0 {
				overlap = true
			}
		}
		if !supported(b.Items, a, gs.Padding) {
			unsupp = true
		}
	}
	if outside {
		out = append(out, "outside")
	}
	if overlap {
		out = append(out, "overlap")
	}
	if unsupp {
		out = append(out, "unsupported")
	}
	return out
}

/* ---------- natijani qo'lda tahrirlash (F27) ---------- */

var (
	ErrNotFound       = fmt.Errorf("element topilmadi")
	ErrOverLimit      = fmt.Errorf("og'irlik limiti oshadi")
	ErrNoFit          = fmt.Errorf("qutida joy yetmaydi")
	ErrGroupMix       = fmt.Errorf("boshqa upokovka guruhi kartoniga ko'chirib bo'lmaydi")
	ErrCompositeSplit = fmt.Errorf("yelimlangan kompozitni bo'lib bo'lmaydi")
	ErrNotAllDone     = fmt.Errorf("barcha detallar joylanmagan")
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
// Boshqa upokovka guruhi kartoniga ko'chirish rad etiladi.
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
	if item.Group != tb.Group {
		return nil, ErrGroupMix
	}
	if tb.Weight+item.Weight > tb.MaxWeight+eps {
		return nil, ErrOverLimit
	}
	nb, ok := repack(append(unitsOf(tb), item), tb.MaxWeight, s.forGroup(tb.Group))
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
			nbo := finishBox(b.No, nb, s.forGroup(b.Group), b.Group, b.GroupName)
			nbo.Ready = b.Ready
			out = append(out, nbo)
		case from:
			if len(rest) == 0 {
				continue
			}
			sb, ok := repack(rest, b.MaxWeight, s.forGroup(b.Group))
			if !ok { // olib tashlangandan keyin sig'masligi mumkin emas, lekin xavfsizlik uchun eski holat
				out = append(out, b)
				continue
			}
			sbo := finishBox(b.No, sb, s.forGroup(b.Group), b.Group, b.GroupName)
			sbo.Ready = b.Ready
			out = append(out, sbo)
		default:
			out = append(out, b)
		}
	}
	for i := range out {
		out[i].No = i + 1
	}
	return out, nil
}

// SetLimit: bitta quti limitini o'zgartiradi (nil = guruh/umumiy limit).
func SetLimit(boxes []BoxOut, no int, limit *float64, s Settings) ([]BoxOut, error) {
	for i := range boxes {
		if boxes[i].No != no {
			continue
		}
		v := s.forGroup(boxes[i].Group).MaxWeight
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

// SetDone: operator "Joylandi" belgisi. Belgi olib tashlansa, karton "Tayyor" holatidan chiqadi.
func SetDone(boxes []BoxOut, uid string, done bool) ([]BoxOut, error) {
	for i := range boxes {
		for j := range boxes[i].Items {
			if boxes[i].Items[j].UID == uid {
				boxes[i].Items[j].Done = done
				if !done {
					boxes[i].Ready = false
				}
				return boxes, nil
			}
		}
	}
	return nil, ErrNotFound
}

// SetReady: karton "Tayyor" belgisi; belgilash uchun barcha detallar "Joylandi" bo'lishi kerak.
func SetReady(boxes []BoxOut, no int, ready bool) ([]BoxOut, error) {
	for i := range boxes {
		if boxes[i].No != no {
			continue
		}
		if ready {
			for _, it := range boxes[i].Items {
				if !it.Done {
					return nil, ErrNotAllDone
				}
			}
		}
		boxes[i].Ready = ready
		return boxes, nil
	}
	return nil, ErrNotFound
}
