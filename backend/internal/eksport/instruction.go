package eksport

import (
	"fmt"
	"strconv"

	"github.com/go-pdf/fpdf"
	"github.com/gofiber/fiber/v2"

	"bazis-upokovka/internal/upokovka"
)

// InstructionPDF: bitta karton uchun chop etiladigan ko'rsatma (A4): karton raqami, ichki va tashqi o'lchamlar,
// tarkibi, joylash tartibi (pastdan yuqoriga qadamlar) va rasmlar (qatlamlar bo'yicha yuqoridan va yon tomondan ko'rinish).
func (h Handlers) InstructionPDF(c *fiber.Ctx) error {
	d, err := h.load(c)
	if err != nil {
		return err
	}
	no, err := strconv.Atoi(c.Params("no"))
	if err != nil {
		return fiber.NewError(400, "karton raqami noto'g'ri")
	}
	var box *upokovka.BoxJSON
	for i := range d.res.Boxes {
		if d.res.Boxes[i].No == no {
			box = &d.res.Boxes[i]
		}
	}
	if box == nil {
		return fiber.NewError(404, "karton topilmadi")
	}
	b, err := h.instructionBytes(d, box)
	if err != nil {
		return err
	}
	return attach(c, fileName(d.order, fmt.Sprintf("box%d_instruction.pdf", box.No)), "application/pdf", b)
}

func (h Handlers) instructionBytes(d *data, box *upokovka.BoxJSON) ([]byte, error) {
	L := func(k string) string { return tr(d.lang, k) }
	p := h.newPDF(fpdf.SizeType{Wd: 210, Ht: 297}, "P")
	p.SetMargins(14, 14, 14)
	p.AddPage()
	p.SetTextColor(18, 73, 92)
	p.SetFont("dejavu", "B", 16)
	p.CellFormat(0, 9, fmt.Sprintf("%s №%d / %d", L("instruction"), box.No, len(d.res.Boxes)), "", 1, "L", false, 0, "")
	p.SetTextColor(16, 29, 38)
	rows := [][2]string{
		{L("order"), d.order.Number + " · " + d.order.Name},
		{L("client"), d.order.Client},
		{L("group"), d.groupLabel(box.Group, box.GroupName)},
		{L("outer"), fmt.Sprintf("%s: %.0f   %s: %.0f   %s: %.0f", L("len"), box.L, L("wid"), box.W, L("hei"), box.H)},
		{L("inner"), fmt.Sprintf("%s: %.0f   %s: %.0f   %s: %.0f", L("len"), box.InnerL, L("wid"), box.InnerW, L("hei"), box.InnerH)},
		{L("weight"), fmt.Sprintf("%.2f / %.1f", box.Weight, box.MaxWeight)},
		{L("fill"), fmt.Sprintf("%.0f", box.Fill*100)},
		{L("items"), fmt.Sprint(len(box.Items))},
	}
	for _, kv := range rows {
		p.SetFont("dejavu", "B", 10)
		p.CellFormat(45, 6, kv[0], "", 0, "L", false, 0, "")
		p.SetFont("dejavu", "", 10)
		p.CellFormat(0, 6, fit(p, kv[1], 135), "", 1, "L", false, 0, "")
	}
	for _, is := range box.Issues {
		p.SetTextColor(160, 30, 30)
		p.CellFormat(0, 6, "! "+L(is), "", 1, "L", false, 0, "")
		p.SetTextColor(16, 29, 38)
	}
	// tartib jadvali
	p.Ln(3)
	p.SetFont("dejavu", "B", 11)
	p.CellFormat(0, 7, L("steps"), "", 1, "L", false, 0, "")
	cols := []struct {
		t string
		w float64
	}{{L("step"), 10}, {L("item"), 62}, {L("artpos"), 24}, {L("size"), 32}, {L("pose"), 30}, {L("layerN"), 12}, {"☐", 12}}
	p.SetFont("dejavu", "B", 8)
	p.SetFillColor(18, 73, 92)
	p.SetTextColor(255, 255, 255)
	for _, cl := range cols {
		p.CellFormat(cl.w, 6, cl.t, "", 0, "L", true, 0, "")
	}
	p.Ln(-1)
	p.SetTextColor(16, 29, 38)
	p.SetFont("dejavu", "", 8.5)
	for _, it := range box.Items {
		if p.GetY() > 272 {
			p.AddPage()
		}
		for i, v := range []string{fmt.Sprint(it.Step), fit(p, it.Name, 60), fit(p, it.ArtPos, 22), dims(it.L, it.W, it.H), fit(p, d.poseText(it), 28), fmt.Sprint(it.Layer + 1), ""} {
			p.CellFormat(cols[i].w, 6, v, "B", 0, "L", false, 0, "")
		}
		p.Ln(-1)
	}
	// rasmlar
	p.AddPage()
	p.SetFont("dejavu", "B", 11)
	p.CellFormat(0, 7, L("side"), "", 1, "L", false, 0, "")
	drawView(p, box, 14, p.GetY()+2, 182, 70, true, -1, d)
	layers := 0
	for _, it := range box.Items {
		if it.Layer+1 > layers {
			layers = it.Layer + 1
		}
	}
	y := p.GetY() + 78
	for ly := 0; ly < layers; ly++ {
		hgt := 80.0
		if y+hgt+10 > 285 {
			p.AddPage()
			y = 14
		}
		p.SetXY(14, y)
		p.SetFont("dejavu", "B", 10)
		p.CellFormat(0, 6, fmt.Sprintf("%s — %s %d", L("top"), L("layerN"), ly+1), "", 1, "L", false, 0, "")
		drawView(p, box, 14, y+7, 182, hgt-8, false, ly, d)
		y += hgt + 4
	}
	return pdfBytes(p)
}

// drawView: karton ichki o'lchamini qutiga sig'dirib chizadi. side = true: yon tomondan (x-z), aks holda yuqoridan (x-y),
// layer >= 0 bo'lsa shu qatlam ajratib ko'rsatiladi, pastki qatlamlar och rangda.
func drawView(p *fpdf.Fpdf, box *upokovka.BoxJSON, x0, y0, maxW, maxH float64, side bool, layer int, d *data) {
	w, h := box.InnerL, box.InnerW
	if side {
		h = box.InnerH
	}
	k := maxW / w
	if maxH/h < k {
		k = maxH / h
	}
	p.SetDrawColor(138, 106, 70)
	p.SetLineWidth(0.5)
	p.Rect(x0, y0, w*k, h*k, "D")
	p.SetFont("dejavu", "B", 7)
	for _, it := range box.Items {
		ix, iw := it.X, it.L
		var iy, ih float64
		if side {
			iy, ih = box.InnerH-(it.Z+it.H), it.H // z yuqoriga
		} else {
			iy, ih = it.Y, it.W
		}
		switch {
		case layer < 0 || it.Layer == layer:
			p.SetFillColor(233, 205, 160)
			p.SetDrawColor(74, 64, 54)
		case it.Layer < layer:
			p.SetFillColor(238, 238, 238)
			p.SetDrawColor(180, 180, 180)
		default:
			continue
		}
		if it.Host != "" {
			p.SetFillColor(200, 225, 210)
		}
		p.SetLineWidth(0.25)
		rx, ry, rw, rh := x0+ix*k, y0+iy*k, iw*k, ih*k
		p.Rect(rx, ry, rw, rh, "FD")
		if layer < 0 || it.Layer == layer {
			p.SetTextColor(16, 29, 38)
			p.SetXY(rx, ry+rh/2-1.8)
			p.CellFormat(rw, 3.6, fmt.Sprint(it.Step), "", 0, "C", false, 0, "")
		}
	}
	p.SetTextColor(16, 29, 38)
}
