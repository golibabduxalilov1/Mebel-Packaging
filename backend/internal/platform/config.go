// Package platform: konfiguratsiya, ma'lumotlar bazasi, modellar va HTTP yordamchilari.
package platform

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	JWTHours      int
	StorageDir    string // yuklangan manba fayllar
	StaticDir     string // Next.js statik eksport (frontend/out)
	FontsDir      string // PDF uchun DejaVu shriftlari
	AdminPhone    string // superadmin logini: +998 XX XXX XX XX (998XXXXXXXXX ko'rinishida saqlanadi)
	AdminPassword string // superadmin paroli (.env dan, har ishga tushishda sinxronlanadi)
	MaxUploadMB   int
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil && v > 0 {
		return v
	}
	return def
}

// loadDotEnv .env faylini (joriy papka yoki ../) o'qiydi; mavjud muhit o'zgaruvchilarini bosmaydi.
func loadDotEnv() {
	for _, path := range []string{".env", "../.env"} {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			k, v, ok := strings.Cut(line, "=")
			if line == "" || line[0] == '#' || !ok {
				continue
			}
			k = strings.TrimSpace(k)
			v = strings.Trim(strings.TrimSpace(v), `"'`)
			if _, set := os.LookupEnv(k); !set {
				os.Setenv(k, v)
			}
		}
		f.Close()
	}
}

// NormalizePhone: "+998 90 123 45 67", "90 123 45 67", "998901234567" -> "998901234567".
// Telefonga o'xshamasa ok=false.
func NormalizePhone(s string) (string, bool) {
	var d strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			d.WriteRune(r)
		}
	}
	digits := d.String()
	if len(digits) == 9 {
		digits = "998" + digits
	}
	if len(digits) == 12 && strings.HasPrefix(digits, "998") {
		return digits, true
	}
	return "", false
}

func LoadConfig() Config {
	loadDotEnv()
	return Config{
		Port:          env("PORT", "8080"),
		DatabaseURL:   env("DATABASE_URL", "postgres://bazis:bazis@localhost:5432/bazis_upokovka?sslmode=disable"),
		JWTSecret:     env("JWT_SECRET", "dev-secret-ozgartiring"),
		JWTHours:      envInt("JWT_HOURS", 12),
		StorageDir:    env("STORAGE_DIR", "./data/files"),
		StaticDir:     env("STATIC_DIR", "../frontend/out"),
		FontsDir:      env("FONTS_DIR", "./assets/fonts"),
		AdminPhone:    env("ADMIN_PHONE", "+998901234567"),
		AdminPassword: env("ADMIN_PASSWORD", "admin123"),
		MaxUploadMB:   envInt("MAX_UPLOAD_MB", 210),
	}
}
