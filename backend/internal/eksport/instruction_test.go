package eksport

import (
	"bytes"
	"testing"

	"bazis-upokovka/internal/platform"
	"bazis-upokovka/internal/upokovka"
)

func fp(v float64) *float64 { return &v }

// Karton ko'rsatmasi PDF yaratiladi (yo'nalish, qadamlar, rasmlar).
func TestInstructionPDF(t *testing.T) {
	s := upokovka.Settings{MaxWeight: 50, CapL: 2800, CapW: 1200, CapH: 600, Padding: 10, Wall: 5}
	items := []upokovka.ItemIn{
		{RefKind: "row", RefUID: "a", Name: "Бок л", Kind: "panel", L: fp(2000), W: fp(500), T: fp(16), UnitWeight: fp(12), Qty: 2, ArtPos: "A-1"},
		{RefKind: "row", RefUID: "b", Name: "Полка", Kind: "panel", L: fp(700), W: fp(400), T: fp(16), UnitWeight: fp(3), Qty: 3},
	}
	res := upokovka.Pack(items, s)
	run := platform.PackRun{}
	rj := upokovka.ToJSONForTest(res.Boxes, run, s)
	h := Handlers{App: &platform.App{Cfg: platform.Config{FontsDir: "../../assets/fonts"}}}
	d := &data{order: platform.Order{Number: "T-1", Name: "Sinov"}, res: &rj, lang: "uz"}
	for _, lang := range []string{"uz", "ru"} {
		d.lang = lang
		b, err := h.instructionBytes(d, &rj.Boxes[0])
		if err != nil || !bytes.HasPrefix(b, []byte("%PDF")) || len(b) < 2000 {
			t.Fatalf("PDF yaratilmadi: %v (%d bayt)", err, len(b))
		}
	}
}
