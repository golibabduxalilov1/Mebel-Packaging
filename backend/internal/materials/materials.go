// Package materials: material ma'lumotnomasi (F16) va tizim sozlamalari (F31).
package materials

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"bazis-upokovka/internal/platform"
)

type Handlers struct{ *platform.App }

func (h Handlers) List(c *fiber.Ctx) error {
	var list []platform.Material
	if err := h.DB.Order("name").Find(&list).Error; err != nil {
		return platform.DBFail(c, err)
	}
	return c.JSON(list)
}

func validate(m *platform.Material) string {
	m.Name = strings.TrimSpace(m.Name)
	if m.Name == "" {
		return "nomi majburiy"
	}
	switch m.Method {
	case "density":
		if m.Density == nil || *m.Density <= 0 {
			return "zichlik musbat bo'lishi kerak"
		}
	case "sheet":
		if m.SheetL == nil || m.SheetW == nil || m.SheetWeight == nil || *m.SheetL <= 0 || *m.SheetW <= 0 || *m.SheetWeight <= 0 {
			return "list o'lchami va og'irligi musbat bo'lishi kerak"
		}
	case "manual":
	default:
		return "usul: density, sheet yoki manual"
	}
	return ""
}

func (h Handlers) Create(c *fiber.Ctx) error {
	var m platform.Material
	if err := c.BodyParser(&m); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	m.ID = 0
	if msg := validate(&m); msg != "" {
		return platform.Fail(c, 400, msg, "invalid")
	}
	if err := h.DB.Create(&m).Error; err != nil {
		return platform.Fail(c, 409, "bunday material mavjud", "exists")
	}
	return c.Status(201).JSON(m)
}

func (h Handlers) Update(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var m platform.Material
	if err := c.BodyParser(&m); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	m.ID = id
	if msg := validate(&m); msg != "" {
		return platform.Fail(c, 400, msg, "invalid")
	}
	if err := h.DB.First(&platform.Material{}, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	// Save nil maydonlarni ham yozadi (masalan usul o'zgarganda eski qiymatlar tozalanadi)
	if err := h.DB.Save(&m).Error; err != nil {
		return platform.Fail(c, 409, "bunday material mavjud", "exists")
	}
	return c.JSON(m)
}

func (h Handlers) Delete(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	if err := h.DB.Delete(&platform.Material{}, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	return c.SendStatus(204)
}

func (h Handlers) GetDefaults(c *fiber.Ctx) error {
	return c.JSON(platform.LoadPackSettings(h.DB, 0))
}

func (h Handlers) SaveDefaults(c *fiber.Ctx) error {
	var s platform.PackSettings
	if err := c.BodyParser(&s); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	if err := platform.ValidatePackSettings(&s); err != nil {
		return platform.Fail(c, 400, err.Error(), "invalid")
	}
	if err := platform.SavePackSettings(h.DB, 0, s); err != nil {
		return platform.DBFail(c, err)
	}
	return c.JSON(s)
}
