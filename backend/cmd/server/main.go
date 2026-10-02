// Bazis upokovka serveri: REST API (/api) va frontend statik fayllari, bitta port.
package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"bazis-upokovka/internal/admin"
	"bazis-upokovka/internal/auth"
	"bazis-upokovka/internal/eksport"
	"bazis-upokovka/internal/materials"
	"bazis-upokovka/internal/model"
	"bazis-upokovka/internal/platform"
	"bazis-upokovka/internal/tarix"
	"bazis-upokovka/internal/upokovka"
	"bazis-upokovka/internal/web"
)

func main() {
	cfg := platform.LoadConfig()
	if err := os.MkdirAll(cfg.StorageDir, 0o755); err != nil {
		log.Fatalf("STORAGE_DIR: %v", err)
	}
	db, err := platform.Connect(cfg)
	if err != nil {
		log.Fatalf("baza: %v", err)
	}
	if cfg.JWTSecret == "dev-secret-ozgartiring" {
		log.Printf("OGOHLANTIRISH: JWT_SECRET o'rnatilmagan, ishlab chiqarishda albatta o'zgartiring")
	}
	a := &platform.App{DB: db, Cfg: cfg}

	app := fiber.New(fiber.Config{
		AppName:      "Bazis upokovka",
		BodyLimit:    (cfg.MaxUploadMB + 10) * 1024 * 1024,
		ReadTimeout:  5 * time.Minute,
		WriteTimeout: 5 * time.Minute,
		ErrorHandler: platform.ErrorHandler,
	})
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{Format: "${time} ${status} ${method} ${path} ${latency}\n"}))
	app.Use(compress.New())

	authH := auth.Handlers{App: a}
	adminH := admin.Handlers{App: a}
	matH := materials.Handlers{App: a}
	ordH := tarix.Handlers{App: a}
	labH := model.Handlers{App: a, Orders: ordH}
	packH := upokovka.Handlers{App: a}
	expH := eksport.Handlers{App: a}
	need := platform.Need

	api := app.Group("/api")
	api.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) })
	api.Post("/auth/login", authH.Login)

	p := api.Group("", a.RequireAuth())
	p.Get("/auth/me", authH.Me)
	p.Post("/auth/password", authH.Password)
	p.Put("/auth/lang", authH.Lang)
	p.Put("/auth/profile", authH.Profile)

	// F2, F3: foydalanuvchilar va rollar
	p.Get("/users", need("P10"), adminH.Users)
	p.Post("/users", need("P10"), adminH.CreateUser)
	p.Put("/users/:id", need("P10"), adminH.UpdateUser)
	p.Delete("/users/:id", need("P10"), adminH.DeleteUser)
	p.Get("/roles", need("P10"), adminH.Roles)
	p.Post("/roles", need("P10"), adminH.CreateRole)
	p.Put("/roles/:id", need("P10"), adminH.UpdateRole)
	p.Delete("/roles/:id", need("P10"), adminH.DeleteRole)
	p.Get("/permissions", need("P10"), adminH.Permissions)

	// F16, F31: materiallar va standart sozlamalar
	p.Get("/materials", matH.List)
	p.Post("/materials", need("P6", "P10"), matH.Create)
	p.Put("/materials/:id", need("P6", "P10"), matH.Update)
	p.Delete("/materials/:id", need("P6", "P10"), matH.Delete)
	p.Get("/settings/packing", matH.GetDefaults)
	p.Put("/settings/packing", need("P6"), matH.SaveDefaults)

	// F30: buyurtmalar tarixi
	p.Get("/orders", need("P9", "P1"), ordH.List)
	p.Post("/orders", need("P1"), ordH.Create)
	p.Get("/orders/:id", need("P9", "P1"), ordH.Get)
	p.Put("/orders/:id", need("P1", "P2"), ordH.Update)
	p.Delete("/orders/:id", need("P1"), ordH.Delete)
	p.Post("/orders/:id/duplicate", need("P1"), ordH.Duplicate)
	p.Get("/orders/:id/files/:fid", need("P9", "P1"), ordH.File)

	// F13-F20: laboratoriya (ichida P2/P3/P4 alohida tekshiriladi)
	p.Get("/orders/:id/lab", need("P9", "P1"), labH.Get)
	p.Put("/orders/:id/lab", need("P2", "P3", "P4", "P9"), labH.Put)

	// F21-F27: upokovka
	p.Get("/orders/:id/pack", need("P9", "P5"), packH.Get)
	p.Put("/orders/:id/pack/settings", need("P6"), packH.SaveSettings)
	p.Post("/orders/:id/pack/run", need("P5"), packH.Run)
	p.Post("/orders/:id/pack/move", need("P7"), packH.Move)
	p.Put("/orders/:id/pack/box/:no", need("P7"), packH.BoxLimit)

	// F28, F29: eksport
	p.Get("/orders/:id/export/report.xlsx", need("P8"), expH.ReportXLSX)
	p.Get("/orders/:id/export/report.pdf", need("P8"), expH.ReportPDF)
	p.Get("/orders/:id/export/labels.pdf", need("P8"), expH.LabelsPDF)

	// frontend
	app.Use(web.Handler(cfg.StaticDir))

	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
		<-ch
		log.Println("to'xtatilmoqda...")
		_ = app.ShutdownWithTimeout(10 * time.Second)
	}()
	log.Printf("Bazis upokovka: http://localhost:%s (statik: %s)", cfg.Port, cfg.StaticDir)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
