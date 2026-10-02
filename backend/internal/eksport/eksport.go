// Package eksport: upokovka hisoboti (Excel, PDF) va quti yorliqlari (PDF), F28, F29.
package eksport

import (
	"bytes"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"

	"bazis-upokovka/internal/platform"
	"bazis-upokovka/internal/upokovka"
)

type Handlers struct{ *platform.App }

var dict = map[string]map[string]string{
	"uz": {
		"title": "Upokovka hisoboti", "order": "Buyurtma", "name": "Nomi", "client": "Mijoz", "date": "Sana", "gabarit": "Gabarit", "parts": "Detallar",
		"boxes": "Qutilar", "totalW": "Jami og'irlik", "avgFill": "O'rtacha to'lish", "no": "№", "outer": "Tashqi o'lcham, mm", "inner": "Ichki o'lcham, mm",
		"weight": "Og'irlik, kg", "limit": "Limit, kg", "fill": "To'lish, %", "items": "Elementlar", "contents": "Tarkibi", "item": "Element",
		"material": "Material", "size": "O'lcham, mm", "layer": "Qatlam", "warnings": "Ogohlantirishlar", "code": "Turi", "reason": "Izoh",
		"box": "QUTI", "of": "dan", "stale": "Diqqat: laboratoriyada o'zgarish bor, natija eskirgan.", "more": "yana",
		"unfit": "Qutiga sig'maydi", "unknown_weight": "Og'irligi noma'lum", "unknown_size": "O'lchami noma'lum", "hardware_no_size": "Furnitura o'lchamsiz", "overweight_item": "Limitdan og'ir",
		"bbox_only": "Geometriyasi yo'q: chegara qutisi ishlatildi", "group": "Guruh", "common": "Umumiy", "len": "Uzunlik", "wid": "Eni", "hei": "Balandlik",
		"summary": "Kartonlar jamlanmasi", "count": "Soni", "nos": "Karton raqamlari", "step": "Qadam", "pose": "Holati", "flat": "yotqizilgan", "upright": "tik",
		"inside": "ichida", "instruction": "Karton ko'rsatmasi", "steps": "Joylash tartibi (pastdan yuqoriga)", "top": "Yuqoridan ko'rinish", "side": "Yon tomondan ko'rinish",
		"layerN": "Qatlam", "artpos": "ArtPos", "ready": "Tayyor", "done": "Joylandi", "issues": "Cheklovlar", "over_weight": "Og'irlik limiti oshgan", "over_size": "Karton maksimal o'lchamdan katta",
		"outside": "Detal karton tashqarisida", "overlap": "Detallar kesishadi", "unsupported": "Detal tayanchsiz yoki og'ir detal yengil ustida", "pos": "Joyi (x, y, z)",
	},
	"ru": {
		"title": "Отчёт по упаковке", "order": "Заказ", "name": "Название", "client": "Клиент", "date": "Дата", "gabarit": "Габарит", "parts": "Деталей",
		"boxes": "Коробки", "totalW": "Общий вес", "avgFill": "Средняя заполненность", "no": "№", "outer": "Наружный размер, мм", "inner": "Внутренний размер, мм",
		"weight": "Вес, кг", "limit": "Лимит, кг", "fill": "Заполнение, %", "items": "Элементов", "contents": "Состав", "item": "Элемент",
		"material": "Материал", "size": "Размер, мм", "layer": "Слой", "warnings": "Предупреждения", "code": "Тип", "reason": "Примечание",
		"box": "КОРОБКА", "of": "из", "stale": "Внимание: в лаборатории есть изменения, результат устарел.", "more": "ещё",
		"unfit": "Не помещается", "unknown_weight": "Вес неизвестен", "unknown_size": "Размер неизвестен", "hardware_no_size": "Фурнитура без размеров", "overweight_item": "Тяжелее лимита",
		"bbox_only": "Нет геометрии: использован габаритный бокс", "group": "Группа", "common": "Общая", "len": "Длина", "wid": "Ширина", "hei": "Высота",
		"summary": "Сводка коробок", "count": "Кол-во", "nos": "Номера коробок", "step": "Шаг", "pose": "Положение", "flat": "плашмя", "upright": "стоя",
		"inside": "внутри", "instruction": "Инструкция по коробке", "steps": "Порядок укладки (снизу вверх)", "top": "Вид сверху", "side": "Вид сбоку",
		"layerN": "Слой", "artpos": "ArtPos", "ready": "Готово", "done": "Уложено", "issues": "Ограничения", "over_weight": "Превышен лимит веса", "over_size": "Коробка больше максимального размера",
		"outside": "Деталь вне коробки", "overlap": "Детали пересекаются", "unsupported": "Деталь без опоры или тяжёлая на лёгкой", "pos": "Позиция (x, y, z)",
	},
}

func tr(lang, k string) string {
	if d, ok := dict[lang]; ok {
		if v, ok := d[k]; ok {
			return v
		}
	}
	return dict["uz"][k]
}

type upItem = upokovka.ItemResult

type data struct {
	order platform.Order
	res   *upokovka.ResultJSON
	lang  string
}

func (h Handlers) load(c *fiber.Ctx) (*data, error) {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return nil, err
	}
	var o platform.Order
	if err := h.DB.First(&o, id).Error; err != nil {
		return nil, fiber.NewError(404, "buyurtma topilmadi")
	}
	res, err := upokovka.CurrentResult(h.DB, id)
	if err != nil {
		return nil, err
	}
	if res == nil || len(res.Boxes) == 0 {
		return nil, fiber.NewError(400, "upokovka hali hisoblanmagan")
	}
	lang := c.Query("lang", platform.Me(c).Lang)
	if lang != "ru" {
		lang = "uz"
	}
	return &data{order: o, res: res, lang: lang}, nil
}

func dims(l, w, h float64) string { return fmt.Sprintf("%.0f × %.0f × %.0f", l, w, h) }

// groupLabel: karton guruhi nomi (umumiy bo'lsa "Umumiy").
// poseText: detal qanday qo'yilishi (yotqizilgan yoki tik) va ichiga joylanganmi.
func (d *data) poseText(it upItem) string {
	t := tr(d.lang, it.Pose)
	if it.Pose == "upright" && it.Up != "" {
		t += " (" + it.Up + ")"
	}
	if it.Host != "" {
		t += ", " + tr(d.lang, "inside")
	}
	return t
}

func (d *data) groupLabel(g, name string) string {
	if g == "" {
		return tr(d.lang, "common")
	}
	if name != "" {
		return name
	}
	return g
}

func (d *data) totals() (float64, float64, int) {
	tw, tf, n := 0.0, 0.0, 0
	for _, b := range d.res.Boxes {
		tw += b.Weight
		tf += b.Fill
		n += len(b.Items)
	}
	if len(d.res.Boxes) > 0 {
		tf /= float64(len(d.res.Boxes))
	}
	return tw, tf, n
}

func fileName(o platform.Order, suffix string) string {
	return strings.ReplaceAll(o.Number, "/", "-") + "_" + suffix
}

func attach(c *fiber.Ctx, name, ctype string, b []byte) error {
	c.Set("Content-Type", ctype)
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	return c.Send(b)
}

/* ---------- Excel ---------- */

func (h Handlers) ReportXLSX(c *fiber.Ctx) error {
	d, err := h.load(c)
	if err != nil {
		return err
	}
	L := func(k string) string { return tr(d.lang, k) }
	f := excelize.NewFile()
	defer f.Close()
	head, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "#FFFFFF"}, Fill: excelize.Fill{Type: "pattern", Color: []string{"#12495C"}, Pattern: 1},
		Alignment: &excelize.Alignment{Vertical: "center", WrapText: true}})
	bold, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	title, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 14, Color: "#12495C"}})
	warn, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Color: "#714A00"}, Fill: excelize.Fill{Type: "pattern", Color: []string{"#FFF0C6"}, Pattern: 1}})

	s1 := L("boxes")
	f.SetSheetName("Sheet1", s1)
	set := func(sheet string, col, row int, v any) {
		cell, _ := excelize.CoordinatesToCellName(col, row)
		f.SetCellValue(sheet, cell, v)
	}
	style := func(sheet string, c1, r1, c2, r2, st int) {
		a, _ := excelize.CoordinatesToCellName(c1, r1)
		b, _ := excelize.CoordinatesToCellName(c2, r2)
		f.SetCellStyle(sheet, a, b, st)
	}
	set(s1, 1, 1, L("title"))
	style(s1, 1, 1, 1, 1, title)
	tw, tf, n := d.totals()
	info := [][2]any{{L("order"), d.order.Number}, {L("name"), d.order.Name}, {L("client"), d.order.Client}, {L("date"), time.Now().Format("02.01.2006 15:04")},
		{L("gabarit"), d.order.Gabarit}, {L("parts"), d.order.PartsCount}, {L("boxes"), len(d.res.Boxes)}, {L("items"), n},
		{L("totalW"), fmt.Sprintf("%.2f kg", tw)}, {L("avgFill"), fmt.Sprintf("%.0f%%", tf*100)}}
	for i, kv := range info {
		set(s1, 1, 3+i, kv[0])
		set(s1, 2, 3+i, kv[1])
		style(s1, 1, 3+i, 1, 3+i, bold)
	}
	r := 4 + len(info)
	if d.res.Stale {
		set(s1, 1, r, L("stale"))
		style(s1, 1, r, 6, r, warn)
		r += 2
	}
	hdr := []string{L("no"), L("group"), L("len") + " (" + L("outer") + ")", L("wid"), L("hei"), L("len") + " (" + L("inner") + ")", L("wid"), L("hei"),
		L("weight"), L("limit"), L("fill"), L("items")}
	for i, t := range hdr {
		set(s1, i+1, r, t)
	}
	style(s1, 1, r, len(hdr), r, head)
	for _, b := range d.res.Boxes {
		r++
		vals := []any{b.No, d.groupLabel(b.Group, b.GroupName), b.L, b.W, b.H, b.InnerL, b.InnerW, b.InnerH, b.Weight, b.MaxWeight, int(b.Fill*100 + 0.5), len(b.Items)}
		for i, v := range vals {
			set(s1, i+1, r, v)
		}
	}
	f.SetColWidth(s1, "A", "A", 22)
	f.SetColWidth(s1, "B", "B", 24)
	f.SetColWidth(s1, "C", "H", 14)
	f.SetColWidth(s1, "I", "L", 12)
	// buyurtma bo'yicha bir xil o'lchamli kartonlar jamlanmasi
	r += 2
	set(s1, 1, r, L("summary"))
	style(s1, 1, r, 1, r, bold)
	r++
	for i, t := range []string{L("len") + " (" + L("outer") + ")", L("wid"), L("hei"), L("count"), L("nos")} {
		set(s1, i+1, r, t)
	}
	style(s1, 1, r, 5, r, head)
	for _, sm := range d.res.Summary {
		r++
		nos := make([]string, len(sm.Nos))
		for i, n := range sm.Nos {
			nos[i] = fmt.Sprint(n)
		}
		for i, v := range []any{sm.L, sm.W, sm.H, sm.Count, strings.Join(nos, ", ")} {
			set(s1, i+1, r, v)
		}
	}

	s2 := L("contents")
	f.NewSheet(s2)
	hdr2 := []string{L("no"), L("group"), L("step"), L("item"), L("artpos"), L("material"), L("size"), L("pose"), L("weight"), L("layer")}
	for i, t := range hdr2 {
		set(s2, i+1, 1, t)
	}
	style(s2, 1, 1, len(hdr2), 1, head)
	r = 1
	for _, b := range d.res.Boxes {
		items := append([]upItem(nil), b.Items...)
		sort.SliceStable(items, func(i, j int) bool { return items[i].Step < items[j].Step })
		for _, it := range items {
			r++
			for i, v := range []any{b.No, d.groupLabel(b.Group, b.GroupName), it.Step, it.Name, it.ArtPos, it.Material, dims(it.L, it.W, it.H), d.poseText(it), it.Weight, it.Layer + 1} {
				set(s2, i+1, r, v)
			}
		}
	}
	f.SetColWidth(s2, "A", "A", 6)
	f.SetColWidth(s2, "B", "B", 20)
	f.SetColWidth(s2, "C", "C", 7)
	f.SetColWidth(s2, "D", "D", 36)
	f.SetColWidth(s2, "E", "F", 20)
	f.SetColWidth(s2, "G", "H", 22)
	f.SetColWidth(s2, "I", "J", 10)

	if len(d.res.Warnings) > 0 || len(d.res.Unplaced) > 0 {
		s3 := L("warnings")
		f.NewSheet(s3)
		for i, t := range []string{L("item"), L("code"), L("size"), L("reason")} {
			set(s3, i+1, 1, t)
		}
		style(s3, 1, 1, 4, 1, head)
		r = 1
		for _, w := range d.res.Warnings {
			r++
			set(s3, 1, r, w.Name)
			set(s3, 2, r, L(w.Code))
			set(s3, 3, r, w.Size)
			set(s3, 4, r, strings.TrimSpace(w.Reason))
		}
		for _, u := range d.res.Unplaced {
			r++
			set(s3, 1, r, u.Name)
			set(s3, 2, r, L("unfit"))
			set(s3, 4, r, fmt.Sprintf("× %d %s", u.Qty, u.Reason))
		}
		f.SetColWidth(s3, "A", "A", 36)
		f.SetColWidth(s3, "B", "D", 24)
	}
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return err
	}
	return attach(c, fileName(d.order, "report.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf.Bytes())
}

/* ---------- PDF ---------- */

func (h Handlers) newPDF(size fpdf.SizeType, orient string) *fpdf.Fpdf {
	p := fpdf.NewCustom(&fpdf.InitType{OrientationStr: orient, UnitStr: "mm", Size: size})
	p.AddUTF8Font("dejavu", "", filepath.Join(h.Cfg.FontsDir, "DejaVuSans.ttf"))
	p.AddUTF8Font("dejavu", "B", filepath.Join(h.Cfg.FontsDir, "DejaVuSans-Bold.ttf"))
	p.SetAutoPageBreak(true, 12)
	return p
}

func pdfBytes(p *fpdf.Fpdf) ([]byte, error) {
	var buf bytes.Buffer
	if err := p.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func fit(p *fpdf.Fpdf, s string, w float64) string {
	if p.GetStringWidth(s) <= w {
		return s
	}
	r := []rune(s)
	for len(r) > 1 && p.GetStringWidth(string(r)+"…") > w {
		r = r[:len(r)-1]
	}
	return string(r) + "…"
}

func (h Handlers) ReportPDF(c *fiber.Ctx) error {
	d, err := h.load(c)
	if err != nil {
		return err
	}
	L := func(k string) string { return tr(d.lang, k) }
	p := h.newPDF(fpdf.SizeType{Wd: 210, Ht: 297}, "P")
	p.SetMargins(14, 14, 14)
	p.AddPage()
	p.SetTextColor(18, 73, 92)
	p.SetFont("dejavu", "B", 16)
	p.CellFormat(0, 9, L("title"), "", 1, "L", false, 0, "")
	p.SetTextColor(16, 29, 38)
	p.SetFont("dejavu", "", 10)
	tw, tf, n := d.totals()
	rows := [][2]string{{L("order"), d.order.Number}, {L("name"), d.order.Name}, {L("client"), d.order.Client}, {L("date"), time.Now().Format("02.01.2006 15:04")},
		{L("gabarit"), d.order.Gabarit}, {L("boxes"), fmt.Sprint(len(d.res.Boxes))}, {L("items"), fmt.Sprint(n)},
		{L("totalW"), fmt.Sprintf("%.2f kg", tw)}, {L("avgFill"), fmt.Sprintf("%.0f%%", tf*100)}}
	for _, kv := range rows {
		p.SetFont("dejavu", "B", 10)
		p.CellFormat(45, 6, kv[0], "", 0, "L", false, 0, "")
		p.SetFont("dejavu", "", 10)
		p.CellFormat(0, 6, kv[1], "", 1, "L", false, 0, "")
	}
	if d.res.Stale {
		p.Ln(2)
		p.SetFillColor(255, 240, 198)
		p.SetTextColor(113, 74, 0)
		p.CellFormat(0, 7, L("stale"), "", 1, "L", true, 0, "")
		p.SetTextColor(16, 29, 38)
	}
	p.Ln(4)
	// qutilar jadvali
	cols := []struct {
		t string
		w float64
	}{{L("no"), 9}, {L("group"), 28}, {L("outer"), 38}, {L("inner"), 38}, {L("weight"), 20}, {L("limit"), 16}, {L("fill"), 16}, {L("items"), 17}}
	header := func() {
		p.SetFont("dejavu", "B", 8.5)
		p.SetFillColor(18, 73, 92)
		p.SetTextColor(255, 255, 255)
		for _, c := range cols {
			p.CellFormat(c.w, 7, c.t, "", 0, "L", true, 0, "")
		}
		p.Ln(-1)
		p.SetTextColor(16, 29, 38)
		p.SetFont("dejavu", "", 9)
	}
	header()
	for i, b := range d.res.Boxes {
		fill := i%2 == 1
		p.SetFillColor(246, 248, 250)
		vals := []string{fmt.Sprint(b.No), fit(p, d.groupLabel(b.Group, b.GroupName), 26), dims(b.L, b.W, b.H), dims(b.InnerL, b.InnerW, b.InnerH), fmt.Sprintf("%.2f", b.Weight), fmt.Sprintf("%.1f", b.MaxWeight),
			fmt.Sprintf("%.0f", b.Fill*100), fmt.Sprint(len(b.Items))}
		for j, c := range cols {
			p.CellFormat(c.w, 6, vals[j], "", 0, "L", fill, 0, "")
		}
		p.Ln(-1)
	}
	// buyurtma bo'yicha bir xil o'lchamli kartonlar jamlanmasi
	p.Ln(5)
	p.SetFont("dejavu", "B", 11)
	p.CellFormat(0, 7, L("summary"), "", 1, "L", false, 0, "")
	p.SetFont("dejavu", "", 9)
	for _, sm := range d.res.Summary {
		nos := make([]string, len(sm.Nos))
		for i, n := range sm.Nos {
			nos[i] = fmt.Sprint(n)
		}
		p.CellFormat(60, 6, dims(sm.L, sm.W, sm.H)+" mm", "B", 0, "L", false, 0, "")
		p.CellFormat(24, 6, fmt.Sprintf("× %d", sm.Count), "B", 0, "L", false, 0, "")
		p.CellFormat(0, 6, fit(p, "№ "+strings.Join(nos, ", "), 96), "B", 1, "L", false, 0, "")
	}
	// har bir quti tarkibi
	for _, b := range d.res.Boxes {
		p.Ln(4)
		if p.GetY() > 250 {
			p.AddPage()
		}
		p.SetFont("dejavu", "B", 11)
		p.SetTextColor(138, 106, 70)
		p.CellFormat(0, 7, fmt.Sprintf("%s №%d · %s · %s mm · %.2f kg", L("box"), b.No, d.groupLabel(b.Group, b.GroupName), dims(b.L, b.W, b.H), b.Weight), "", 1, "L", false, 0, "")
		p.SetTextColor(16, 29, 38)
		p.SetFont("dejavu", "", 8.5)
		for _, it := range b.Items {
			if p.GetY() > 280 {
				p.AddPage()
			}
			p.CellFormat(84, 5, fit(p, it.Name, 82), "B", 0, "L", false, 0, "")
			p.CellFormat(40, 5, fit(p, it.Material, 38), "B", 0, "L", false, 0, "")
			p.CellFormat(34, 5, dims(it.L, it.W, it.H), "B", 0, "L", false, 0, "")
			p.CellFormat(14, 5, fmt.Sprintf("%.2f", it.Weight), "B", 0, "R", false, 0, "")
			p.CellFormat(10, 5, fmt.Sprint(it.Layer+1), "B", 1, "R", false, 0, "")
		}
	}
	if len(d.res.Warnings) > 0 {
		p.Ln(5)
		p.SetFont("dejavu", "B", 11)
		p.CellFormat(0, 7, L("warnings"), "", 1, "L", false, 0, "")
		p.SetFont("dejavu", "", 8.5)
		for _, w := range d.res.Warnings {
			p.MultiCell(0, 5, fmt.Sprintf("• %s: %s %s %s", L(w.Code), w.Name, w.Size, strings.TrimSpace(w.Reason)), "", "L", false)
		}
	}
	b, err := pdfBytes(p)
	if err != nil {
		return err
	}
	return attach(c, fileName(d.order, "report.pdf"), "application/pdf", b)
}

// LabelsPDF: har bir qutiga bitta A6 yorliq (F29).
func (h Handlers) LabelsPDF(c *fiber.Ctx) error {
	d, err := h.load(c)
	if err != nil {
		return err
	}
	L := func(k string) string { return tr(d.lang, k) }
	p := h.newPDF(fpdf.SizeType{Wd: 105, Ht: 148}, "P")
	p.SetMargins(7, 7, 7)
	p.SetAutoPageBreak(false, 0)
	total := len(d.res.Boxes)
	for _, b := range d.res.Boxes {
		p.AddPage()
		p.SetDrawColor(138, 106, 70)
		p.SetLineWidth(0.6)
		p.Rect(4, 4, 97, 140, "D")
		p.SetXY(7, 8)
		p.SetFont("dejavu", "B", 11)
		p.SetTextColor(16, 29, 38)
		p.CellFormat(55, 6, fit(p, d.order.Client, 54), "", 0, "L", false, 0, "")
		p.SetFont("dejavu", "", 9)
		p.CellFormat(36, 6, d.order.Number, "", 1, "R", false, 0, "")
		p.SetX(7)
		p.SetFont("dejavu", "", 9)
		p.MultiCell(91, 4.6, fit(p, d.order.Name, 180), "", "L", false)
		p.SetY(30)
		p.SetFillColor(18, 73, 92)
		p.Rect(7, 30, 91, 30, "F")
		p.SetTextColor(255, 255, 255)
		p.SetXY(10, 32)
		p.SetFont("dejavu", "", 9)
		p.CellFormat(0, 5, L("box"), "", 1, "L", false, 0, "")
		p.SetX(10)
		p.SetFont("dejavu", "B", 30)
		p.CellFormat(0, 18, fmt.Sprintf("%d / %d", b.No, total), "", 1, "L", false, 0, "")
		p.SetTextColor(16, 29, 38)
		p.SetXY(7, 64)
		p.SetFont("dejavu", "B", 15)
		p.CellFormat(50, 8, fmt.Sprintf("%.1f kg", b.Weight), "", 0, "L", false, 0, "")
		p.SetFont("dejavu", "", 9)
		p.CellFormat(41, 8, dims(b.L, b.W, b.H)+" mm", "", 1, "R", false, 0, "")
		p.SetX(7)
		p.SetFont("dejavu", "", 7.5)
		p.CellFormat(0, 4, fit(p, L("inner")+": "+dims(b.InnerL, b.InnerW, b.InnerH)+" · "+L("group")+": "+d.groupLabel(b.Group, b.GroupName), 91), "", 1, "L", false, 0, "")
		p.SetDrawColor(201, 164, 121)
		p.SetLineWidth(0.3)
		p.SetDashPattern([]float64{1.2, 1}, 0)
		p.Line(7, 80, 98, 80)
		p.SetDashPattern([]float64{}, 0)
		p.SetXY(7, 83)
		p.SetFont("dejavu", "B", 8.5)
		p.CellFormat(0, 5, L("contents"), "", 1, "L", false, 0, "")
		// bir xil nomlarni guruhlab ko'rsatish
		type agg struct {
			name string
			n    int
		}
		var list []agg
		idx := map[string]int{}
		for _, it := range b.Items {
			if i, ok := idx[it.Name]; ok {
				list[i].n++
				continue
			}
			idx[it.Name] = len(list)
			list = append(list, agg{it.Name, 1})
		}
		p.SetFont("dejavu", "", 8)
		maxLines := 10
		for i, a := range list {
			if i == maxLines-1 && len(list) > maxLines {
				p.SetX(7)
				p.CellFormat(0, 4.6, fmt.Sprintf("… %s %d", L("more"), len(list)-i), "", 1, "L", false, 0, "")
				break
			}
			p.SetX(7)
			p.CellFormat(78, 4.6, fit(p, a.name, 76), "", 0, "L", false, 0, "")
			p.CellFormat(13, 4.6, fmt.Sprintf("× %d", a.n), "", 1, "R", false, 0, "")
		}
		p.SetXY(7, 136)
		p.SetFont("dejavu", "", 7)
		p.SetTextColor(82, 101, 119)
		p.CellFormat(0, 4, time.Now().Format("02.01.2006")+" · Bazis upokovka", "", 0, "L", false, 0, "")
	}
	bts, err := pdfBytes(p)
	if err != nil {
		return err
	}
	return attach(c, fileName(d.order, "labels.pdf"), "application/pdf", bts)
}
