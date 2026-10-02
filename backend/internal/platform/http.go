package platform

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// App: barcha modullar uchun umumiy bog'liqliklar.
type App struct {
	DB  *gorm.DB
	Cfg Config
}

// Fail: {"error": "...", "code": "..."} ko'rinishidagi javob.
func Fail(c *fiber.Ctx, status int, msg string, code ...string) error {
	body := fiber.Map{"error": msg}
	if len(code) > 0 {
		body["code"] = code[0]
	}
	return c.Status(status).JSON(body)
}

func DBFail(c *fiber.Ctx, err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Fail(c, fiber.StatusNotFound, "topilmadi", "not_found")
	}
	return Fail(c, fiber.StatusInternalServerError, err.Error(), "db")
}

// ParamID: xato bo'lsa fiber.Error qaytaradi (ErrorHandler JSON qilib yuboradi), handler shunchaki `return err` qiladi.
func ParamID(c *fiber.Ctx, name string) (uint, error) {
	v, err := strconv.ParseUint(c.Params(name), 10, 64)
	if err != nil || v == 0 {
		return 0, fiber.NewError(fiber.StatusBadRequest, "noto'g'ri identifikator")
	}
	return uint(v), nil
}

// ErrorHandler: barcha qaytarilgan xatolar {"error": "..."} ko'rinishida.
func ErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	var fe *fiber.Error
	if errors.As(err, &fe) {
		code = fe.Code
	}
	return c.Status(code).JSON(fiber.Map{"error": err.Error()})
}

/* ---------- autentifikatsiya ---------- */

type AuthUser struct {
	ID       uint
	Login    string
	FullName string
	RoleID   uint
	RoleName string
	Lang     string
	Perms    map[string]bool
}

func (u *AuthUser) Can(p string) bool { return u != nil && u.Perms[p] }

func (u *AuthUser) PermList() []string {
	out := []string{}
	for _, p := range AllPermissions {
		if u.Perms[p.Code] {
			out = append(out, p.Code)
		}
	}
	return out
}

type claims struct {
	UID uint `json:"uid"`
	jwt.RegisteredClaims
}

func (a *App) IssueToken(uid uint) (string, error) {
	cl := claims{UID: uid, RegisteredClaims: jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(a.Cfg.JWTHours) * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, cl).SignedString([]byte(a.Cfg.JWTSecret))
}

// LoadAuthUser: foydalanuvchi va uning rol ruxsatlari (har so'rovda bazadan: rol o'zgarsa darhol kuchga kiradi).
func (a *App) LoadAuthUser(uid uint) (*AuthUser, error) {
	var u User
	if err := a.DB.Preload("Role.Permissions").First(&u, uid).Error; err != nil {
		return nil, err
	}
	if !u.Active {
		return nil, errors.New("blocked")
	}
	au := &AuthUser{ID: u.ID, Login: u.Login, FullName: u.FullName, RoleID: u.RoleID, RoleName: u.Role.Name, Lang: u.Lang, Perms: map[string]bool{}}
	for _, p := range u.Role.Permissions {
		au.Perms[p.Code] = true
	}
	return au, nil
}

// RequireAuth: Authorization: Bearer <token>.
func (a *App) RequireAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		tok := strings.TrimPrefix(h, "Bearer ")
		if tok == "" || tok == h {
			return Fail(c, fiber.StatusUnauthorized, "avtorizatsiya kerak", "unauthorized")
		}
		var cl claims
		t, err := jwt.ParseWithClaims(tok, &cl, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("algoritm")
			}
			return []byte(a.Cfg.JWTSecret), nil
		})
		if err != nil || !t.Valid {
			return Fail(c, fiber.StatusUnauthorized, "sessiya muddati tugagan", "unauthorized")
		}
		u, err := a.LoadAuthUser(cl.UID)
		if err != nil {
			return Fail(c, fiber.StatusUnauthorized, "foydalanuvchi faol emas", "unauthorized")
		}
		c.Locals("user", u)
		return c.Next()
	}
}

func Me(c *fiber.Ctx) *AuthUser {
	u, _ := c.Locals("user").(*AuthUser)
	return u
}

// Need: kamida bittasi bo'lishi kerak bo'lgan ruxsatlar.
func Need(perms ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		u := Me(c)
		for _, p := range perms {
			if u.Can(p) {
				return c.Next()
			}
		}
		return Fail(c, fiber.StatusForbidden, "ruxsat yo'q: "+strings.Join(perms, " yoki "), "forbidden")
	}
}
