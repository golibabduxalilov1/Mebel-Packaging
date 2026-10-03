// Package auth: kirish, joriy foydalanuvchi, parol va til (F1, F4).
package auth

import (
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"

	"bazis-upokovka/internal/platform"
)

type Handlers struct{ *platform.App }

// UserJSON: frontend dagi User turi.
func UserJSON(u *platform.AuthUser, active bool) fiber.Map {
	return fiber.Map{"id": u.ID, "login": u.Login, "fullName": u.FullName, "roleId": u.RoleID, "roleName": u.RoleName, "lang": u.Lang, "active": active, "permissions": u.PermList()}
}

// Oddiy himoya: bir login uchun ketma-ket xato urinishlarni sekinlashtirish.
var (
	failMu sync.Mutex
	fails  = map[string][]time.Time{}
)

func tooMany(login string) bool {
	failMu.Lock()
	defer failMu.Unlock()
	cut := time.Now().Add(-10 * time.Minute)
	keep := fails[login][:0]
	for _, t := range fails[login] {
		if t.After(cut) {
			keep = append(keep, t)
		}
	}
	fails[login] = keep
	return len(keep) >= 8
}

func addFail(login string) {
	failMu.Lock()
	fails[login] = append(fails[login], time.Now())
	failMu.Unlock()
}

func (h Handlers) Login(c *fiber.Ctx) error {
	var in struct{ Login, Password string }
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov", "bad_request")
	}
	login := strings.TrimSpace(in.Login)
	if ph, ok := platform.NormalizePhone(login); ok {
		login = ph
	}
	if tooMany(login) {
		return platform.Fail(c, 429, "juda ko'p urinish, 10 daqiqadan keyin qayta urining", "rate_limited")
	}
	var u platform.User
	if err := h.DB.Where("login = ?", login).First(&u).Error; err != nil {
		addFail(login)
		return platform.Fail(c, 401, "login yoki parol noto'g'ri", "bad_credentials")
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		addFail(login)
		return platform.Fail(c, 401, "login yoki parol noto'g'ri", "bad_credentials")
	}
	if !u.Active {
		return platform.Fail(c, 403, "foydalanuvchi bloklangan", "blocked")
	}
	au, err := h.LoadAuthUser(u.ID)
	if err != nil {
		return platform.Fail(c, 403, "foydalanuvchi bloklangan", "blocked")
	}
	tok, err := h.IssueToken(u.ID)
	if err != nil {
		return platform.Fail(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"token": tok, "user": UserJSON(au, true)})
}

func (h Handlers) Me(c *fiber.Ctx) error { return c.JSON(UserJSON(platform.Me(c), true)) }

func (h Handlers) Password(c *fiber.Ctx) error {
	var in struct{ OldPassword, NewPassword string }
	if err := c.BodyParser(&in); err != nil || len(in.NewPassword) < 6 {
		return platform.Fail(c, 400, "yangi parol kamida 6 belgi", "bad_password")
	}
	var u platform.User
	if err := h.DB.First(&u, platform.Me(c).ID).Error; err != nil {
		return platform.DBFail(c, err)
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.OldPassword)) != nil {
		return platform.Fail(c, 400, "joriy parol noto'g'ri", "bad_old_password")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return platform.Fail(c, 500, err.Error())
	}
	if err := h.DB.Model(&u).Update("password_hash", string(hash)).Error; err != nil {
		return platform.DBFail(c, err)
	}
	return c.SendStatus(204)
}

func (h Handlers) Lang(c *fiber.Ctx) error {
	var in struct{ Lang string }
	if err := c.BodyParser(&in); err != nil || (in.Lang != "uz" && in.Lang != "ru") {
		return platform.Fail(c, 400, "til: uz yoki ru", "bad_lang")
	}
	if err := h.DB.Model(&platform.User{}).Where("id = ?", platform.Me(c).ID).Update("lang", in.Lang).Error; err != nil {
		return platform.DBFail(c, err)
	}
	return c.SendStatus(204)
}

func (h Handlers) Profile(c *fiber.Ctx) error {
	var in struct{ FullName string }
	if err := c.BodyParser(&in); err != nil {
		return platform.Fail(c, 400, "noto'g'ri so'rov")
	}
	me := platform.Me(c)
	if err := h.DB.Model(&platform.User{}).Where("id = ?", me.ID).Update("full_name", strings.TrimSpace(in.FullName)).Error; err != nil {
		return platform.DBFail(c, err)
	}
	au, err := h.LoadAuthUser(me.ID)
	if err != nil {
		return platform.Fail(c, 500, err.Error())
	}
	return c.JSON(UserJSON(au, true))
}
