// Package model: laboratoriya holatini saqlash (F13-F20, W9).
// Geometriya serverda qayta ishlanmaydi: brauzer manba faylni deterministik qayta import qiladi
// va shu hujjatni qo'llaydi. Server jadvallar (parts, part_merges, composites, glue_links) xulosasini yuritadi.
package model

import (
	"bytes"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"bazis-upokovka/internal/platform"
	"bazis-upokovka/internal/tarix"
)

type Handlers struct {
	*platform.App
	Orders tarix.Handlers
}

type rowIn struct {
	ID      string   `json:"id"`
	Members []string `json:"members"`
	Manual  bool     `json:"manual"`
	Qty     *int     `json:"qty,omitempty"`
}

type memberIn struct {
	PartID  string    `json:"partId"`
	Matrix  []float64 `json:"matrix"`
	FromRow *string   `json:"fromRow"`
}

type compIn struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	MainID  string            `json:"mainId"`
	Members []memberIn        `json:"members"`
	Links   []json.RawMessage `json:"links"`
}

type docIn struct {
	Version    int             `json:"version"`
	Edits      json.RawMessage `json:"edits"`
	Rows       []rowIn         `json:"rows"`
	Composites []compIn        `json:"composites"`
	MergeKey   json.RawMessage `json:"mergeKey"`
	PackGroups json.RawMessage `json:"packGroups"` // alohida upokovka guruhlari
	PartGroup  json.RawMessage `json:"partGroup"`  // detal -> guruh
}

type summaryIn struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Material string   `json:"material"`
	Kind     string   `json:"kind"`
	L        *float64 `json:"L"`
	W        *float64 `json:"W"`
	T        *float64 `json:"T"`
	Weight   *float64 `json:"weight"`
	RowID    string   `json:"rowId"`
}

func (h Handlers) Get(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var o platform.Order
	if err := h.DB.Preload("CreatedBy").First(&o, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	files, err := h.Orders.Files(c, id)
	if err != nil {
		return platform.DBFail(c, err)
	}
	var doc, scene any
	var lab platform.LabDoc
	if h.DB.First(&lab, "order_id = ?", id).Error == nil && len(lab.Doc) > 0 {
		_ = json.Unmarshal(lab.Doc, &doc)
	}
	var sc platform.SceneState
	if h.DB.First(&sc, "order_id = ?", id).Error == nil && len(sc.Data) > 0 {
		_ = json.Unmarshal(sc.Data, &scene)
	}
	return c.JSON(fiber.Map{"order": tarix.OrderJSON(h.DB, o), "doc": doc, "scene": scene, "files": files})
}

func sameJSON(a, b json.RawMessage) bool {
	norm := func(x json.RawMessage) []byte {
		if len(x) == 0 {
			return []byte("null")
		}
		var v any
		if json.Unmarshal(x, &v) != nil {
			return x
		}
		out, _ := json.Marshal(v) // map kalitlari tartiblanadi
		return out
	}
	return bytes.Equal(norm(a), norm(b))
}

// sameOrEmpty: bo'sh qiymatlar (yo'q, null, [], {}) o'zaro teng hisoblanadi.
func sameOrEmpty(a, b json.RawMessage) bool {
	empty := func(x json.RawMessage) bool {
		t := bytes.TrimSpace(x)
		return len(t) == 0 || string(t) == "null" || string(t) == "[]" || string(t) == "{}"
	}
	if empty(a) && empty(b) {
		return true
	}
	return sameJSON(a, b)
}

func marshal(v any) json.RawMessage { b, _ := json.Marshal(v); return b }

// Put: hujjat, sahna, upokovka elementlari va xulosani saqlaydi.
// Ruxsat: tahrir (edits) P2, qatorlar P3, kompozitlar P4. Faqat sahna o'zgarsa P9 yetarli.
func (h Handlers) Put(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var in struct {
		Doc       json.RawMessage `json:"doc"`
		Scene     json.RawMessage `json:"scene"`
		Items     json.RawMessage `json:"items"`
		Signature string          `json:"signature"`
		Summary   []summaryIn     `json:"summary"`
	}
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov: "+err.Error())
	}
	var nd docIn
	if err := json.Unmarshal(in.Doc, &nd); err != nil {
		return platform.Fail(c, 400, "hujjat formati noto'g'ri", "bad_doc")
	}
	var o platform.Order
	if err := h.DB.First(&o, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	me := platform.Me(c)
	var old platform.LabDoc
	hasOld := h.DB.First(&old, "order_id = ?", id).Error == nil
	var od docIn
	if hasOld {
		_ = json.Unmarshal(old.Doc, &od)
	}
	compChanged := !sameJSON(marshal(od.Composites), marshal(nd.Composites))
	rowsChanged := !sameJSON(marshal(od.Rows), marshal(nd.Rows)) || !sameJSON(od.MergeKey, nd.MergeKey)
	editsChanged := !sameJSON(od.Edits, nd.Edits) || !sameOrEmpty(od.PackGroups, nd.PackGroups) || !sameOrEmpty(od.PartGroup, nd.PartGroup)
	if !hasOld {
		// birinchi saqlash: avtomatik qatorlar, hech kim hali tahrir qilmagan bo'lishi mumkin
		compChanged = len(nd.Composites) > 0
		rowsChanged = false
		editsChanged = !sameJSON(nd.Edits, json.RawMessage("{}")) || !sameOrEmpty(nil, nd.PartGroup) || !sameOrEmpty(nil, nd.PackGroups)
	}
	if compChanged && !me.Can("P4") {
		return platform.Fail(c, 403, "yelimlashga ruxsat yo'q (P4)", "forbidden")
	}
	if rowsChanged && !compChanged && !me.Can("P3") {
		return platform.Fail(c, 403, "birlashtirishga ruxsat yo'q (P3)", "forbidden")
	}
	if editsChanged && !me.Can("P2") {
		return platform.Fail(c, 403, "tahrirlashga ruxsat yo'q (P2)", "forbidden")
	}
	docOnlyScene := hasOld && !compChanged && !rowsChanged && !editsChanged
	// hujjat huquqi (P2/P3/P4) yo'q foydalanuvchi (masalan, Upokovkachi) faqat sahna holatini saqlay oladi
	sceneOnly := !me.Can("P2") && !me.Can("P3") && !me.Can("P4")
	if sceneOnly && !hasOld {
		return platform.Fail(c, 403, "laboratoriya hujjatini saqlashga ruxsat yo'q", "forbidden")
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		if len(in.Scene) > 0 && json.Valid(in.Scene) {
			if err := tx.Save(&platform.SceneState{OrderID: id, Data: datatypes.JSON(in.Scene), UpdatedAt: now}).Error; err != nil {
				return err
			}
		}
		if sceneOnly || (docOnlyScene && old.Signature == in.Signature) {
			return nil
		}
		items := in.Items
		if len(items) == 0 || !json.Valid(items) {
			items = json.RawMessage("[]")
		}
		if err := tx.Save(&platform.LabDoc{OrderID: id, Doc: datatypes.JSON(in.Doc), Items: datatypes.JSON(items), Signature: in.Signature, UpdatedAt: now}).Error; err != nil {
			return err
		}
		// jadval xulosalari qayta yoziladi
		for _, m := range []any{&platform.Part{}, &platform.PartMerge{}, &platform.Composite{}, &platform.GlueLink{}} {
			if err := tx.Where("order_id = ?", id).Delete(m).Error; err != nil {
				return err
			}
		}
		parts := make([]platform.Part, 0, len(in.Summary))
		for _, s := range in.Summary {
			parts = append(parts, platform.Part{OrderID: id, PartID: s.ID, Name: s.Name, Material: s.Material, Kind: s.Kind, L: s.L, W: s.W, T: s.T, Weight: s.Weight, RowID: s.RowID})
		}
		if len(parts) > 0 {
			if err := tx.CreateInBatches(parts, 500).Error; err != nil {
				return err
			}
		}
		merges := []platform.PartMerge{}
		for _, r := range nd.Rows {
			for _, m := range r.Members {
				merges = append(merges, platform.PartMerge{OrderID: id, RowID: r.ID, PartID: m, Manual: r.Manual, Qty: r.Qty})
			}
		}
		if len(merges) > 0 {
			if err := tx.CreateInBatches(merges, 500).Error; err != nil {
				return err
			}
		}
		for _, cp := range nd.Composites {
			if err := tx.Create(&platform.Composite{OrderID: id, CompID: cp.ID, Name: cp.Name, MainPartID: cp.MainID, Members: datatypes.JSON(marshal(cp.Members))}).Error; err != nil {
				return err
			}
			for _, l := range cp.Links {
				if err := tx.Create(&platform.GlueLink{OrderID: id, CompID: cp.ID, Data: datatypes.JSON(l)}).Error; err != nil {
					return err
				}
			}
		}
		upd := map[string]any{"parts_count": len(in.Summary), "updated_at": now}
		if o.Status == "new" {
			upd["status"] = "lab"
		}
		return tx.Model(&platform.Order{}).Where("id = ?", id).Updates(upd).Error
	})
	if err != nil {
		return platform.DBFail(c, err)
	}
	var run platform.PackRun
	stale := false
	if h.DB.First(&run, "order_id = ?", id).Error == nil {
		stale = run.Signature != in.Signature
	}
	return c.JSON(fiber.Map{"packStale": stale})
}
