package upokovka

import (
	"encoding/json"
	"errors"
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
	s := Settings{MaxWeight: p.MaxWeight, Manual: p.SizeMode == "manual", Padding: p.Padding, Wall: p.Wall, IncludeHardware: p.IncludeHardware, BoxLimits: map[int]float64{}}
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
	return s
}

/* ---------- JSON ---------- */

type itemJSON struct {
	UID      string  `json:"uid"`
	RefKind  string  `json:"refKind"`
	RefUID   string  `json:"refUid"`
	Name     string  `json:"name"`
	Material string  `json:"material"`
	Color    string  `json:"color"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Z        float64 `json:"z"`
	L        float64 `json:"l"`
	W        float64 `json:"w"`
	H        float64 `json:"h"`
	Rotated  bool    `json:"rotated"`
	Layer    int     `json:"layer"`
	Weight   float64 `json:"weight"`
}

type boxJSON struct {
	No        int        `json:"no"`
	L         float64    `json:"l"`
	W         float64    `json:"w"`
	H         float64    `json:"h"`
	InnerL    float64    `json:"innerL"`
	InnerW    float64    `json:"innerW"`
	InnerH    float64    `json:"innerH"`
	Weight    float64    `json:"weight"`
	MaxWeight float64    `json:"maxWeight"`
	Fill      float64    `json:"fill"`
	Items     []itemJSON `json:"items"`
}

type ResultJSON struct {
	Boxes      []boxJSON  `json:"boxes"`
	Warnings   []Warning  `json:"warnings"`
	Unplaced   []Unplaced `json:"unplaced"`
	Stale      bool       `json:"stale"`
	ComputedAt time.Time  `json:"computedAt"`
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
	if err := db.Preload("Items", func(q *gorm.DB) *gorm.DB { return q.Order("id") }).Where("order_id = ?", orderID).Order("no").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]BoxOut, 0, len(rows))
	for _, b := range rows {
		bo := BoxOut{No: b.No, L: b.L, W: b.W, H: b.H, InnerL: b.InnerL, InnerW: b.InnerW, InnerH: b.InnerH, Weight: b.Weight, MaxWeight: b.MaxWeight, Fill: b.Fill}
		for _, it := range b.Items {
			// L >= W asos, H qalinlik; PL/PW joylashgan holat
			l, w := it.L, it.W
			if it.Rotated {
				l, w = it.W, it.L
			}
			bo.Items = append(bo.Items, Placed{
				Unit: Unit{UID: it.UID, RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name, Material: it.Material, Color: it.Color, L: l, W: w, H: it.H, Weight: it.Weight},
				X:    it.X, Y: it.Y, Z: it.Z, PL: it.L, PW: it.W, Rotated: it.Rotated, Layer: it.Layer,
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
			Weight: b.Weight, MaxWeight: b.MaxWeight, Fill: b.Fill}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		items := make([]platform.BoxItem, 0, len(b.Items))
		for _, it := range b.Items {
			items = append(items, platform.BoxItem{BoxID: row.ID, OrderID: orderID, UID: it.UID, RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name,
				Material: it.Material, Color: it.Color, X: it.X, Y: it.Y, Z: it.Z, L: it.PL, W: it.PW, H: it.H, Rotated: it.Rotated, Layer: it.Layer, Weight: it.Weight})
		}
		if len(items) > 0 {
			if err := tx.CreateInBatches(items, 500).Error; err != nil {
				return err
			}
		}
	}
	return tx.Model(&platform.Order{}).Where("id = ?", orderID).Updates(map[string]any{"boxes_count": len(boxes), "updated_at": time.Now()}).Error
}

func toJSON(boxes []BoxOut, run platform.PackRun, labSig string) ResultJSON {
	r := ResultJSON{Boxes: []boxJSON{}, Warnings: []Warning{}, Unplaced: []Unplaced{}, ComputedAt: run.ComputedAt, Stale: run.Signature != labSig}
	_ = json.Unmarshal(run.Warnings, &r.Warnings)
	_ = json.Unmarshal(run.Unplaced, &r.Unplaced)
	if r.Warnings == nil {
		r.Warnings = []Warning{}
	}
	if r.Unplaced == nil {
		r.Unplaced = []Unplaced{}
	}
	for _, b := range boxes {
		bj := boxJSON{No: b.No, L: b.L, W: b.W, H: b.H, InnerL: b.InnerL, InnerW: b.InnerW, InnerH: b.InnerH, Weight: b.Weight, MaxWeight: b.MaxWeight, Fill: b.Fill, Items: []itemJSON{}}
		for _, it := range b.Items {
			bj.Items = append(bj.Items, itemJSON{UID: it.UID, RefKind: it.RefKind, RefUID: it.RefUID, Name: it.Name, Material: it.Material, Color: it.Color,
				X: it.X, Y: it.Y, Z: it.Z, L: it.PL, W: it.PW, H: it.H, Rotated: it.Rotated, Layer: it.Layer, Weight: round(it.Weight, 3)})
		}
		r.Boxes = append(r.Boxes, bj)
	}
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
	r := toJSON(boxes, run, sig)
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
	return c.JSON(toJSON(res.Boxes, run, sig))
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
	case errors.Is(err, ErrNotFound):
		return platform.Fail(c, 404, err.Error(), "not_found")
	}
	return platform.Fail(c, 400, err.Error())
}

// Move (F27): elementni boshqa qutiga; og'irlik limiti va sig'im qayta tekshiriladi.
func (h Handlers) Move(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var in struct {
		ItemUID string `json:"itemUid"`
		ToBox   int    `json:"toBox"`
	}
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	boxes, err := LoadBoxes(h.DB, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	moved, err := Move(boxes, in.ItemUID, in.ToBox, ToSettings(platform.LoadPackSettings(h.DB, id)))
	if err != nil {
		return editErr(c, err)
	}
	if err := h.DB.Transaction(func(tx *gorm.DB) error { return saveBoxes(tx, id, moved) }); err != nil {
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
		return platform.Fail(c, 400, "quti raqami noto'g'ri")
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
