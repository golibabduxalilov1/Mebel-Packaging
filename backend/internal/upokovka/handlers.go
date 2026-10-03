package upokovka

import (
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"bazis-upokovka/internal/platform"
)

type Handlers struct{ *platform.App }

// ToSettings: platform sozlamasidan algoritm sozlamasiga.
func ToSettings(p platform.PackSettings) Settings {
	s := Settings{MaxWeight: p.MaxWeight, Manual: p.SizeMode == "manual", Padding: p.Padding, Wall: p.Wall, SquareRatio: p.SquareRatio, IncludeHardware: p.IncludeHardware, BoxLimits: map[int]float64{}}
	if s.Manual {
		s.CapL, s.CapW, s.CapH = p.BoxL, p.BoxW, p.BoxH
	} else {
		s.CapL, s.CapW, s.CapH = p.MaxL, p.MaxW, p.MaxH
	}
	for k, v := range p.BoxLimits {
		if n, err := strconv.Atoi(k); err == nil && v > 0 {
			s.BoxLimits[n] = v
		}
	}
	s.Groups = map[string]GroupSettings{}
	for id, g := range p.Groups {
		s.Groups[id] = GroupSettings{MaxWeight: g.MaxWeight, CapL: g.MaxL, CapW: g.MaxW, CapH: g.MaxH, Padding: g.Padding}
	}
	return s
}

/* ---------- JSON ---------- */

type cavJSON struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
	L float64 `json:"l"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type itemJSON struct {
	UID      string    `json:"uid"`
	RefKind  string    `json:"refKind"`
	RefUID   string    `json:"refUid"`
	Name     string    `json:"name"`
	Material string    `json:"material"`
	Color    string    `json:"color"`
	ArtPos   string    `json:"artPos"`
	X        float64   `json:"x"`
	Y        float64   `json:"y"`
	Z        float64   `json:"z"`
	L        float64   `json:"l"` // karton o'qlari bo'yicha o'lcham
	W        float64   `json:"w"`
	H        float64   `json:"h"`
	UnitL    float64   `json:"unitL"` // detalning o'z o'lchamlari (L >= W >= T)
	UnitW    float64   `json:"unitW"`
	UnitT    float64   `json:"unitT"`
	Rotated  bool      `json:"rotated"`
	Pose     string    `json:"pose"` // flat | upright
	Up       string    `json:"up"`   // tik o'q: T | W | L
	Layer    int       `json:"layer"`
	Step     int       `json:"step"`
	Host     string    `json:"host"`
	Done     bool      `json:"done"`
	Weight   float64   `json:"weight"`
	Geom     string    `json:"geom"`
	Cavities []cavJSON `json:"cavities"`
}

// ItemResult, BoxJSON: eksport moduli uchun.
type ItemResult = itemJSON

type BoxJSON = boxJSON

type boxJSON struct {
	No        int        `json:"no"`
	Group     string     `json:"group"`
	GroupName string     `json:"groupName"`
	L         float64    `json:"l"`
	W         float64    `json:"w"`
	H         float64    `json:"h"`
	InnerL    float64    `json:"innerL"`
	InnerW    float64    `json:"innerW"`
	InnerH    float64    `json:"innerH"`
	Weight    float64    `json:"weight"`
	MaxWeight float64    `json:"maxWeight"`
	Fill      float64    `json:"fill"`
	Ready     bool       `json:"ready"`
	Issues    []string   `json:"issues"`
	Items     []itemJSON `json:"items"`
}

// SizeSummary: buyurtma bo'yicha bir xil o'lchamli kartonlar jamlanmasi.
type SizeSummary struct {
	L      float64 `json:"l"`
	W      float64 `json:"w"`
	H      float64 `json:"h"`
	InnerL float64 `json:"innerL"`
	InnerW float64 `json:"innerW"`
	InnerH float64 `json:"innerH"`
	Count  int     `json:"count"`
	Nos    []int   `json:"nos"`
}

type ResultJSON struct {
	Boxes      []boxJSON     `json:"boxes"`
	Summary    []SizeSummary `json:"summary"`
	Warnings   []Warning     `json:"warnings"`
	Unplaced   []Unplaced    `json:"unplaced"`
	Stale      bool          `json:"stale"`
	ComputedAt time.Time     `json:"computedAt"`
}

/* ---------- saqlash va o'qish ---------- */

func loadItems(db *gorm.DB, orderID uint) ([]ItemIn, string, error) {
	var lab platform.LabDoc
	if err := db.First(&lab, "order_id = ?", orderID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", nil
		}
		return nil, "", err
	}
	var items []ItemIn
	if len(lab.Items) > 0 {
		if err := json.Unmarshal(lab.Items, &items); err != nil {
			return nil, "", err
		}
	}
	return items, lab.Signature, nil
}

// LoadBoxes: bazadagi natija algoritm tuzilmasiga.
func LoadBoxes(db *gorm.DB, orderID uint) ([]BoxOut, error) {
	var rows []platform.Box
	if err := db.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("step, id") }).Where("order_id = ?", orderID).Order("no").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]BoxOut, 0, len(rows))
	for _, b := range rows {
		bo := BoxOut{No: b.No, Group: b.Group, GroupName: b.GroupName, L: b.L, W: b.W, H: b.H, InnerL: b.InnerL, InnerW: b.InnerW, InnerH: b.InnerH,
			Weight: b.Weight, MaxWeight: b.MaxWeight, Fill: b.Fill, Ready: b.Ready}
		for _, it := range b.Items {
			ul, uw, ut := it.UL, it.UW, it.UT
			if ul == 0 { // eski natija: faqat yotqizilgan holat saqlangan edi
				ul, uw, ut = sorted3(it.L, it.W, it.H)
			}
			var cav []Cavity
			if len(it.Cavities) > 0 {
				_ = json.Unmarshal(it.Cavities, &cav)
			}
			bo.Items = append(bo.Items, Placed{
				Unit: Unit{UID: it.UID, RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name, Material: it.Material, Color: it.Color, L: ul, W: uw, H: ut, Weight: it.Weight,
					Group: b.Group, GroupName: b.GroupName, ArtPos: it.ArtPos, Geom: it.Geom, Cav: cav},
				X: it.X, Y: it.Y, Z: it.Z, PL: it.L, PW: it.W, PH: it.H, Orient: it.Orient, Pose: it.Pose, Up: it.Up, Rotated: it.Rotated,
				Layer: it.Layer, Step: it.Step, Host: it.Host, Done: it.Done,
			})
		}
		out = append(out, bo)
	}
	return out, nil
}

func saveBoxes(tx *gorm.DB, orderID uint, boxes []BoxOut) error {
	if err := tx.Where("order_id = ?", orderID).Delete(&platform.BoxItem{}).Error; err != nil {
		return err
	}
	if err := tx.Where("order_id = ?", orderID).Delete(&platform.Box{}).Error; err != nil {
		return err
	}
	for _, b := range boxes {
		row := platform.Box{OrderID: orderID, No: b.No, L: b.L, W: b.W, H: b.H, InnerL: b.InnerL, InnerW: b.InnerW, InnerH: b.InnerH,
			Weight: b.Weight, MaxWeight: b.MaxWeight, Fill: b.Fill, Group: b.Group, GroupName: b.GroupName, Ready: b.Ready}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		items := make([]platform.BoxItem, 0, len(b.Items))
		for _, it := range b.Items {
			var cj datatypes.JSON
			if len(it.Cav) > 0 {
				cb, _ := json.Marshal(it.Cav)
				cj = datatypes.JSON(cb)
			}
			items = append(items, platform.BoxItem{BoxID: row.ID, OrderID: orderID, UID: it.UID, RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name,
				Material: it.Material, Color: it.Color, X: it.X, Y: it.Y, Z: it.Z, L: it.PL, W: it.PW, H: it.PH, Rotated: it.Rotated, Layer: it.Layer, Weight: it.Weight,
				UL: it.Unit.L, UW: it.Unit.W, UT: it.Unit.H, Orient: it.Orient, Pose: it.Pose, Up: it.Up, Step: it.Step, Host: it.Host, Done: it.Done,
				ArtPos: it.ArtPos, Geom: it.Geom, GroupID: it.Group, Cavities: cj})
		}
		if len(items) > 0 {
			if err := tx.CreateInBatches(items, 500).Error; err != nil {
				return err
			}
		}
	}
	return tx.Model(&platform.Order{}).Where("id = ?", orderID).Updates(map[string]any{"boxes_count": len(boxes), "updated_at": time.Now()}).Error
}

func toJSON(boxes []BoxOut, run platform.PackRun, labSig string, st Settings) ResultJSON {
	r := ResultJSON{Boxes: []boxJSON{}, Summary: []SizeSummary{}, Warnings: []Warning{}, Unplaced: []Unplaced{}, ComputedAt: run.ComputedAt, Stale: run.Signature != labSig}
	_ = json.Unmarshal(run.Warnings, &r.Warnings)
	_ = json.Unmarshal(run.Unplaced, &r.Unplaced)
	if r.Warnings == nil {
		r.Warnings = []Warning{}
	}
	if r.Unplaced == nil {
		r.Unplaced = []Unplaced{}
	}
	sumIdx := map[string]int{}
	for _, b := range boxes {
		bj := boxJSON{No: b.No, Group: b.Group, GroupName: b.GroupName, L: b.L, W: b.W, H: b.H, InnerL: b.InnerL, InnerW: b.InnerW, InnerH: b.InnerH,
			Weight: b.Weight, MaxWeight: b.MaxWeight, Fill: b.Fill, Ready: b.Ready, Items: []itemJSON{}, Issues: Check(b, st)}
		if bj.Issues == nil {
			bj.Issues = []string{}
		}
		for _, it := range b.Items {
			ij := itemJSON{UID: it.UID, RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name, Material: it.Material, Color: it.Color, ArtPos: it.ArtPos,
				X: it.X, Y: it.Y, Z: it.Z, L: it.PL, W: it.PW, H: it.PH, UnitL: it.Unit.L, UnitW: it.Unit.W, UnitT: it.Unit.H, Rotated: it.Rotated,
				Pose: it.Pose, Up: it.Up, Layer: it.Layer, Step: it.Step, Host: it.Host, Done: it.Done, Weight: round(it.Weight, 3), Geom: it.Geom, Cavities: []cavJSON{}}
			if it.Orient >= 0 && it.Orient < len(orients) {
				o := orients[it.Orient]
				for _, cv := range it.Cav {
					cx, cy, cz, cl, cw, ch := o.mapCav(cv, it.Unit)
					ij.Cavities = append(ij.Cavities, cavJSON{X: it.X + cx, Y: it.Y + cy, Z: it.Z + cz, L: cl, W: cw, H: ch})
				}
			}
			bj.Items = append(bj.Items, ij)
		}
		r.Boxes = append(r.Boxes, bj)
		k := SizeKey(b)
		if i, ok := sumIdx[k]; ok {
			r.Summary[i].Count++
			r.Summary[i].Nos = append(r.Summary[i].Nos, b.No)
		} else {
			sumIdx[k] = len(r.Summary)
			r.Summary = append(r.Summary, SizeSummary{L: math.Round(b.L), W: math.Round(b.W), H: math.Round(b.H), InnerL: b.InnerL, InnerW: b.InnerW, InnerH: b.InnerH, Count: 1, Nos: []int{b.No}})
		}
	}
	sort.SliceStable(r.Summary, func(i, j int) bool {
		return r.Summary[i].L*r.Summary[i].W*r.Summary[i].H > r.Summary[j].L*r.Summary[j].W*r.Summary[j].H
	})
	return r
}

// CurrentResult: eksport moduli ham ishlatadi.
func CurrentResult(db *gorm.DB, orderID uint) (*ResultJSON, error) {
	var run platform.PackRun
	if err := db.First(&run, "order_id = ?", orderID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	boxes, err := LoadBoxes(db, orderID)
	if err != nil {
		return nil, err
	}
	_, sig, err := loadItems(db, orderID)
	if err != nil {
		return nil, err
	}
	r := toJSON(boxes, run, sig, ToSettings(platform.LoadPackSettings(db, orderID)))
	return &r, nil
}

/* ---------- handlerlar ---------- */

func (h Handlers) Get(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	if err := h.DB.First(&platform.Order{}, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	items, _, err := loadItems(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	n := 0
	for _, it := range items {
		n += it.Qty
	}
	res, err := CurrentResult(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	return c.JSON(fiber.Map{"settings": platform.LoadPackSettings(h.DB, id), "result": res, "itemsCount": n})
}

func (h Handlers) SaveSettings(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var s platform.PackSettings
	if err := c.BodyParser(&s); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	if err := platform.ValidatePackSettings(&s); err != nil {
		return platform.Fail(c, 400, err.Error(), "invalid")
	}
	if err := platform.SavePackSettings(h.DB, id, s); err != nil {
		return platform.DBFail(c, err)
	}
	return c.JSON(s)
}

func (h Handlers) Run(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	items, sig, err := loadItems(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	if len(items) == 0 {
		return platform.Fail(c, 400, "laboratoriyada saqlangan detallar yo'q: avval modelni oching va saqlang", "no_items")
	}
	ps := platform.LoadPackSettings(h.DB, id)
	if err := platform.ValidatePackSettings(&ps); err != nil {
		return platform.Fail(c, 400, err.Error(), "invalid")
	}
	res := Pack(items, ToSettings(ps))
	wb, _ := json.Marshal(res.Warnings)
	ub, _ := json.Marshal(res.Unplaced)
	run := platform.PackRun{OrderID: id, Warnings: datatypes.JSON(wb), Unplaced: datatypes.JSON(ub), Signature: sig, ComputedAt: time.Now()}
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := saveBoxes(tx, id, res.Boxes); err != nil {
			return err
		}
		if err := tx.Save(&run).Error; err != nil {
			return err
		}
		return tx.Model(&platform.Order{}).Where("id = ? and status in ?", id, []string{"new", "lab"}).Update("status", "packed").Error
	})
	if err != nil {
		return platform.DBFail(c, err)
	}
	return c.JSON(toJSON(res.Boxes, run, sig, ToSettings(ps)))
}

func (h Handlers) respondCurrent(c *fiber.Ctx, id uint) error {
	res, err := CurrentResult(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	return c.JSON(res)
}

func editErr(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, ErrOverLimit):
		return platform.Fail(c, 409, err.Error(), "over_limit")
	case errors.Is(err, ErrNoFit):
		return platform.Fail(c, 409, err.Error(), "no_fit")
	case errors.Is(err, ErrGroupMix):
		return platform.Fail(c, 409, err.Error(), "group_mix")
	case errors.Is(err, ErrCompositeSplit):
		return platform.Fail(c, 409, err.Error(), "composite_split")
	case errors.Is(err, ErrNotAllDone):
		return platform.Fail(c, 409, err.Error(), "not_all_done")
	case errors.Is(err, ErrNotFound):
		return platform.Fail(c, 404, err.Error(), "not_found")
	}
	return platform.Fail(c, 400, err.Error())
}

// compositeOfPart: detal yelimlangan kompozit a'zosi bo'lsa kompozit id si (laboratoriya hujjati bo'yicha).
func compositeOfPart(db *gorm.DB, orderID uint, partID string) string {
	var lab platform.LabDoc
	if db.First(&lab, "order_id = ?", orderID).Error != nil || len(lab.Doc) == 0 {
		return ""
	}
	var doc struct {
		Composites []struct {
			ID      string `json:"id"`
			Members []struct {
				PartID string `json:"partId"`
			} `json:"members"`
		} `json:"composites"`
	}
	if json.Unmarshal(lab.Doc, &doc) != nil {
		return ""
	}
	for _, c := range doc.Composites {
		for _, m := range c.Members {
			if m.PartID == partID {
				return c.ID
			}
		}
	}
	return ""
}

// Move (F27): elementni boshqa kartonga; og'irlik limiti, sig'im, tayanch qayta tekshiriladi.
// Yelimlangan kompozitning bir qismini ko'chirish (partId) rad etiladi; guruhlar aralashmaydi.
func (h Handlers) Move(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var in struct {
		ItemUID string `json:"itemUid"`
		PartID  string `json:"partId"`
		ToBox   int    `json:"toBox"`
	}
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	if in.PartID != "" && compositeOfPart(h.DB, id, in.PartID) != "" {
		return editErr(c, ErrCompositeSplit)
	}
	boxes, err := LoadBoxes(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	moved, err := Move(boxes, in.ItemUID, in.ToBox, ToSettings(platform.LoadPackSettings(h.DB, id)))
	if err != nil {
		return editErr(c, err)
	}
	if err := h.DB.Transaction(func(tx *gorm.DB) error { return saveBoxes(tx, id, resetMarks(boxes, moved)) }); err != nil {
		return platform.DBFail(c, err)
	}
	return h.respondCurrent(c, id)
}

// resetMarks: ko'chirishdan keyin joylashuvi o'zgargan kartonlarning belgilari tozalanadi, qolganlariniki saqlanadi.
func resetMarks(old, moved []BoxOut) []BoxOut {
	prev := map[string]Placed{}
	for _, b := range old {
		for _, it := range b.Items {
			prev[it.UID] = it
		}
	}
	for i := range moved {
		same := true
		for _, it := range moved[i].Items {
			p, ok := prev[it.UID]
			if !ok || p.X != it.X || p.Y != it.Y || p.Z != it.Z || p.Orient != it.Orient {
				same = false
			}
		}
		if !same {
			moved[i].Ready = false
			for j := range moved[i].Items {
				moved[i].Items[j].Done = false
			}
		} else {
			for j := range moved[i].Items {
				moved[i].Items[j].Done = prev[moved[i].Items[j].UID].Done
			}
		}
	}
	return moved
}

// MarkItem: operator "Joylandi" belgisi (P11 yoki P7).
func (h Handlers) MarkItem(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var in struct {
		ItemUID string `json:"itemUid"`
		Done    bool   `json:"done"`
	}
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	boxes, err := LoadBoxes(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	boxes, err = SetDone(boxes, in.ItemUID, in.Done)
	if err != nil {
		return editErr(c, err)
	}
	if err := h.DB.Transaction(func(tx *gorm.DB) error { return saveBoxes(tx, id, boxes) }); err != nil {
		return platform.DBFail(c, err)
	}
	return h.respondCurrent(c, id)
}

// MarkReady: karton "Tayyor" belgisi (P11 yoki P7); barcha detallar joylangan bo'lishi kerak.
func (h Handlers) MarkReady(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	no, err := strconv.Atoi(c.Params("no"))
	if err != nil || no <= 0 {
		return platform.Fail(c, 400, "karton raqami noto'g'ri")
	}
	var in struct {
		Ready bool `json:"ready"`
	}
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	boxes, err := LoadBoxes(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	boxes, err = SetReady(boxes, no, in.Ready)
	if err != nil {
		return editErr(c, err)
	}
	if err := h.DB.Transaction(func(tx *gorm.DB) error { return saveBoxes(tx, id, boxes) }); err != nil {
		return platform.DBFail(c, err)
	}
	return h.respondCurrent(c, id)
}

// BoxLimit: bitta quti limiti (F21). Sozlamadagi BoxLimits ham yangilanadi, qayta hisoblashda qo'llanadi.
func (h Handlers) BoxLimit(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	no, err := strconv.Atoi(c.Params("no"))
	if err != nil || no <= 0 {
		return platform.Fail(c, 400, "karton raqami noto'g'ri")
	}
	var in struct {
		MaxWeight *float64 `json:"maxWeight"`
	}
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	ps := platform.LoadPackSettings(h.DB, id)
	boxes, err := LoadBoxes(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	boxes, err = SetLimit(boxes, no, in.MaxWeight, ToSettings(ps))
	if err != nil {
		return editErr(c, err)
	}
	if in.MaxWeight == nil {
		delete(ps.BoxLimits, strconv.Itoa(no))
	} else {
		ps.BoxLimits[strconv.Itoa(no)] = *in.MaxWeight
	}
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := platform.SavePackSettings(tx, id, ps); err != nil {
			return err
		}
		return tx.Model(&platform.Box{}).Where("order_id = ? and no = ?", id, no).Update("max_weight", boxes[no-1].MaxWeight).Error
	})
	if err != nil {
		return platform.DBFail(c, err)
	}
	return h.respondCurrent(c, id)
}

// ToJSONForTest: sinovlar uchun (bazasiz) natijani JSON tuzilmasiga o'tkazadi.
func ToJSONForTest(boxes []BoxOut, run platform.PackRun, st Settings) ResultJSON {
	return toJSON(boxes, run, "", st)
}
