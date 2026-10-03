// Package admin: foydalanuvchilar va rollar (F2, F3, P10).
package admin

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"bazis-upokovka/internal/platform"
)

type Handlers struct{ *platform.App }

func userJSON(u platform.User) fiber.Map {
	perms := []string{}
	for _, p := range u.Role.Permissions {
		perms = append(perms, p.Code)
	}
	return fiber.Map{"id": u.ID, "login": u.Login, "fullName": u.FullName, "roleId": u.RoleID, "roleName": u.Role.Name, "lang": u.Lang,
		"active": u.Active, "permissions": perms, "createdAt": u.CreatedAt}
}

func validPerms(in []string) []string {
	ok := map[string]bool{}
	for _, p := range platform.AllPermissions {
		ok[p.Code] = true
	}
	out := []string{}
	seen := map[string]bool{}
	for _, p := range in {
		if ok[p] && !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

/* ---------- foydalanuvchilar ---------- */

func (h Handlers) Users(c *fiber.Ctx) error {
	var list []platform.User
	if err := h.DB.Preload("Role.Permissions").Order("login").Find(&list).Error; err != nil {
		return platform.DBFail(c, err)
	}
	out := make([]fiber.Map, 0, len(list))
	for _, u := range list {
		out = append(out, userJSON(u))
	}
	return c.JSON(out)
}

type userIn struct {
	Login    string `json:"login"`
	FullName string `json:"fullName"`
	Password string `json:"password"`
	RoleID   uint   `json:"roleId"`
	Lang     string `json:"lang"`
	Active   *bool  `json:"active"`
}

func (h Handlers) CreateUser(c *fiber.Ctx) error {
	var in userIn
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	phone, ok := platform.NormalizePhone(in.Login)
	if !ok || len(in.Password) < 6 {
		return platform.Fail(c, 400, "telefon raqam (+998 XX XXX XX XX) majburiy, parol kamida 6 belgi", "invalid")
	}
	in.Login = phone
	if err := h.DB.First(&platform.Role{}, in.RoleID).Error; err != nil {
		return platform.Fail(c, 400, "rol topilmadi", "bad_role")
	}
	var n int64
	h.DB.Model(&platform.User{}).Where("login = ?", in.Login).Count(&n)
	if n > 0 {
		return platform.Fail(c, 409, "bunday login mavjud", "exists")
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	lang := in.Lang
	if lang != "ru" {
		lang = "uz"
	}
	u := platform.User{Login: in.Login, FullName: strings.TrimSpace(in.FullName), PasswordHash: string(hash), RoleID: in.RoleID, Lang: lang, Active: in.Active == nil || *in.Active}
	if err := h.DB.Create(&u).Error; err != nil {
		return platform.DBFail(c, err)
	}
	// GORM bool default:true bo'lgani uchun false qiymat alohida yoziladi
	if !u.Active {
		h.DB.Model(&u).Update("active", false)
	}
	h.DB.Preload("Role.Permissions").First(&u, u.ID)
	return c.Status(201).JSON(userJSON(u))
}

func (h Handlers) UpdateUser(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var in userIn
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	var u platform.User
	if err := h.DB.First(&u, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	upd := map[string]any{"full_name": strings.TrimSpace(in.FullName)}
	if strings.TrimSpace(in.Login) != "" {
		phone, ok := platform.NormalizePhone(in.Login)
		if !ok {
			return platform.Fail(c, 400, "telefon raqam +998 XX XXX XX XX ko'rinishida bo'lishi kerak", "bad_phone")
		}
		if phone != u.Login {
			var n int64
			h.DB.Model(&platform.User{}).Where("login = ? AND id <> ?", phone, id).Count(&n)
			if n > 0 {
				return platform.Fail(c, 409, "bu raqam boshqa foydalanuvchiga bog'langan", "exists")
			}
			upd["login"] = phone
		}
	}
	if in.RoleID != 0 {
		if err := h.DB.First(&platform.Role{}, in.RoleID).Error; err != nil {
			return platform.Fail(c, 400, "rol topilmadi", "bad_role")
		}
		upd["role_id"] = in.RoleID
	}
	if in.Lang == "uz" || in.Lang == "ru" {
		upd["lang"] = in.Lang
	}
	if in.Active != nil {
		if !*in.Active && id == platform.Me(c).ID {
			return platform.Fail(c, 400, "o'zingizni bloklay olmaysiz", "self")
		}
		upd["active"] = *in.Active
	}
	if in.Password != "" {
		if len(in.Password) < 6 {
			return platform.Fail(c, 400, "parol kamida 6 belgi", "bad_password")
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
		upd["password_hash"] = string(hash)
	}
	if id == platform.Me(c).ID && in.RoleID != 0 && in.RoleID != u.RoleID {
		var r platform.Role
		h.DB.Preload("Permissions").First(&r, in.RoleID)
		has := false
		for _, p := range r.Permissions {
			if p.Code == "P10" {
				has = true
			}
		}
		if !has {
			return platform.Fail(c, 400, "o'zingizdan P10 ruxsatini olib bo'lmaydi", "self")
		}
	}
	if err := h.DB.Model(&u).Updates(upd).Error; err != nil {
		return platform.DBFail(c, err)
	}
	h.DB.Preload("Role.Permissions").First(&u, id)
	return c.JSON(userJSON(u))
}

func (h Handlers) DeleteUser(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	if id == platform.Me(c).ID {
		return platform.Fail(c, 400, "o'zingizni o'chira olmaysiz", "self")
	}
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&platform.Order{}).Where("created_by_id = ?", id).Update("created_by_id", nil).Error; err != nil {
			return err
		}
		return tx.Delete(&platform.User{}, id).Error
	})
	if err != nil {
		return platform.DBFail(c, err)
	}
	return c.SendStatus(204)
}

/* ---------- rollar ---------- */

func (h Handlers) Permissions(c *fiber.Ctx) error {
	lang := platform.Me(c).Lang
	out := []fiber.Map{}
	for _, p := range platform.AllPermissions {
		name := p.UZ
		if lang == "ru" {
			name = p.RU
		}
		out = append(out, fiber.Map{"code": p.Code, "name": name})
	}
	return c.JSON(out)
}

func (h Handlers) roleJSON(r platform.Role) fiber.Map {
	perms := []string{}
	for _, p := range r.Permissions {
		perms = append(perms, p.Code)
	}
	var n int64
	h.DB.Model(&platform.User{}).Where("role_id = ?", r.ID).Count(&n)
	return fiber.Map{"id": r.ID, "name": r.Name, "description": r.Description, "permissions": validPerms(perms), "system": r.System, "users": n}
}

func (h Handlers) Roles(c *fiber.Ctx) error {
	var list []platform.Role
	if err := h.DB.Preload("Permissions").Order("id").Find(&list).Error; err != nil {
		return platform.DBFail(c, err)
	}
	out := []fiber.Map{}
	for _, r := range list {
		out = append(out, h.roleJSON(r))
	}
	return c.JSON(out)
}

type roleIn struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

func (h Handlers) CreateRole(c *fiber.Ctx) error {
	var in roleIn
	if err := c.BodyParser(&in); err != nil || strings.TrimSpace(in.Name) == "" {
		return platform.Fail(c, 400, "rol nomi majburiy", "invalid")
	}
	r := platform.Role{Name: strings.TrimSpace(in.Name), Description: in.Description}
	for _, p := range validPerms(in.Permissions) {
		r.Permissions = append(r.Permissions, platform.RolePermission{Code: p})
	}
	if err := h.DB.Create(&r).Error; err != nil {
		return platform.Fail(c, 409, "bunday rol mavjud", "exists")
	}
	return c.Status(201).JSON(h.roleJSON(r))
}

func (h Handlers) UpdateRole(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var in roleIn
	if err := c.BodyParser(&in); err != nil || strings.TrimSpace(in.Name) == "" {
		return platform.Fail(c, 400, "rol nomi majburiy", "invalid")
	}
	var r platform.Role
	if err := h.DB.First(&r, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	perms := validPerms(in.Permissions)
	hasP10 := false
	for _, p := range perms {
		if p == "P10" {
			hasP10 = true
		}
	}
	// tizim roli (Administrator) P10 siz qolmasligi kerak, aks holda tizimni boshqarib bo'lmaydi
	if r.System && !hasP10 {
		perms = append(perms, "P10")
	}
	if !r.System && platform.Me(c).RoleID == r.ID && !hasP10 {
		return platform.Fail(c, 400, "o'z rolingizdan P10 ni olib bo'lmaydi", "self")
	}
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&r).Updates(map[string]any{"name": strings.TrimSpace(in.Name), "description": in.Description}).Error; err != nil {
			return err
		}
		if err := tx.Where("role_id = ?", r.ID).Delete(&platform.RolePermission{}).Error; err != nil {
			return err
		}
		for _, p := range perms {
			if err := tx.Create(&platform.RolePermission{RoleID: r.ID, Code: p}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return platform.DBFail(c, err)
	}
	h.DB.Preload("Permissions").First(&r, id)
	return c.JSON(h.roleJSON(r))
}

func (h Handlers) DeleteRole(c *fiber.Ctx) error {
	id, err := platform.ParamID(c, "id")
	if err != nil {
		return err
	}
	var r platform.Role
	if err := h.DB.First(&r, id).Error; err != nil {
		return platform.DBFail(c, err)
	}
	if r.System {
		return platform.Fail(c, 400, "tizim rolini o'chirib bo'lmaydi", "system")
	}
	var n int64
	h.DB.Model(&platform.User{}).Where("role_id = ?", id).Count(&n)
	if n > 0 {
		return platform.Fail(c, 400, "rolda foydalanuvchilar bor", "in_use")
	}
	if err := h.DB.Select("Permissions").Delete(&r).Error; err != nil {
		return platform.DBFail(c, err)
	}
	return c.SendStatus(204)
}
