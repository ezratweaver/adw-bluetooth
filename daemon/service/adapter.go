package service

import (
	"github.com/godbus/dbus/v5"
)

type Adapter struct {
	Path        dbus.ObjectPath
	Alias       string
	Powered     bool
	Discovering bool
}
