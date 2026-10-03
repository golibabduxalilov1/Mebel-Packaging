package upokovka

import (
	"fmt"
	"math"
	"math/rand"
	"testing"
)

func fp(v float64) *float64 { return &v }

func baseSettings(maxW float64) Settings {
	return Settings{MaxWeight: maxW, CapL: 2800, CapW: 1200, CapH: 600, Padding: 10, Wall: 5, BoxLimits: map[int]float64{}}
}

func item(ref string, l, w, t, kg float64, qty int) ItemIn {
	return ItemIn{RefKind: "row", RefUID: ref, Name: ref, Material: "ЛДСП 16", Kind: "panel", L: fp(l), W: fp(w), T: fp(t), UnitWeight: fp(kg), Qty: qty}
}

func shkaf() []ItemIn {
	d := func(l, w, t float64) float64 { return l * w * t * 1e-9 * 730 }
	return []ItemIn{
		item("bok", 2067, 503, 16, d(2067, 503, 16), 2),
		item("krysha", 800, 503, 16, d(800, 503, 16), 1),
		item("dno", 800, 503, 16, d(800, 503, 16), 1),
		item("polka", 768, 480, 16, d(768, 480, 16), 4),
		item("zad", 2050, 790, 3, d(2050, 790, 3), 1),
		item("fasad", 2040, 396, 18, d(2040, 396, 18), 2),
	}
}

// checkResult: hamma birlik bir marta, quti ichida, kesishmaydi, limit oshmaydi.
func checkResult(t *testing.T, r Result, s Settings, wantUnits int) {
	t.Helper()
	seen := map[string]bool{}
	for _, b := range r.Boxes {
		sum := 0.0
		for i, a := range b.Items {
			if seen[a.UID] {
				t.Fatalf("%s ikki marta joylandi", a.UID)
			}
			seen[a.UID] = true
			sum += a.Weight
			if a.X < s.Padding-eps || a.Y < s.Padding-eps || a.Z < s.Padding-eps ||
				a.X+a.PL > b.InnerL-s.Padding+eps || a.Y+a.PW > b.InnerW-s.Padding+eps || a.Z+a.PH > b.InnerH-s.Padding+eps {
				t.Fatalf("quti %d: %s quti tashqarisida", b.No, a.UID)
			}
			for _, c := range b.Items[i+1:] {
				ox := min(a.X+a.PL, c.X+c.PL) - max(a.X, c.X)
				oy := min(a.Y+a.PW, c.Y+c.PW) - max(a.Y, c.Y)
				oz := min(a.Z+a.PH, c.Z+c.PH) - max(a.Z, c.Z)
				if ox > eps && oy > eps && oz > eps {
					t.Fatalf("quti %d: %s va %s kesishadi", b.No, a.UID, c.UID)
				}
			}
		}
		if sum > b.MaxWeight+eps {
			t.Fatalf("quti %d: %.2f kg > limit %.2f", b.No, sum, b.MaxWeight)
		}
		if b.InnerL > s.CapL+eps || b.InnerW > s.CapW+eps || b.InnerH > s.CapH+eps {
			t.Fatalf("quti %d maksimal o'lchamdan katta", b.No)
		}
	}
	if len(seen) != wantUnits {
		t.Fatalf("joylangan %d, kutilgan %d", len(seen), wantUnits)
	}
}

func TestShkafWeightLimits(t *testing.T) {
	total := 0.0
	for _, it := range shkaf() {
		total += *it.UnitWeight * float64(it.Qty)
	}
	for _, lim := range []float64{30, 50, 100} {
		s := baseSettings(lim)
		r := Pack(shkaf(), s)
		checkResult(t, r, s, 11)
		minBoxes := int(total/lim) + 1
		if total/lim == float64(int(total/lim)) {
			minBoxes--
		}
		if len(r.Boxes) < minBoxes {
			t.Fatalf("limit %.0f: %d quti, kamida %d bo'lishi kerak", lim, len(r.Boxes), minBoxes)
		}
		if lim == 100 && len(r.Boxes) != 1 {
			t.Fatalf("100 kg da bitta quti kutilgan, %d", len(r.Boxes))
		}
	}
}

func TestSameItemsTogether(t *testing.T) {
	s := baseSettings(30)
	r := Pack([]ItemIn{item("polka", 768, 480, 16, 4.3, 6), item("mayda", 400, 300, 16, 1.4, 6)}, s)
	checkResult(t, r, s, 12)
	// 6 ta polka 25.8 kg: bitta qutiga sig'adi va bo'linmasligi kerak
	boxes := map[int]bool{}
	for _, b := range r.Boxes {
		for _, it := range b.Items {
			if it.RefUID == "polka" {
				boxes[b.No] = true
			}
		}
	}
	if len(boxes) != 1 {
		t.Fatalf("bir xil polkalar %d qutiga bo'lindi", len(boxes))
	}
}

func TestWarnings(t *testing.T) {
	s := baseSettings(30)
	items := []ItemIn{
		{RefUID: "nw", Name: "vaznsiz", Kind: "panel", L: fp(500), W: fp(400), T: fp(16), Qty: 2},
		{RefUID: "ns", Name: "o'lchamsiz", Kind: "panel", UnitWeight: fp(1), Qty: 1},
		item("katta", 3000, 600, 16, 10, 1),
		item("ogir", 1000, 500, 16, 45, 1),
		{RefUID: "hw", Name: "furnitura", Kind: "hardware", L: fp(10), W: fp(10), T: fp(10), UnitWeight: fp(0.01), Qty: 100},
		item("ok", 500, 400, 16, 2, 1),
	}
	r := Pack(items, s)
	codes := map[string]string{}
	for _, w := range r.Warnings {
		codes[w.RefUID] = w.Code
	}
	want := map[string]string{"nw": "unknown_weight", "ns": "unknown_size", "katta": "unfit", "ogir": "overweight_item"}
	for k, v := range want {
		if codes[k] != v {
			t.Fatalf("%s: kutilgan %s, olindi %q", k, v, codes[k])
		}
	}
	if _, ok := codes["hw"]; ok {
		t.Fatalf("furnitura standart holatda ogohlantirishsiz chiqarilishi kerak")
	}
	checkResult(t, r, s, 1)
	s.IncludeHardware = true
	r = Pack(items, s)
	checkResult(t, r, s, 101)
}

func TestManualBoxSize(t *testing.T) {
	s := Settings{MaxWeight: 30, Manual: true, CapL: 2100, CapW: 600, CapH: 200, Padding: 10, Wall: 5}
	r := Pack(shkaf(), s)
	for _, b := range r.Boxes {
		if b.InnerL != 2100 || b.InnerW != 600 || b.InnerH != 200 || b.L != 2110 {
			t.Fatalf("qo'lda o'lcham saqlanmadi: %+v", b)
		}
	}
	// zad 2050x790 600 ga sig'maydi
	found := false
	for _, w := range r.Warnings {
		if w.RefUID == "zad" && w.Code == "unfit" {
			found = true
		}
	}
	if !found {
		t.Fatalf("zad uchun unfit kutilgan")
	}
	checkResult(t, r, s, 10)
}

func TestMoveAndLimit(t *testing.T) {
	s := baseSettings(30)
	r := Pack(shkaf(), s)
	if len(r.Boxes) < 2 {
		t.Skip("kamida 2 quti kerak")
	}
	// eng yengil elementni boshqa qutiga o'tkazish
	var uid string
	from, best := 0, 1e9
	for _, b := range r.Boxes {
		for _, it := range b.Items {
			if it.Weight < best {
				best, uid, from = it.Weight, it.UID, b.No
			}
		}
	}
	to := 1
	if from == 1 {
		to = 2
	}
	moved, err := Move(r.Boxes, uid, to, s)
	if err != nil {
		if err == ErrOverLimit || err == ErrNoFit {
			t.Logf("ko'chirish rad etildi (%v): limit saqlandi", err)
			return
		}
		t.Fatal(err)
	}
	ok := false
	for _, b := range moved {
		for _, it := range b.Items {
			if it.UID == uid && b.No == to {
				ok = true
			}
		}
	}
	if !ok && len(moved) == len(r.Boxes) {
		t.Fatalf("element ko'chmadi")
	}
	checkResult(t, Result{Boxes: moved}, s, 11)
	// limitni joriy og'irlikdan pastga tushirish rad etiladi
	if _, err := SetLimit(moved, 1, fp(moved[0].Weight/2), s); err != ErrOverLimit {
		t.Fatalf("limit tekshiruvi ishlamadi: %v", err)
	}
}

func TestMoveOverLimit(t *testing.T) {
	s := baseSettings(10)
	r := Pack([]ItemIn{item("a", 500, 400, 16, 6, 1), item("b", 500, 400, 16, 6, 1)}, s)
	if len(r.Boxes) != 2 {
		t.Fatalf("2 quti kutilgan, %d", len(r.Boxes))
	}
	uid := r.Boxes[1].Items[0].UID
	if _, err := Move(r.Boxes, uid, 1, s); err != ErrOverLimit {
		t.Fatalf("limitdan oshadigan ko'chirish rad etilishi kerak, olindi %v", err)
	}
}

func TestRandomProperties(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	for n := 0; n < 200; n++ {
		s := baseSettings([]float64{10, 25, 30, 60}[rng.Intn(4)])
		var items []ItemIn
		units := 0
		for g := 0; g < 1+rng.Intn(10); g++ {
			l := 50 + rng.Float64()*2700
			w := 30 + rng.Float64()*(min(l, 1150)-30)
			h := []float64{3, 16, 18, 22, 32, 60}[rng.Intn(6)]
			q := 1 + rng.Intn(8)
			items = append(items, item(fmt.Sprintf("g%d", g), l, w, h, 0.1+rng.Float64()*(s.MaxWeight-0.2), q))
			units += q
		}
		r := Pack(items, s)
		if len(r.Warnings) > 0 {
			t.Fatalf("kutilmagan ogohlantirish: %+v", r.Warnings)
		}
		checkResult(t, r, s, units)
	}
}

func TestGroupsSeparate(t *testing.T) {
	s := baseSettings(30)
	lim := 5.0
	s.Groups = map[string]GroupSettings{"g1": {MaxWeight: &lim}}
	a, b := item("a", 500, 400, 16, 2, 2), item("b", 500, 400, 16, 2, 2)
	b.Group, b.GroupName = "g1", "Guruh 1"
	r := Pack([]ItemIn{a, b}, s)
	if len(r.Boxes) != 3 { // umumiy: 1 quti; g1: limit 5 kg => 2 kg × 2 = 4 kg bitta quti... 2 detal 4 kg
		// g1 da 2 ta 2 kg = 4 kg <= 5 kg: bitta quti; jami 2
		if len(r.Boxes) != 2 {
			t.Fatalf("2 quti kutilgan, %d", len(r.Boxes))
		}
	}
	for _, bx := range r.Boxes {
		for _, it := range bx.Items {
			if it.Group != bx.Group {
				t.Fatalf("guruhlar aralashdi: quti %d", bx.No)
			}
		}
		if len(Check(bx, s)) > 0 {
			t.Fatalf("quti %d: kutilmagan cheklov %v", bx.No, Check(bx, s))
		}
	}
	if r.Boxes[1].Group != "g1" || r.Boxes[1].MaxWeight != 5 {
		t.Fatalf("guruh limiti qo'llanmadi: %+v", r.Boxes[1].MaxWeight)
	}
	if _, err := Move(r.Boxes, r.Boxes[1].Items[0].UID, 1, s); err != ErrGroupMix {
		t.Fatalf("guruhlar aralashishi rad etilishi kerak, olindi %v", err)
	}
}

// noUpright: hech bir detalda eng katta o'lcham vertikal emas; yon taraflama faqat chegara berilganda.
func noUpright(t *testing.T, r Result, s Settings) {
	t.Helper()
	for _, b := range r.Boxes {
		for _, a := range b.Items {
			if a.Pose != "flat" && a.Pose != "side" {
				t.Fatalf("%s: noma'lum yo'nalish %q", a.UID, a.Pose)
			}
			if a.PH > a.Unit.H+eps && s.SquareRatio <= 0 {
				t.Fatalf("%s: chegarasiz yon taraflama joylandi", a.UID)
			}
			if a.PH >= a.Unit.L-eps && a.Unit.L-a.Unit.H > eps {
				t.Fatalf("%s: eng katta o'lcham vertikal (PH=%.0f L=%.0f)", a.UID, a.PH, a.Unit.L)
			}
			if a.Pose == "flat" && a.PH > a.Unit.H+eps {
				t.Fatalf("%s: yotqizilgan, lekin balandlik qalinlikdan katta", a.UID)
			}
		}
		if iss := Check(b, s); len(iss) > 0 {
			t.Fatalf("quti %d: %v", b.No, iss)
		}
	}
}

func TestAlwaysFlatAndSideOffByDefault(t *testing.T) {
	s := baseSettings(60)
	// kvadratga yaqin kesim 100x90 va uzun a=1500: chegara yo'q => yotqizilgan
	r := Pack(append(shkaf(), item("quti", 1500, 100, 90, 5, 2)), s)
	checkResult(t, r, s, 13)
	noUpright(t, r, s)
	s.SquareRatio = 1.2
	r = Pack(append(shkaf(), item("quti", 1500, 100, 90, 5, 2)), s)
	checkResult(t, r, s, 13)
	noUpright(t, r, s)
}

func TestSideOnlyWhenSquareish(t *testing.T) {
	s := baseSettings(60)
	s.SquareRatio = 1.2
	// b/c = 1.11 <= 1.2: yon taraflama mumkin; 100/20 = 5: faqat yotqizilgan
	r := Pack([]ItemIn{item("kv", 1500, 100, 90, 5, 1), item("yupqa", 1500, 100, 20, 2, 1)}, s)
	for _, b := range r.Boxes {
		for _, a := range b.Items {
			if a.RefUID == "yupqa" && a.Pose != "flat" {
				t.Fatalf("yupqa detal yon taraflama joylandi")
			}
		}
	}
	noUpright(t, r, s)
}

func TestBoxIsTightAndRounded(t *testing.T) {
	s := baseSettings(60)
	s.Padding, s.Wall = 10, 5
	r := Pack([]ItemIn{item("a", 800.4, 500.2, 16, 3, 1)}, s)
	b := r.Boxes[0]
	if b.InnerL != 821 || b.InnerW != 521 || b.InnerH != 36 {
		t.Fatalf("ichki o'lcham %.1f×%.1f×%.1f, kutilgan 821×521×36", b.InnerL, b.InnerW, b.InnerH)
	}
	if b.L != b.InnerL+10 || b.W != b.InnerW+10 || b.H != b.InnerH+10 {
		t.Fatalf("tashqi o'lcham ichki + 2*qalinlik emas: %.0f×%.0f×%.0f", b.L, b.W, b.H)
	}
}

func TestHeavyBelowLight(t *testing.T) {
	s := baseSettings(200)
	r := Pack([]ItemIn{item("yengil", 800, 500, 4, 1, 3), item("og'ir", 800, 500, 40, 20, 2), item("orta", 800, 500, 16, 6, 2)}, s)
	for _, b := range r.Boxes {
		for _, a := range b.Items {
			for _, c := range b.Items {
				if c.Z > a.Z+eps && overlapArea(a, c) > 0 && c.Weight > a.Weight+eps && math.Abs(a.Z+a.PH-c.Z) <= eps {
					t.Fatalf("%s (%.0f kg) %s (%.0f kg) ustida", c.UID, c.Weight, a.UID, a.Weight)
				}
			}
		}
		if iss := Check(b, s); len(iss) > 0 {
			t.Fatalf("quti %d: %v", b.No, iss)
		}
	}
}

// ichi o'yiq quti ichiga kichik detal joylanadi va karton kichikroq bo'ladi.
func TestNestInsideHollow(t *testing.T) {
	s := baseSettings(200)
	hollow := item("quti", 600, 400, 300, 10, 1)
	hollow.Cavities = []Cavity{{X: 20, Y: 20, Z: 20, L: 560, W: 360, H: 280, Closed: []bool{true, true, true, true, true, false}}}
	small := item("kichik", 300, 200, 18, 1, 2)
	with := Pack([]ItemIn{hollow, small}, s)
	hollow.Cavities = nil
	without := Pack([]ItemIn{hollow, small}, s)
	noUpright(t, with, s)
	if len(with.Boxes) != 1 {
		t.Fatalf("1 quti kutilgan, %d", len(with.Boxes))
	}
	hosted := 0
	for _, a := range with.Boxes[0].Items {
		if a.Host != "" {
			hosted++
			if a.Z < 20+s.Padding-eps {
				t.Fatalf("o'yiq tubidan pastda: z=%.1f", a.Z)
			}
		}
	}
	if hosted != 2 {
		t.Fatalf("ichiga joylangan %d, kutilgan 2", hosted)
	}
	vw := with.Boxes[0].InnerL * with.Boxes[0].InnerW * with.Boxes[0].InnerH
	vo := without.Boxes[0].InnerL * without.Boxes[0].InnerW * without.Boxes[0].InnerH
	if len(without.Boxes) == 1 && vw >= vo {
		t.Fatalf("o'yiqqa joylash kartonni kichraytirmadi: %.0f >= %.0f", vw, vo)
	}
	// yopiq o'yiq (tepasi ham yopiq) ishlatilmaydi
	hollow.Cavities = []Cavity{{X: 20, Y: 20, Z: 20, L: 560, W: 360, H: 280, Closed: []bool{true, true, true, true, true, true}}}
	closed := Pack([]ItemIn{hollow, small}, s)
	for _, a := range closed.Boxes[0].Items {
		if a.Host != "" {
			t.Fatalf("yopiq o'yiqqa joylandi")
		}
	}
}

// qo'lda berilgan karton kengaymaydi: sig'maydigan detal rad etiladi.
func TestManualNeverGrows(t *testing.T) {
	s := baseSettings(60)
	s.Manual, s.CapL, s.CapW, s.CapH = true, 600, 400, 100
	r := Pack([]ItemIn{item("katta", 1000, 500, 16, 3, 1), item("kichik", 300, 200, 16, 1, 1)}, s)
	if len(r.Boxes) != 1 || r.Boxes[0].InnerL != 600 || r.Boxes[0].InnerW != 400 || r.Boxes[0].InnerH != 100 {
		t.Fatalf("manual karton o'zgardi: %+v", r.Boxes)
	}
	found := false
	for _, w := range r.Warnings {
		if w.Code == "unfit" && w.RefUID == "katta" {
			found = true
		}
	}
	if !found {
		t.Fatalf("sig'maydigan detal uchun ogohlantirish yo'q")
	}
}
