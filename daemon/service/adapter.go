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

func adapterFromProps(path dbus.ObjectPath, props map[string]dbus.Variant) Adapter {
	alias, _ := props["Alias"].Value().(string)
	powered, _ := props["Powered"].Value().(bool)
	discovering, _ := props["Discovering"].Value().(bool)
	return Adapter{
		Path:        path,
		Alias:       alias,
		Powered:     powered,
		Discovering: discovering,
	}
}