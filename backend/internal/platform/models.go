package platform

import (
	"time"

	"gorm.io/datatypes"
)

// Ruxsat kodlari (TZ 2-bo'lim).
var AllPermissions = []struct{ Code, UZ, RU string }{
	{"P1", "Fayl import qilish", "Импорт файлов"},
	{"P2", "Detallarni tahrirlash", "Редактирование деталей"},
	{"P3", "Birlashtirish", "Объединение"},
	{"P4", "Yelimlash", "Склейка"},
	{"P5", "Upokovkani ishga tushirish", "Запуск упаковки"},
	{"P6", "Karton sozlamalari", "Настройки коробок"},
	{"P7", "Natijani tahrirlash", "Правка результата"},
	{"P8", "Eksport (hisobot, yorliq)", "Экспорт (отчёт, этикетки)"},
	{"P9", "Tarixni ko'rish", "Просмотр истории"},
	{"P10", "Foydalanuvchi va rollar", "Пользователи и роли"},
	{"P11", "Upokovka muhitida belgilash (Joylandi, Tayyor)", "Отметки в среде упаковки (Уложено, Готово)"},
}

type Role struct {
	ID          uint             `gorm:"primaryKey" json:"id"`
	Name        string           `gorm:"size:100;uniqueIndex;not null" json:"name"`
	Description string           `gorm:"size:500" json:"description"`
	System      bool             `json:"system"`
	Permissions []RolePermission `gorm:"constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt   time.Time        `json:"createdAt"`
}

type RolePermission struct {
	ID     uint   `gorm:"primaryKey"`
	RoleID uint   `gorm:"index;not null"`
	Code   string `gorm:"size:8;not null"`
}

type User struct {
	ID           uint   `gorm:"primaryKey"`
	Login        string `gorm:"size:100;uniqueIndex;not null"`
	FullName     string `gorm:"size:200"`
	PasswordHash string `gorm:"size:200;not null"`
	RoleID       uint   `gorm:"index;not null"`
	Role         Role   `gorm:"constraint:OnDelete:RESTRICT"`
	Lang         string `gorm:"size:2;default:uz"`
	Active       bool   `gorm:"default:true"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Material struct {
	ID          uint     `gorm:"primaryKey" json:"id"`
	Name        string   `gorm:"size:200;uniqueIndex;not null" json:"name"`
	Method      string   `gorm:"size:10;not null;default:density" json:"method"` // density | sheet | manual
	Density     *float64 `json:"density"`                                        // kg/m3
	SheetL      *float64 `json:"sheetL"`                                         // mm
	SheetW      *float64 `json:"sheetW"`                                         // mm
	SheetWeight *float64 `json:"sheetWeight"`                                    // kg
}

// Order: buyurtma (F30). Manba fayl serverda saqlanadi, import brauzerda bajariladi.
type Order struct {
	ID            uint   `gorm:"primaryKey"`
	Number        string `gorm:"size:30;uniqueIndex;not null"`
	Name          string `gorm:"size:300"`
	Client        string `gorm:"size:300;index"`
	Note          string `gorm:"size:1000"`
	FileName      string `gorm:"size:300"`
	Format        string `gorm:"size:10"`
	FileSize      int64
	Status        string `gorm:"size:10;default:new;index"` // new | lab | packed | done
	PartsCount    int
	BoxesCount    int
	Gabarit       string `gorm:"size:60"`
	ImportOptions datatypes.JSON
	CreatedByID   *uint     `gorm:"index"`
	CreatedBy     *User     `gorm:"constraint:OnDelete:SET NULL"`
	CreatedAt     time.Time `gorm:"index"`
	UpdatedAt     time.Time
}

type OrderFile struct {
	ID      uint   `gorm:"primaryKey"`
	OrderID uint   `gorm:"index;not null"`
	Name    string `gorm:"size:300"`
	Size    int64
	Main    bool
	Path    string `gorm:"size:500"` // STORAGE_DIR ga nisbatan
}

// LabDoc: laboratoriya hujjati (tahrirlar, qatorlar, kompozitlar) va upokovka uchun elementlar.
type LabDoc struct {
	OrderID   uint `gorm:"primaryKey"`
	Doc       datatypes.JSON
	Items     datatypes.JSON // []PackItemIn
	Signature string         `gorm:"size:40"`
	UpdatedAt time.Time
}

// SceneState: kamera, yashirilgan detallar, rejim (W9).
type SceneState struct {
	OrderID   uint `gorm:"primaryKey"`
	Data      datatypes.JSON
	UpdatedAt time.Time
}

// Part: detallar xulosasi (hisobot va qidiruv uchun). Asl geometriya manba faylda.
type Part struct {
	ID       uint   `gorm:"primaryKey"`
	OrderID  uint   `gorm:"index;not null"`
	PartID   string `gorm:"size:40;not null"`
	Name     string `gorm:"size:300"`
	Material string `gorm:"size:200"`
	Kind     string `gorm:"size:10"`
	L        *float64
	W        *float64
	T        *float64
	Weight   *float64
	RowID    string `gorm:"size:60;index"`
}

// PartMerge: birlashtirilgan qator a'zoligi (F14/F15).
type PartMerge struct {
	ID      uint   `gorm:"primaryKey"`
	OrderID uint   `gorm:"index;not null"`
	RowID   string `gorm:"size:60;not null"`
	PartID  string `gorm:"size:40;not null"`
	Manual  bool
	Qty     *int
}

// Composite: yelimlangan birlik (F19). Members: [{partId, matrix, fromRow}].
type Composite struct {
	ID         uint   `gorm:"primaryKey"`
	OrderID    uint   `gorm:"index;not null"`
	CompID     string `gorm:"size:60;not null"`
	Name       string `gorm:"size:300"`
	MainPartID string `gorm:"size:40"`
	Members    datatypes.JSON
}

// GlueLink: yelimlash bog'lanishi. Data: {main, attached[]}: asosiy detal va unga biriktirilgan detallar. Siljish va burilish saqlanmaydi (detallar joyida qoladi).
type GlueLink struct {
	ID      uint   `gorm:"primaryKey"`
	OrderID uint   `gorm:"index;not null"`
	CompID  string `gorm:"size:60;index"`
	Data    datatypes.JSON
}

// PackingSettings: buyurtma bo'yicha sozlamalar (F21). Tizim standarti AppSetting("packing") da (F31).
type PackingSettings struct {
	OrderID   uint `gorm:"primaryKey;autoIncrement:false"`
	Data      datatypes.JSON
	UpdatedAt time.Time
}

// AppSetting: tizim sozlamalari (kalit-qiymat).
type AppSetting struct {
	Key       string `gorm:"primaryKey;size:60"`
	Data      datatypes.JSON
	UpdatedAt time.Time
}

type Box struct {
	ID            uint `gorm:"primaryKey"`
	OrderID       uint `gorm:"index;not null"`
	No            int
	L, W, H       float64
	InnerL        float64
	InnerW        float64
	InnerH        float64
	Weight        float64
	MaxWeight     float64
	LimitOverride *float64
	Fill          float64
	Group         string    `gorm:"size:60;index"` // alohida upokovka guruhi id (bo'sh = umumiy)
	GroupName     string    `gorm:"size:200"`
	Ready         bool      // operator "Tayyor" belgisi
	Items         []BoxItem `gorm:"constraint:OnDelete:CASCADE"`
}

type BoxItem struct {
	ID       uint   `gorm:"primaryKey"`
	BoxID    uint   `gorm:"index;not null"`
	OrderID  uint   `gorm:"index;not null"`
	UID      string `gorm:"size:80"`
	RefKind  string `gorm:"size:10"`
	RefUID   string `gorm:"size:60"`
	Name     string `gorm:"size:300"`
	Material string `gorm:"size:200"`
	Color    string `gorm:"size:9"`
	X, Y, Z  float64
	L, W, H  float64
	Rotated  bool
	Layer    int
	Weight   float64
	// Joylashuv: L,W,H = karton o'qlari bo'yicha o'lcham; UL,UW,UT = detalning o'z o'lchamlari (L >= W >= T).
	UL, UW, UT float64
	Orient     int
	Pose       string `gorm:"size:10"` // flat | upright
	Up         string `gorm:"size:2"`
	Step       int
	Host       string         `gorm:"size:80"` // ichiga joylangan bo'lsa tashqi detal UID
	Done       bool           // operator "Joylandi" belgisi
	ArtPos     string         `gorm:"size:100"`
	Geom       string         `gorm:"size:10"`
	GroupID    string         `gorm:"size:60"`
	Cavities   datatypes.JSON // detal ichidagi bo'shliqlar (detal o'qlarida)
}

// PackRun: oxirgi hisoblash meta-ma'lumoti (ogohlantirishlar, imzo).
type PackRun struct {
	OrderID    uint `gorm:"primaryKey;autoIncrement:false"`
	Warnings   datatypes.JSON
	Unplaced   datatypes.JSON
	Signature  string `gorm:"size:40"`
	ComputedAt time.Time
}

func AllModels() []any {
	return []any{&Role{}, &RolePermission{}, &User{}, &Material{}, &Order{}, &OrderFile{}, &LabDoc{}, &SceneState{},
		&Part{}, &PartMerge{}, &Composite{}, &GlueLink{}, &PackingSettings{}, &AppSetting{}, &Box{}, &BoxItem{}, &PackRun{}}
}
