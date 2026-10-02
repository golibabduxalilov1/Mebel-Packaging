// Package tarix: buyurtmalar tarixi (F30): yaratish (manba faylni saqlash), ro'yxat, nusxa, o'chirish.
package tarix

import (
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"bazis-upokovka/internal/platform"
)

type Handlers struct{ *platform.App }

var mainExt = regexp.MustCompile(`(?i)\.(b3d|dae|obj|json)$`)
var extraExt = regexp.MustCompile(`(?i)\.(mtl|png|jpe?g|bmp|gif|webp)$`)

// OrderJSON: frontend dagi Order turi.
func OrderJSON(db *gorm.DB, o platform.Order) fiber.Map {
	var lab platform.LabDoc
	var run platform.PackRun
	stale := false
	if db.First(&run, "order_id = ?", o.ID).Error == nil {
		if db.Select("order_id", "signature").First(&lab, "order_id = ?", o.ID).Error == nil {
			stale = run.Signature != lab.Signature
		}
	}
	by := ""
	if o.CreatedBy != nil {
		by = o.CreatedBy.FullName
		if by == "" {
			by = o.CreatedBy.Login
		}
	}
	var opts any
	if len(o.ImportOptions) > 0 {
		_ = json.Unmarshal(o.ImportOptions, &opts)
	}
	return fiber.Map{
		"id": o.ID, "number": o.Number, "name": o.Name, "client": o.Client, "note": o.Note, "fileName": o.FileName, "format": o.Format,
		"fileSize": o.FileSize, "status": o.Status, "partsCount": o.PartsCount, "boxesCount": o.BoxesCount, "packStale": stale,
		"gabarit": o.Gabarit, "createdBy": by, "createdAt": o.CreatedAt, "updatedAt": o.UpdatedAt, "importOptions": opts,
	}
}

func (h Handlers) List(c *fiber.Ctx) error {
	q := h.DB.Preload("CreatedBy").Order("updated_at desc").Limit(500)
	if s := strings.TrimSpace(c.Query("search")); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		q = q.Where("lower(number) like ? or lower(name) like ? or lower(client) like ? or lower(file_name) like ?", like, like, like, like)
	}
	if st := c.Query("status"); st != "" {
		q = q.Where("status = ?", st)
	}
	if from, err := time.Parse("2006-01-02", c.Query("from")); err == nil {
		q = q.Where("created_at >= ?", from)
	}
	if to, err := time.Parse("2006-01-02", c.Query("to")); err == nil {
		q = q.Where("created_at < ?", to.Add(24*time.Hour))
	}
	var list []platform.Order
	if err := q.Find(&list).Error; err != nil {
		return platform.DBFail(c, err)
	}
	out := make([]fiber.Map, 0, len(list))
	for _, o := range list {
		out = append(out, OrderJSON(h.DB, o))
	}
	return c.JSON(out)
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
	return c.JSON(OrderJSON(h.DB, o))
}

func safeName(n string) string {
	n = filepath.Base(strings.ReplaceAll(n, "\\", "/"))
	n = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '_'
		}
		return r
	}, n)
	if n == "" || n == "." || n == ".." {
		n = "file"
	}
	return n
}

func (h Handlers) nextNumber(tx *gorm.DB) string {
	year := time.Now().Year()
	prefix := fmt.Sprintf("B-%d-", year)
	var last platform.Order
	n := 1
	if tx.Where("number like ?", prefix+"%").Order("number desc").First(&last).Error == nil {
		if v, err := strconv.Atoi(strings.TrimPrefix(last.Number, prefix)); err == nil {
			n = v + 1
		}
	}
	return fmt.Sprintf("%s%04d", prefix, n)
}

func (h Handlers) storeFile(orderID uint, name string, r io.Reader) (string, int64, error) {
	rel := filepath.Join(strconv.FormatUint(uint64(orderID), 10), safeName(name))
	full := filepath.Join(h.Cfg.StorageDir, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return "", 0, err
	}
	f, err := os.Create(full)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	n, err := io.Copy(f, r)
	return rel, n, err
}

// Create: multipart: file (asosiy), extra (ixtiyoriy, bir nechta), client, name, note, importOptions, partsCount, gabarit.
func (h Handlers) Create(c *fiber.Ctx) error {
	form, err := c.MultipartForm()
	if err != nil {
		return platform.Fail(c, 400, "fayl yuborilmadi", "no_file")
	}
	mains := form.File["file"]
	if len(mains) != 1 || !mainExt.MatchString(mains[0].Filename) {
		return platform.Fail(c, 400, "faqat .b3d, .dae, .obj yoki .json fayl qabul qilinadi", "bad_format")
	}
	main := mains[0]
	if main.Size > int64(h.Cfg.MaxUploadMB)*1024*1024 {
		return platform.Fail(c, 413, "fayl juda katta", "too_large")
	}
	val := func(k string) string {
		if v := form.Value[k]; len(v) > 0 {
			return strings.TrimSpace(v[0])
		}
		return ""
	}
	opts := val("importOptions")
	if opts == "" || !json.Valid([]byte(opts)) {
		opts = `{"unit":"auto","upAxis":"auto","daeLevel":"top"}`
	}
	parts, _ := strconv.Atoi(val("partsCount"))
	name := val("name")
	if name == "" {
		name = strings.TrimSuffix(main.Filename, filepath.Ext(main.Filename))
	}
	me := platform.Me(c)
	uid := me.ID
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(main.Filename), "."))
	o := platform.Order{Name: name, Client: val("client"), Note: val("note"), FileName: safeName(main.Filename), Format: ext, FileSize: main.Size,
		Status: "new", PartsCount: parts, Gabarit: val("gabarit"), ImportOptions: datatypes.JSON(opts), CreatedByID: &uid}
	// raqam noyobligi: parallel yaratishda to'qnashuv bo'lsa qayta urinish
	for i := 0; i < 5; i++ {
		o.Number = h.nextNumber(h.DB)
		if err = h.DB.Create(&o).Error; err == nil {
			break
		}
	}
	if err != nil {
		return platform.DBFail(c, err)
	}
	save := func(fh *multipart.FileHeader, fname string, isMain bool) error {
		src, err := fh.Open()
		if err != nil {
			return err
		}
		defer src.Close()
		rel, n, err := h.storeFile(o.ID, fname, src)
		if err != nil {
			return err
		}
		return h.DB.Create(&platform.OrderFile{OrderID: o.ID, Name: safeName(fname), Size: n, Main: isMain, Path: rel}).Error
	}
	if err := save(main, main.Filename, true); err != nil {
		h.removeOrder(o.ID)
		return platform.Fail(c, 500, "faylni saqlab bo'lmadi: "+err.Error())
	}
	for _, x := range form.File["extra"] {
		if !extraExt.MatchString(x.Filename) {
			continue
		}
		if err := save(x, x.Filename, false); err != nil {
			h.removeOrder(o.ID)
			return platform.Fail(c, 500, "faylni saqlab bo'lmadi: "+err.Error())
		}
	}
	h.DB.Preload("CreatedBy").First(&o, o.ID)
	return c.Status(201).JSON(OrderJSON(h.DB, o))
}

func (h Handlers) Update(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var in struct {
		Name          *string         `json:"name"`
		Client        *string         `json:"client"`
		Note          *string         `json:"note"`
		Status        *string         `json:"status"`
		ImportOptions json.RawMessage `json:"importOptions"`
		PartsCount    *int            `json:"partsCount"`
		Gabarit       *string         `json:"gabarit"`
	}
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	upd := map[string]any{}
	if in.Name != nil {
		upd["name"] = strings.TrimSpace(*in.Name)
	}
	if in.Client != nil {
		upd["client"] = strings.TrimSpace(*in.Client)
	}
	if in.Note != nil {
		upd["note"] = strings.TrimSpace(*in.Note)
	}
	if in.Status != nil {
		switch *in.Status {
		case "new", "lab", "packed", "done":
			upd["status"] = *in.Status
		default:
			return platform.Fail(c, 400, "noto'g'ri holat")
		}
	}
	if len(in.ImportOptions) > 0 && json.Valid(in.ImportOptions) {
		upd["import_options"] = datatypes.JSON(in.ImportOptions)
	}
	if in.PartsCount != nil {
		upd["parts_count"] = *in.PartsCount
	}
	if in.Gabarit != nil {
		upd["gabarit"] = *in.Gabarit
	}
	if err := h.DB.Model(&platform.Order{}).Where("id = ?", id).Updates(upd).Error; err != nil {
		return platform.DBFail(c, err)
	}
	return h.Get(c)
}

// removeOrder: buyurtma va unga bog'liq barcha yozuvlar hamda fayllar.
func (h Handlers) removeOrder(id uint) error {
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		var boxIDs []uint
		tx.Model(&platform.Box{}).Where("order_id = ?", id).Pluck("id", &boxIDs)
		for _, m := range []any{&platform.BoxItem{}, &platform.Box{}, &platform.PackRun{}, &platform.PackingSettings{}, &platform.GlueLink{},
			&platform.Composite{}, &platform.PartMerge{}, &platform.Part{}, &platform.SceneState{}, &platform.LabDoc{}, &platform.OrderFile{}} {
			if err := tx.Where("order_id = ?", id).Delete(m).Error; err != nil {
				return err
			}
		}
		return tx.Delete(&platform.Order{}, id).Error
	})
	if err == nil {
		_ = os.RemoveAll(filepath.Join(h.Cfg.StorageDir, strconv.FormatUint(uint64(id), 10)))
	}
	return err
}

func (h Handlers) Delete(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	if err := h.removeOrder(id); err != nil {
		return platform.DBFail(c, err)
	}
	return c.SendStatus(204)
}

// Duplicate: fayllar, laboratoriya hujjati, sahna va upokovka sozlamalari nusxalanadi; upokovka natijasi nusxalanmaydi.
func (h Handlers) Duplicate(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var src platform.Order
	if err := h.DB.First(&src, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	uid := platform.Me(c).ID
	dst := src
	dst.ID = 0
	dst.CreatedBy = nil
	dst.CreatedByID = &uid
	dst.Name = src.Name + " (nusxa)"
	dst.Status = "new"
	dst.BoxesCount = 0
	dst.CreatedAt, dst.UpdatedAt = time.Time{}, time.Time{}
	for i := 0; i < 5; i++ {
		dst.Number = h.nextNumber(h.DB)
		if err = h.DB.Create(&dst).Error; err == nil {
			break
		}
	}
	if err != nil {
		return platform.DBFail(c, err)
	}
	var files []platform.OrderFile
	h.DB.Where("order_id = ?", id).Find(&files)
	for _, f := range files {
		in, err := os.Open(filepath.Join(h.Cfg.StorageDir, f.Path))
		if err != nil {
			h.removeOrder(dst.ID)
			return platform.Fail(c, 500, "manba fayl topilmadi: "+f.Name)
		}
		rel, n, err := h.storeFile(dst.ID, f.Name, in)
		in.Close()
		if err != nil {
			h.removeOrder(dst.ID)
			return platform.Fail(c, 500, err.Error())
		}
		h.DB.Create(&platform.OrderFile{OrderID: dst.ID, Name: f.Name, Size: n, Main: f.Main, Path: rel})
	}
	var lab platform.LabDoc
	if h.DB.First(&lab, "order_id = ?", id).Error == nil {
		lab.OrderID = dst.ID
		h.DB.Create(&lab)
	}
	var sc platform.SceneState
	if h.DB.First(&sc, "order_id = ?", id).Error == nil {
		sc.OrderID = dst.ID
		h.DB.Create(&sc)
	}
	var ps platform.PackingSettings
	if h.DB.First(&ps, "order_id = ?", id).Error == nil {
		ps.OrderID = dst.ID
		h.DB.Create(&ps)
	}
	copySummaries(h.DB, id, dst.ID)
	h.DB.Preload("CreatedBy").First(&dst, dst.ID)
	return c.Status(201).JSON(OrderJSON(h.DB, dst))
}

// copySummaries: jadval xulosalarini GORM orqali nusxalash.
func copySummaries(db *gorm.DB, from, to uint) {
	var parts []platform.Part
	db.Where("order_id = ?", from).Find(&parts)
	for i := range parts {
		parts[i].ID, parts[i].OrderID = 0, to
	}
	if len(parts) > 0 {
		db.CreateInBatches(parts, 500)
	}
	var merges []platform.PartMerge
	db.Where("order_id = ?", from).Find(&merges)
	for i := range merges {
		merges[i].ID, merges[i].OrderID = 0, to
	}
	if len(merges) > 0 {
		db.CreateInBatches(merges, 500)
	}
	var comps []platform.Composite
	db.Where("order_id = ?", from).Find(&comps)
	for i := range comps {
		comps[i].ID, comps[i].OrderID = 0, to
	}
	if len(comps) > 0 {
		db.CreateInBatches(comps, 200)
	}
	var links []platform.GlueLink
	db.Where("order_id = ?", from).Find(&links)
	for i := range links {
		links[i].ID, links[i].OrderID = 0, to
	}
	if len(links) > 0 {
		db.CreateInBatches(links, 200)
	}
}

func (h Handlers) Files(c *fiber.Ctx, orderID uint) ([]fiber.Map, error) {
	var files []platform.OrderFile
	if err := h.DB.Where("order_id = ?", orderID).Order("main desc, id").Find(&files).Error; err != nil {
		return nil, err
	}
	out := []fiber.Map{}
	for _, f := range files {
		out = append(out, fiber.Map{"id": f.ID, "name": f.Name, "size": f.Size, "main": f.Main})
	}
	return out, nil
}

func (h Handlers) File(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	fid, err := platform.ParamID(c, "fid")
	if err != nil {
		return err
	}
	var f platform.OrderFile
	if err := h.DB.First(&f, "id = ? and order_id = ?", fid, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	c.Set("Content-Type", "application/octet-stream")
	return c.SendFile(filepath.Join(h.Cfg.StorageDir, f.Path), false)
}
