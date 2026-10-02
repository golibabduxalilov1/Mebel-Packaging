// Package platform: konfiguratsiya, ma'lumotlar bazasi, modellar va HTTP yordamchilari.
package platform

import (
	"os"
	"strconv"
)

type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	JWTHours      int
	StorageDir    string // yuklangan manba fayllar
	StaticDir     string // Next.js statik eksport (frontend/out)
	FontsDir      string // PDF uchun DejaVu shriftlari
	AdminPassword string // birinchi ishga tushirishda admin paroli
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

func LoadConfig() Config {
	return Config{
		Port:          env("PORT", "8080"),
		DatabaseURL:   env("DATABASE_URL", "postgres://bazis:bazis@localhost:5432/bazis_upokovka?sslmode=disable"),
		JWTSecret:     env("JWT_SECRET", "dev-secret-ozgartiring"),
		JWTHours:      envInt("JWT_HOURS", 12),
		StorageDir:    env("STORAGE_DIR", "./data/files"),
		StaticDir:     env("STATIC_DIR", "../frontend/out"),
		FontsDir:      env("FONTS_DIR", "./assets/fonts"),
		AdminPassword: env("ADMIN_PASSWORD", "admin123"),
		MaxUploadMB:   envInt("MAX_UPLOAD_MB", 210),
	}
}
