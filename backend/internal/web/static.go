// Package web: Next.js statik eksportini (frontend/out) tarqatish. /api dan tashqari barcha yo'llar.
package web

import (
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// Handler: p, p.html, p/index.html ketma-ketligida qidiradi; topilmasa 404.html (bo'lmasa index.html).
func Handler(dir string) fiber.Handler {
	abs, _ := filepath.Abs(dir)
	exists := func(p string) bool {
		st, err := os.Stat(p)
		return err == nil && !st.IsDir()
	}
	return func(c *fiber.Ctx) error {
		if strings.HasPrefix(c.Path(), "/api/") {
			return fiber.NewError(fiber.StatusNotFound, "API yo'li topilmadi")
		}
		if c.Method() != fiber.MethodGet && c.Method() != fiber.MethodHead {
			return fiber.ErrMethodNotAllowed
		}
		clean := path.Clean("/" + c.Path())
		base := filepath.Join(abs, filepath.FromSlash(clean))
		if !strings.HasPrefix(base, abs) {
			return fiber.ErrForbidden
		}
		for _, cand := range []string{base, base + ".html", filepath.Join(base, "index.html")} {
			if exists(cand) {
				if strings.HasPrefix(clean, "/_next/static/") {
					c.Set("Cache-Control", "public, max-age=31536000, immutable")
				} else {
					c.Set("Cache-Control", "no-cache")
				}
				return c.SendFile(cand, false)
			}
		}
		if exists(filepath.Join(abs, "404.html")) {
			c.Status(fiber.StatusNotFound)
			return c.SendFile(filepath.Join(abs, "404.html"), false)
		}
		if exists(filepath.Join(abs, "index.html")) {
			return c.SendFile(filepath.Join(abs, "index.html"), false)
		}
		return c.Status(fiber.StatusNotFound).SendString("Frontend yig'ilmagan: frontend papkasida `npm run build:static` bajaring yoki STATIC_DIR ni to'g'rilang.")
	}
}
