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

func (a Adapter) toDBusStruct() any {
	return struct {
		Path        dbus.ObjectPath
		Alias       string
		Powered     bool
		Discovering bool
	}{
		a.Path, a.Alias, a.Powered, a.Discovering,
	}
}
