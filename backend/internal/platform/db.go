package platform

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

// PackSettings: frontend dagi PackSettings bilan bir xil JSON.
type PackSettings struct {
	MaxWeight       float64            `json:"maxWeight"`
	SizeMode        string             `json:"sizeMode"` // auto | manual
	MaxL            float64            `json:"maxL"`
	MaxW            float64            `json:"maxW"`
	MaxH            float64            `json:"maxH"`
	BoxL            float64            `json:"boxL"`
	BoxW            float64            `json:"boxW"`
	BoxH            float64            `json:"boxH"`
	Padding         float64            `json:"padding"`
	Wall            float64            `json:"wall"`
	IncludeHardware bool               `json:"includeHardware"`
	BoxLimits       map[string]float64 `json:"boxLimits"`
}

func DefaultPackSettings() PackSettings {
	return PackSettings{MaxWeight: 30, SizeMode: "auto", MaxL: 2800, MaxW: 1200, MaxH: 600, BoxL: 2000, BoxW: 600, BoxH: 300,
		Padding: 10, Wall: 5, IncludeHardware: false, BoxLimits: map[string]float64{}}
}

func Connect(cfg Config) (*gorm.DB, error) {
	var db *gorm.DB
	var err error
	// Docker'da Postgres keyinroq ko'tarilishi mumkin: bir necha marta urinamiz
	for i := 0; i < 15; i++ {
		db, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{Logger: logger.New(
			log.New(os.Stdout, "\r\n", log.LstdFlags),
			logger.Config{
				SlowThreshold:             200 * time.Millisecond,
				LogLevel:                  logger.Warn,
				IgnoreRecordNotFoundError: true, // "bor bo'lsa ol" so'rovlari xato emas
			},
		)})
		if err == nil {
			break
		}
		log.Printf("bazaga ulanib bo'lmadi (%v), qayta urinish...", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, err
	}
	if err := db.AutoMigrate(AllModels()...); err != nil {
		return nil, fmt.Errorf("migratsiya: %w", err)
	}
	if err := seed(db, cfg); err != nil {
		return nil, fmt.Errorf("boshlang'ich ma'lumot: %w", err)
	}
	return db, nil
}

func f(v float64) *float64 { return &v }

func seed(db *gorm.DB, cfg Config) error {
	var n int64
	db.Model(&Role{}).Count(&n)
	if n == 0 {
		roles := []struct {
			name, desc string
			perms      []string
		}{
			{"Administrator", "Barcha huquqlar", []string{"P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"}},
			{"Texnolog", "Import, tahrirlash, birlashtirish, yelimlash", []string{"P1", "P2", "P3", "P4", "P5", "P8", "P9"}},
			{"Qadoqlovchi", "Upokovka, natijani tahrirlash, eksport", []string{"P5", "P6", "P7", "P8", "P9"}},
			{"Kuzatuvchi", "Faqat ko'rish", []string{"P9"}},
		}
		for i, r := range roles {
			role := Role{Name: r.name, Description: r.desc, System: i == 0}
			for _, p := range r.perms {
				role.Permissions = append(role.Permissions, RolePermission{Code: p})
			}
			if err := db.Create(&role).Error; err != nil {
				return err
			}
		}
	}
	db.Model(&User{}).Count(&n)
	if n == 0 {
		var admin Role
		if err := db.Where(`"system" = ?`, true).First(&admin).Error; err != nil {
			return err
		}
		h, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if err := db.Create(&User{Login: "admin", FullName: "Administrator", PasswordHash: string(h), RoleID: admin.ID, Lang: "uz", Active: true}).Error; err != nil {
			return err
		}
		log.Printf("admin foydalanuvchisi yaratildi (login: admin). Parolni darhol o'zgartiring.")
	}
	db.Model(&Material{}).Count(&n)
	if n == 0 {
		// Taxminiy zichliklar: haqiqiy qiymatlarni ishlab chiqaruvchi ma'lumotiga ko'ra tekshirib to'g'rilang.
		mats := []Material{
			{Name: "ЛДСП 16", Method: "density", Density: f(730)},
			{Name: "ЛДСП 18", Method: "density", Density: f(720)},
			{Name: "ЛДСП 25", Method: "density", Density: f(680)},
			{Name: "МДФ 16", Method: "density", Density: f(750)},
			{Name: "МДФ 19", Method: "density", Density: f(740)},
			{Name: "ХДФ 3", Method: "sheet", SheetL: f(2800), SheetW: f(2070), SheetWeight: f(14.8)},
			{Name: "ДВП 3", Method: "sheet", SheetL: f(2745), SheetW: f(1700), SheetWeight: f(11.9)},
			{Name: "Стекло 4", Method: "density", Density: f(2500)},
		}
		if err := db.Create(&mats).Error; err != nil {
			return err
		}
	}
	db.Model(&AppSetting{}).Where("key = ?", "packing").Count(&n)
	if n == 0 {
		b, _ := json.Marshal(DefaultPackSettings())
		if err := db.Create(&AppSetting{Key: "packing", Data: datatypes.JSON(b)}).Error; err != nil {
			return err
		}
	}
	return nil
}

// LoadPackSettings: buyurtma sozlamasi (orderID > 0), bo'lmasa tizim standarti.
func LoadPackSettings(db *gorm.DB, orderID uint) PackSettings {
	s := DefaultPackSettings()
	var data datatypes.JSON
	if orderID > 0 {
		var ps PackingSettings
		if err := db.First(&ps, "order_id = ?", orderID).Error; err == nil {
			data = ps.Data
		}
	}
	if data == nil {
		var a AppSetting
		if err := db.First(&a, "key = ?", "packing").Error; err == nil {
			data = a.Data
		}
	}
	if data != nil {
		_ = json.Unmarshal(data, &s)
	}
	if s.BoxLimits == nil {
		s.BoxLimits = map[string]float64{}
	}
	return s
}

// SavePackSettings: orderID = 0 bo'lsa tizim standarti saqlanadi.
func SavePackSettings(db *gorm.DB, orderID uint, s PackSettings) error {
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	now := time.Now()
	if orderID == 0 {
		return db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "key"}}, DoUpdates: clause.AssignmentColumns([]string{"data", "updated_at"})}).
			Create(&AppSetting{Key: "packing", Data: datatypes.JSON(b), UpdatedAt: now}).Error
	}
	return db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "order_id"}}, DoUpdates: clause.AssignmentColumns([]string{"data", "updated_at"})}).
		Create(&PackingSettings{OrderID: orderID, Data: datatypes.JSON(b), UpdatedAt: now}).Error
}

// ValidatePackSettings: noto'g'ri qiymatlarni rad etadi.
func ValidatePackSettings(s *PackSettings) error {
	if s.MaxWeight <= 0 {
		return fmt.Errorf("og'irlik limiti musbat bo'lishi kerak")
	}
	if s.SizeMode != "auto" && s.SizeMode != "manual" {
		s.SizeMode = "auto"
	}
	if s.Padding < 0 || s.Wall < 0 {
		return fmt.Errorf("bo'shliq va karton qalinligi manfiy bo'lmasin")
	}
	if s.SizeMode == "auto" && (s.MaxL <= 0 || s.MaxW <= 0 || s.MaxH <= 0) {
		return fmt.Errorf("avto rejimda maksimal o'lchamlar musbat bo'lishi kerak")
	}
	if s.SizeMode == "manual" && (s.BoxL <= 2*s.Padding || s.BoxW <= 2*s.Padding || s.BoxH <= 2*s.Padding) {
		return fmt.Errorf("quti o'lchami bo'shliqdan katta bo'lishi kerak")
	}
	if s.BoxLimits == nil {
		s.BoxLimits = map[string]float64{}
	}
	return nil
}
